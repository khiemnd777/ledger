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
  connectDatabaseEmulator,
  ref as databaseRef,
  type Database as FirebaseDatabase,
  get,
  getDatabase,
  update,
} from "firebase/database";

export interface FirebaseClients {
  app: FirebaseApp;
  auth: Auth;
  database: FirebaseDatabase;
}

let cached: FirebaseClients | undefined;

export function hasFirebaseConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID &&
      import.meta.env.VITE_FIREBASE_DATABASE_URL,
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
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    });
  const auth = getAuth(app);
  const database = getDatabase(app);
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
    try {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectDatabaseEmulator(database, "127.0.0.1", 9000);
    } catch {
      // Firebase only permits emulator connection once during initialization.
    }
  } else if (import.meta.env.PROD && import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  cached = { app, auth, database };
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

const CLOUD_CHUNK_BYTES = 512 * 1024;
export const MAX_CLOUD_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_SOURCE_BYTES = 8 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_SOURCE_PIXELS = 40_000_000;

interface CloudFileMetadata {
  version: 1;
  path: string;
  contentType: string;
  byteSize: number;
  chunkCount: number;
  checksum: string;
  updatedAt: string;
}

async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const checksum = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(checksum)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeCloudChunks(data: Uint8Array): Record<string, string> {
  const chunks: Record<string, string> = {};
  for (
    let offset = 0, index = 0;
    offset < data.byteLength;
    offset += CLOUD_CHUNK_BYTES, index += 1
  ) {
    chunks[String(index)] = toBase64(data.subarray(offset, offset + CLOUD_CHUNK_BYTES));
  }
  return chunks;
}

export function decodeCloudChunks(chunks: Record<string, string>, chunkCount: number): Uint8Array {
  const decoded: Uint8Array[] = [];
  let byteSize = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const value = chunks[String(index)];
    if (typeof value !== "string") throw new Error("Gói cloud thiếu dữ liệu.");
    const bytes = fromBase64(value);
    decoded.push(bytes);
    byteSize += bytes.byteLength;
  }
  const result = new Uint8Array(byteSize);
  let offset = 0;
  for (const bytes of decoded) {
    result.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return result;
}

function isCloudFileMetadata(value: unknown): value is CloudFileMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CloudFileMetadata>;
  return (
    candidate.version === 1 &&
    typeof candidate.path === "string" &&
    typeof candidate.contentType === "string" &&
    typeof candidate.byteSize === "number" &&
    typeof candidate.chunkCount === "number" &&
    typeof candidate.checksum === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

export class RealtimeDatabaseCloudAdapter implements CloudFileAdapter {
  constructor(
    private readonly database: FirebaseDatabase,
    private readonly ownerUid: string,
  ) {}

  private assertOwnedPath(path: string): void {
    if (!path.startsWith(`users/${this.ownerUid}/shops/`)) {
      throw new Error("Đường dẫn cloud không thuộc tài khoản hiện tại.");
    }
  }

  private async fileId(path: string): Promise<string> {
    this.assertOwnedPath(path);
    return sha256(path);
  }

  async upload(path: string, data: Uint8Array, contentType: string): Promise<void> {
    if (data.byteLength === 0) throw new Error("Không thể tải tệp rỗng lên cloud.");
    if (data.byteLength > MAX_CLOUD_FILE_BYTES) {
      throw new Error("Tệp cloud vượt giới hạn 8 MB của gói miễn phí.");
    }
    const [fileId, checksum] = await Promise.all([this.fileId(path), sha256(data)]);
    const indexPath = `users/${this.ownerUid}/cloudFileIndex/${fileId}`;
    const existingSnapshot = await get(databaseRef(this.database, indexPath));
    if (existingSnapshot.exists()) {
      const existing = existingSnapshot.val() as unknown;
      if (
        isCloudFileMetadata(existing) &&
        existing.path === path &&
        existing.checksum === checksum &&
        existing.byteSize === data.byteLength
      ) {
        return;
      }
      throw new Error("Đường dẫn cloud đã chứa một tệp khác.");
    }
    const chunks = encodeCloudChunks(data);
    const metadata: CloudFileMetadata = {
      version: 1,
      path,
      contentType,
      byteSize: data.byteLength,
      chunkCount: Object.keys(chunks).length,
      checksum,
      updatedAt: new Date().toISOString(),
    };
    await update(databaseRef(this.database), {
      [`users/${this.ownerUid}/cloudFileBlobs/${fileId}`]: chunks,
      [indexPath]: metadata,
    });
  }

  async downloadFile(path: string): Promise<{ data: Uint8Array; contentType: string }> {
    const fileId = await this.fileId(path);
    const [metadataSnapshot, chunksSnapshot] = await Promise.all([
      get(databaseRef(this.database, `users/${this.ownerUid}/cloudFileIndex/${fileId}`)),
      get(databaseRef(this.database, `users/${this.ownerUid}/cloudFileBlobs/${fileId}`)),
    ]);
    const metadata = metadataSnapshot.val() as unknown;
    if (!isCloudFileMetadata(metadata) || metadata.path !== path || !chunksSnapshot.exists()) {
      throw new Error("Không tìm thấy tệp cloud.");
    }
    const data = decodeCloudChunks(
      chunksSnapshot.val() as Record<string, string>,
      metadata.chunkCount,
    );
    if (data.byteLength !== metadata.byteSize || (await sha256(data)) !== metadata.checksum) {
      throw new Error("Tệp cloud không vượt qua kiểm tra toàn vẹn.");
    }
    return { data, contentType: metadata.contentType };
  }

  async download(path: string): Promise<Uint8Array> {
    return (await this.downloadFile(path)).data;
  }

  async list(prefix: string): Promise<Array<{ path: string; updatedAt?: string }>> {
    this.assertOwnedPath(prefix);
    const snapshot = await get(databaseRef(this.database, `users/${this.ownerUid}/cloudFileIndex`));
    const values = snapshot.val() as Record<string, unknown> | null;
    return Object.values(values ?? {})
      .filter(isCloudFileMetadata)
      .filter((item) => item.path.startsWith(prefix))
      .map((item) => ({ path: item.path, updatedAt: item.updatedAt }))
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  }

  async delete(path: string): Promise<void> {
    const fileId = await this.fileId(path);
    await update(databaseRef(this.database), {
      [`users/${this.ownerUid}/cloudFileBlobs/${fileId}`]: null,
      [`users/${this.ownerUid}/cloudFileIndex/${fileId}`]: null,
    });
  }
}

const SUPPORTED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);

type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

function normalizeImageType(type: string): string {
  return type.toLowerCase() === "image/jpg" ? "image/jpeg" : type.toLowerCase();
}

async function detectImageType(file: File): Promise<SupportedImageType | undefined> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return undefined;
}

