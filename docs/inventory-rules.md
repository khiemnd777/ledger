# Quy tắc tồn kho

- Mặc định không cho tồn âm; draft/scan không trừ kho.
- Hoàn tất đơn recheck exact variant trong cùng transaction rồi mới trừ.
- Mọi thay đổi tồn tạo `StockMovement` với before/after, delta, giá vốn, reference và lý do.
- Hủy completed sale, trả hoặc đổi không xóa lịch sử; dùng movement đảo chiều.
- Trả áo chỉ cộng kho khi người dùng đánh dấu còn bán được.
- Đổi áo tạo `exchange_in` cho áo trả và `exchange_out` cho áo nhận.
- Stock receipt cập nhật giá vốn bình quân: `(tồn cũ × giá vốn cũ + nhập × giá nhập) / tồn mới`, làm tròn VND.
- Điều chỉnh và sửa consistency cần lý do, xác nhận và audit.

Công cụ consistency so `variant.stockQuantity` với tổng movement delta. Repair chỉ sửa cache theo ledger và không viết lại ledger.
