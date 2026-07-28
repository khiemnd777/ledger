# Mô hình dữ liệu

Mọi entity business có `id`, `shopId`, created/updated timestamps, device IDs, `revision`, optional `deletedAt` và `syncStatus`. ID được tạo offline bằng Web Crypto UUID.

## Catalog

`Product` là mẫu áo. `ProductAttribute` và `ProductAttributeValue` mô tả Size, Màu, Kiểu cổ… `ProductVariant` là đơn vị bán và tồn độc lập, luôn có SKU, QR, giá, tồn và ngưỡng sắp hết.

## Giao dịch

- `Sale` + `SaleLine`: snapshot tên, SKU, giá bán và giá vốn tại lúc hoàn tất.
- `Purchase` + `PurchaseLine`: đợt nhập áo, giá nhập và công nợ xưởng.
- `ReturnExchange`: lý do, restock, biến thể thay thế, thu thêm/hoàn tiền.
- `Payment`: dòng tiền incoming/outgoing gắn reference.
- `Expense`: chi phí vận hành shop.

## Ledger và đồng bộ

`StockMovement` là lịch sử kiểm toán tồn; `ProductVariant.stockQuantity` chỉ là performance cache. `AuditLog` ghi hành động quan trọng. `OutboxEvent` là immutable intent chờ cloud. `SnapshotRecord` lưu metadata backup. `ConflictRecord` giữ cả phiên bản local và remote.

IndexedDB version 1 khai báo index theo `shopId`, lookup SKU/QR, reference IDs, timestamp và compound `[shopId+syncStatus]`. Migration sau này phải tăng Dexie version và tạo snapshot sau thành công.