export async function validateImageFile(file: File): Promise<SupportedImageType> {
  if (file.size === 0) throw new Error(`${file.name || "Ảnh"} là tệp rỗng.`);
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new Error(`${file.name || "Ảnh"} vượt giới hạn 8 MB.`);
  }
  const declaredType = normalizeImageType(file.type);
  if (declaredType && !SUPPORTED_IMAGES.has(declaredType)) {
    throw new Error(`${file.name || "Tệp"}: chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.`);
  }
  const detectedType = await detectImageType(file);
  if (!detectedType) {
    throw new Error(`${file.name || "Tệp"} không phải ảnh JPEG, PNG hoặc WebP hợp lệ.`);
  }
  if (declaredType && declaredType !== detectedType) {
    throw new Error(`${file.name || "Tệp"} có nội dung không khớp định dạng ảnh đã khai báo.`);
  }
  return detectedType;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Safari/WebView implementations can expose createImageBitmap but reject image options.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<DecodedImage>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () =>
        resolve({
          source: image,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          cleanup: () => URL.revokeObjectURL(objectUrl),
        });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Không thể đọc nội dung ảnh. Hãy chọn một ảnh khác."));
      };
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("Trình duyệt không hỗ trợ xuất ảnh đã nén."));
      return;
    }
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Không thể nén ảnh."))),
      type,
      quality,
    );
  });
}

function extensionForImageType(type: string): "webp" | "jpg" | "png" {
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  return "png";
}

