import { MemoryCloudAdapter } from "@pocket/sync-engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeCloudChunks,
  encodeCloudChunks,
  MAX_IMAGE_SOURCE_BYTES,
  prepareImage,
  validateImageFile,
} from "./index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

describe("image upload preparation", () => {
  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])("accepts a valid %s signature", async (type, signature) => {
    const file = new File([new Uint8Array(signature)], "photo", { type });
    await expect(validateImageFile(file)).resolves.toBe(type);
  });

  it("rejects spoofed, empty, and oversized images before upload", async () => {
    const spoofed = new File([new Uint8Array([0xff, 0xd8, 0xff])], "fake.png", {
      type: "image/png",
    });
    await expect(validateImageFile(spoofed)).rejects.toThrow("không khớp");
    await expect(
      validateImageFile(new File([], "empty.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow("tệp rỗng");
    const oversized = new File([new Uint8Array(MAX_IMAGE_SOURCE_BYTES + 1)], "large.jpg", {
      type: "image/jpeg",
    });
    await expect(validateImageFile(oversized)).rejects.toThrow("8 MB");
  });

  it("falls back to an image element when createImageBitmap fails", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported")));
    vi.stubGlobal(
      "Image",
      class {
        decoding = "";
        naturalWidth = 800;
        naturalHeight = 400;
        width = 800;
        height = 400;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: type ?? "image/png" }));
    });
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new Uint8Array(32).buffer);

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "photo.jpg", {
      type: "image/jpeg",
    });
    const prepared = await prepareImage(file);

    expect(drawImage).toHaveBeenCalledOnce();
    expect(prepared).toMatchObject({ width: 800, height: 400, contentType: "image/webp" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-image");
  });
});
