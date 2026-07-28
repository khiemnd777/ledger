# Backup và restore

Manual backup lấy snapshot nhất quán từ IndexedDB, JSON serialize, checksum SHA-256 phần core và gzip. File có tên shop + ngày. Cloud snapshot dùng cùng envelope và immutable path theo năm/tháng, sau đó được chia thành các blob 512 KiB trong Realtime Database.

Restore:

1. Đọc gzip và parse JSON.
2. Kiểm tra schema version.
3. Kiểm tra `shopId` đúng shop active.
4. Tính lại checksum và so sánh.
5. Trong một Dexie transaction, xóa dữ liệu shop cũ theo từng bảng rồi bulk-add snapshot.
6. Chỉ báo thành công sau khi transaction commit.

UI yêu cầu xác nhận rõ trước restore. Tệp hỏng, sai shop, sai checksum hoặc schema mới hơn bị từ chối và không thay dữ liệu hiện tại.
