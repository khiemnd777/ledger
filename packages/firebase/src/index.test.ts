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
});
