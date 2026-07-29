export const formatMoney = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)}₫`;
export const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "—";
export const formatDateTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";

export function toVietnameseError(error: unknown): string {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code).toLowerCase() : "";
    const message = "message" in error ? String(error.message) : "";
    const searchable = `${code} ${message}`.toLowerCase();
    if (searchable.includes("permission_denied") || searchable.includes("permission-denied")) {
      return "Bạn không có quyền tải ảnh cho tài khoản này. Hãy đăng nhập lại rồi thử lại.";
    }
    if (
      searchable.includes("network-request-failed") ||
      searchable.includes("network error") ||
      searchable.includes("failed to fetch")
    ) {
      return "Không thể kết nối máy chủ để tải ảnh. Kiểm tra mạng rồi thử lại.";
    }
    if (searchable.includes("app-check") || searchable.includes("appcheck")) {
      return "Không thể xác minh phiên ứng dụng. Hãy tải lại trang rồi thử lại.";
    }
    if (message) return message;
  }
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}
