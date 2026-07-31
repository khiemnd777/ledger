import { PocketError } from "@pocket/domain";
import QRCode from "qrcode";

const VERSION = "PKT1";

export function crc16(value: string): string {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function createQrPayload(variantId: string): string {
  const body = `${VERSION}:${variantId}`;
  return `${body}:${crc16(body)}`;
}

export interface ParsedQrPayload {
  version: "PKT1";
  variantId: string;
  checksum: string;
}

export function parseQrPayload(raw: string): ParsedQrPayload {
  const value = raw.trim();
  const parts = value.split(":");
  if (parts.length !== 3) {
    throw new PocketError(
      "INVALID_QR",
      "Mã QR không đúng định dạng SỔ TAY.",
      "Quét lại hoặc nhập SKU thủ công.",
    );
  }
  const [version, variantId, checksum] = parts;
  if (version !== VERSION) {
    throw new PocketError(
      "UNSUPPORTED_QR",
      "Phiên bản mã QR chưa được hỗ trợ.",
      "Cập nhật ứng dụng hoặc tạo lại tem QR.",
    );
  }
  if (!variantId || !/^[0-9a-z-]{8,}$/i.test(variantId)) {
    throw new PocketError(
      "INVALID_QR",
      "Mã size trong QR không hợp lệ.",
      "Quét lại tem đúng của sản phẩm.",
    );
  }
  const expected = crc16(`${version}:${variantId}`);
  if (checksum?.toUpperCase() !== expected) {
    throw new PocketError(
      "QR_CHECKSUM_MISMATCH",
      "Mã QR bị lỗi hoặc không đầy đủ.",
      "Lau camera và quét lại tem.",
    );
  }
  return { version, variantId, checksum: expected };
}

export async function generateQrSvg(payload: string, size = 280): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#15171A", light: "#FFFFFF" },
  });
}

export async function generateQrDataUrl(payload: string, size = 280): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#15171A", light: "#FFFFFF" },
  });
}
