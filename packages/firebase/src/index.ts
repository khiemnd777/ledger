import type { CloudFileAdapter } from "@pocket/sync-engine";
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  type Auth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import {
  connectStorageEmulator,
  type FirebaseStorage,
  getBytes,
  getStorage,
  listAll,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from "firebase/storage";

export interface FirebaseClients {
  app: FirebaseApp;
  auth: Auth;
  storage: FirebaseStorage;
}

let cached: FirebaseClients | undefined;

export function hasFirebaseConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
}

export function getFirebaseClients(): FirebaseClients | undefined {
  if (!hasFirebaseConfig()) return undefined;
  if (cached) return cached;
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    });
  const auth = getAuth(app);
  const storage = getStorage(app);
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
    try {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectStorageEmulator(storage, "127.0.0.1", 9199);
    } catch {
      // Firebase only permits emulator connection once during initialization.
    }
  } else if (import.meta.env.PROD && import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  cached = { app, auth, storage };
  return cached;
}

export const authApi = {
  signInEmail: (email: string, password: string) => {
    const clients = getFirebaseClients();
    if (!clients) throw new Error("Firebase chưa được cấu hình");
    return signInWithEmailAndPassword(clients.auth, email, password);
  },
  signUpEmail: (email: string, password: string) => {
    const clients = getFirebaseClients();
    if (!clients) throw new Error("Firebase chưa được cấu hình");
    return createUserWithEmailAndPassword(clients.auth, email, password);
  },
  signInGoogle: () => {
    const clients = getFirebaseClients();
    if (!clients) throw new Error("Firebase chưa được cấu hình");
    return signInWithPopup(clients.auth, new GoogleAuthProvider());
  },
  resetPassword: (email: string) => {
    const clients = getFirebaseClients();
    if (!clients) throw new Error("Firebase chưa được cấu hình");
    return sendPasswordResetEmail(clients.auth, email);
  },
  signOut: () => {
    const clients = getFirebaseClients();
    return clients ? firebaseSignOut(clients.auth) : Promise.resolve();
  },
};

export class FirebaseCloudAdapter implements CloudFileAdapter {
  constructor(private readonly storage: FirebaseStorage) {}
  async upload(path: string, data: Uint8Array, contentType: string) {
    await uploadBytes(ref(this.storage, path), data, {
      contentType,
      cacheControl: "private,max-age=31536000,immutable",
    });
  }
  async download(path: string) {
    return new Uint8Array(await getBytes(ref(this.storage, path), 50 * 1024 * 1024));
  }
  async list(prefix: string) {
    const result = await listAll(ref(this.storage, prefix));
    return result.items.map((item) => ({ path: item.fullPath }));
  }
}

const SUPPORTED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareImage(file: File, maxDimension = 1600) {
  if (!SUPPORTED_IMAGES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Ảnh phải nhỏ hơn 8 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Trình duyệt không thể xử lý ảnh.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Không thể nén ảnh."))),
      "image/webp",
      0.82,
    ),
  );
  const checksum = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hash = [...new Uint8Array(checksum)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { blob, hash, width, height };
}

export async function uploadProductImage(input: {
  ownerUid: string;
  shopId: string;
  productId: string;
  file: File;
  onProgress?: (percent: number) => void;
}) {
  const clients = getFirebaseClients();
  if (!clients) throw new Error("Firebase Storage chưa được cấu hình.");
  const prepared = await prepareImage(input.file);
  const path = `users/${input.ownerUid}/shops/${input.shopId}/product-images/${input.productId}/${prepared.hash}.webp`;
  const task = uploadBytesResumable(ref(clients.storage, path), prepared.blob, {
    contentType: "image/webp",
    cacheControl: "private,max-age=31536000,immutable",
    customMetadata: {
      contentHash: prepared.hash,
      width: String(prepared.width),
      height: String(prepared.height),
    },
  });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) =>
        input.onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      resolve,
    );
  });
  return { path, hash: prepared.hash };
}
