import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pocket-rules-test",
    database: { rules: readFileSync("firebase/database.rules.json", "utf8") },
  });
});
beforeEach(() => env?.clearDatabase());
afterAll(() => env?.cleanup());

const fileId = "a".repeat(64);
const indexPath = `users/user-a/cloudFileIndex/${fileId}`;
const blobPath = `users/user-a/cloudFileBlobs/${fileId}`;
const validMetadata = {
  version: 1,
  path: "users/user-a/shops/shop-a/snapshots/2026/07/snapshot-test.json.gz",
  contentType: "application/gzip",
  byteSize: 2,
  chunkCount: 1,
  checksum: "b".repeat(64),
  updatedAt: "2026-07-28T12:00:00.000Z",
};

describe("Realtime Database tenant isolation", () => {
  it("allows an owner to create and read an immutable cloud file", async () => {
    const database = env.authenticatedContext("user-a").database();
    await assertSucceeds(
      update(ref(database), {
        [indexPath]: validMetadata,
        [blobPath]: { 0: "H4sI" },
      }),
    );
    await assertSucceeds(get(ref(database, indexPath)));
    await assertSucceeds(get(ref(database, blobPath)));
  });

  it("denies cross-user read and write", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), indexPath), validMetadata);
    });
    const database = env.authenticatedContext("user-b").database();
    await assertFails(get(ref(database, indexPath)));
    await assertFails(
      set(ref(database, `users/user-a/cloudFileIndex/${"c".repeat(64)}`), validMetadata),
    );
  });

  it("denies unauthenticated access", async () => {
    const database = env.unauthenticatedContext().database();
    await assertFails(set(ref(database, indexPath), validMetadata));
    await assertFails(get(ref(database, indexPath)));
  });

  it("rejects oversized or unsupported metadata", async () => {
    const database = env.authenticatedContext("user-a").database();
    await assertFails(set(ref(database, indexPath), { ...validMetadata, byteSize: 8_388_609 }));
    await assertFails(
      set(ref(database, indexPath), { ...validMetadata, contentType: "text/html" }),
    );
  });

  it("rejects invalid or oversized chunks", async () => {
    const database = env.authenticatedContext("user-a").database();
    await assertFails(set(ref(database, blobPath), { 16: "invalid-index" }));
    await assertFails(set(ref(database, blobPath), { 0: "a".repeat(700_001) }));
  });

  it("prevents overwriting an existing cloud file", async () => {
    const database = env.authenticatedContext("user-a").database();
    await assertSucceeds(set(ref(database, indexPath), validMetadata));
    await assertFails(
      set(ref(database, indexPath), {
        ...validMetadata,
        updatedAt: "2026-07-28T12:01:00.000Z",
      }),
    );
  });
});
