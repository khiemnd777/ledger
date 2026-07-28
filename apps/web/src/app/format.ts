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
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}
