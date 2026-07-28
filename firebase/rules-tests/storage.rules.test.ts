import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pocket-rules-test",
    storage: { rules: readFileSync("firebase/storage.rules", "utf8") },
  });
});
beforeEach(() => env?.clearStorage());
afterAll(() => env?.cleanup());

const validSnapshot = "users/user-a/shops/shop-a/snapshots/2026/07/snapshot-test.json.gz";
describe("Firebase Storage tenant isolation", () => {
  it("allows an owner to upload and read an immutable snapshot", async () => {
    const storage = env.authenticatedContext("user-a").storage();
    await assertSucceeds(
      storage.ref(validSnapshot).put(new Uint8Array([31, 139]), {
        contentType: "application/gzip",
      }),
    );
    await assertSucceeds(storage.ref(validSnapshot).getDownloadURL());
  });
  it("denies cross-user read and write", async () => {
    const storage = env.authenticatedContext("user-a").storage();
    await assertFails(
      storage.ref(validSnapshot.replace("user-a", "user-b")).put(new Uint8Array([1]), {
        contentType: "application/gzip",
      }),
    );
    await assertFails(storage.ref(validSnapshot.replace("user-a", "user-b")).getDownloadURL());
  });
  it("denies unauthenticated access", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(
      storage.ref(validSnapshot).put(new Uint8Array([1]), {
        contentType: "application/gzip",
      }),
    );
  });
  it("rejects invalid MIME types and oversized images", async () => {
    const storage = env.authenticatedContext("user-a").storage();
    const imagePath = "users/user-a/shops/shop-a/product-images/product-a/file.webp";
    await assertFails(
      storage.ref(imagePath).put(new Uint8Array([1]), { contentType: "text/html" }),
    );
    await assertFails(
      storage.ref(imagePath).put(new Uint8Array(8 * 1024 * 1024), {
        contentType: "image/webp",
      }),
    );
  });
  it("allows a valid product image", async () => {
    const storage = env.authenticatedContext("user-a").storage();
    await assertSucceeds(
      storage
        .ref("users/user-a/shops/shop-a/product-images/product-a/file.webp")
        .put(new Uint8Array([1, 2, 3]), { contentType: "image/webp" }),
    );
  });
});
