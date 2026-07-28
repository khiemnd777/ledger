import { describe, expect, it } from "vitest";
import { crc16, createQrPayload, parseQrPayload } from "./index";

describe("SỔ TAY QR protocol", () => {
  it("creates and parses a versioned payload", () => {
    const variantId = "018f4a12-3488-7def-8023-8a24b8e96f4a";
    const payload = createQrPayload(variantId);
    expect(payload).toBe(`PKT1:${variantId}:${crc16(`PKT1:${variantId}`)}`);
    expect(parseQrPayload(payload)).toMatchObject({ version: "PKT1", variantId });
  });

  it("rejects tampering and unsupported versions", () => {
    expect(() => parseQrPayload("PKT1:018f4a12-3488-7def-8023-8a24b8e96f4a:0000")).toThrow(
      "Mã QR bị lỗi",
    );
    expect(() => parseQrPayload("PKT2:018f4a12-3488-7def-8023-8a24b8e96f4a:0000")).toThrow(
      "chưa được hỗ trợ",
    );
  });
});
