import { MemoryCloudAdapter } from "@pocket/sync-engine";
import { describe, expect, it } from "vitest";
import { decodeCloudChunks, encodeCloudChunks } from "./index";

describe("Realtime Database cloud chunks", () => {
  it("round-trips a payload across multiple chunks", () => {
    const source = new Uint8Array(1_100_000);
    for (let index = 0; index < source.length; index += 1) source[index] = index % 251;
    const chunks = encodeCloudChunks(source);
    expect(Object.keys(chunks)).toHaveLength(3);
    expect(decodeCloudChunks(chunks, 3)).toEqual(source);
  });

  it("rejects an incomplete payload", () => {
    expect(() => decodeCloudChunks({ 0: "AQID" }, 2)).toThrow("thiếu dữ liệu");
  });

  it("deletes a cloud file through the shared adapter contract", async () => {
    const cloud = new MemoryCloudAdapter();
    await cloud.upload("users/a/shops/s/images/one.webp", new Uint8Array([1, 2]));
    await cloud.delete("users/a/shops/s/images/one.webp");
    await expect(cloud.download("users/a/shops/s/images/one.webp")).rejects.toThrow(
      "File not found",
    );
  });
});