export async function prepareImage(file: File, maxDimension = 1600) {
  await validateImageFile(file);
  if (!Number.isFinite(maxDimension) || maxDimension < 1) {
    throw new Error("Kích thước ảnh đầu ra không hợp lệ.");
  }
  const decoded = await decodeImage(file);
  if (
    decoded.width < 1 ||
    decoded.height < 1 ||
    decoded.width * decoded.height > MAX_IMAGE_SOURCE_PIXELS
  ) {
    decoded.cleanup();
    throw new Error("Kích thước ảnh không hợp lệ hoặc vượt quá 40 megapixel.");
  }
  const ratio = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * ratio));
  const height = Math.max(1, Math.round(decoded.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    decoded.cleanup();
    throw new Error("Trình duyệt không thể xử lý ảnh.");
  }
  try {
    context.drawImage(decoded.source, 0, 0, width, height);
  } finally {
    decoded.cleanup();
  }
  let blob = await canvasToBlob(canvas, "image/webp", 0.82);
  if (!SUPPORTED_IMAGES.has(blob.type)) blob = await canvasToBlob(canvas, "image/png");
  if (!SUPPORTED_IMAGES.has(blob.type) || blob.size === 0) {
    throw new Error("Trình duyệt không thể tạo ảnh JPEG, PNG hoặc WebP hợp lệ.");
  }
  const checksum = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hash = [...new Uint8Array(checksum)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    blob,
    hash,
    width,
    height,
    contentType: blob.type as SupportedImageType,
    extension: extensionForImageType(blob.type),
  };
}

export async function uploadProductImage(input: {
  ownerUid: string;
  shopId: string;
  productId: string;
  file: File;
  onProgress?: (percent: number) => void;
}) {
  const clients = getFirebaseClients();
  if (!clients) throw new Error("Firebase Realtime Database chưa được cấu hình.");
  if (!clients.auth.currentUser || clients.auth.currentUser.uid !== input.ownerUid) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tải ảnh.");
  }
  const prepared = await prepareImage(input.file);
  if (prepared.blob.size > MAX_CLOUD_FILE_BYTES) {
    throw new Error("Ảnh sau khi nén vẫn vượt giới hạn cloud 8 MB.");
  }
  const path = `users/${input.ownerUid}/shops/${input.shopId}/product-images/${input.productId}/${prepared.hash}.${prepared.extension}`;
  input.onProgress?.(30);
  await new RealtimeDatabaseCloudAdapter(clients.database, input.ownerUid).upload(
    path,
    new Uint8Array(await prepared.blob.arrayBuffer()),
    prepared.contentType,
  );
  input.onProgress?.(100);
  return { path, hash: prepared.hash };
}

export async function uploadExpenseAttachment(input: {
  ownerUid: string;
  shopId: string;
  expenseId: string;
  file: File;
  onProgress?: (percent: number) => void;
}) {
  const clients = getFirebaseClients();
  if (!clients) throw new Error("Firebase Realtime Database chưa được cấu hình.");
  if (!clients.auth.currentUser || clients.auth.currentUser.uid !== input.ownerUid) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tải ảnh.");
  }
  const prepared = await prepareImage(input.file);
  if (prepared.blob.size > MAX_CLOUD_FILE_BYTES) {
    throw new Error("Ảnh sau khi nén vẫn vượt giới hạn cloud 8 MB.");
  }
  const path = `users/${input.ownerUid}/shops/${input.shopId}/expense-attachments/${input.expenseId}/${prepared.hash}.${prepared.extension}`;
  input.onProgress?.(30);
  await new RealtimeDatabaseCloudAdapter(clients.database, input.ownerUid).upload(
    path,
    new Uint8Array(await prepared.blob.arrayBuffer()),
    prepared.contentType,
  );
  input.onProgress?.(100);
  return { path, hash: prepared.hash };
}

export async function deleteCloudFile(ownerUid: string, path: string): Promise<void> {
  const clients = getFirebaseClients();
  if (!clients) throw new Error("Firebase Realtime Database chưa được cấu hình.");
  await new RealtimeDatabaseCloudAdapter(clients.database, ownerUid).delete(path);
}

export async function downloadCloudImage(ownerUid: string, path: string): Promise<Blob> {
  const clients = getFirebaseClients();
  if (!clients) throw new Error("Firebase Realtime Database chưa được cấu hình.");
  if (!clients.auth.currentUser || clients.auth.currentUser.uid !== ownerUid) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem ảnh.");
  }
  const file = await new RealtimeDatabaseCloudAdapter(clients.database, ownerUid).downloadFile(
    path,
  );
  if (!SUPPORTED_IMAGES.has(file.contentType)) throw new Error("Tệp cloud không phải hình ảnh.");
  return new Blob([file.data as BlobPart], { type: file.contentType });
}
