# Giao thức đồng bộ

Mỗi transaction tạo OutboxEvents. Sync đọc tối đa 250 pending event, sort theo timestamp/ID, đóng gói changeset schema 1, SHA-256 JSON core, gzip và upload:

`users/{uid}/shops/{shopId}/changes/{year}/{month}/change-{id}.json.gz`

Realtime Database adapter băm đường dẫn thành file ID SHA-256, ghi metadata vào `cloudFileIndex` và chia payload thành chunk 512 KiB trong `cloudFileBlobs`. Tệp tối đa 8 MB; khi tải về phải khớp byte size và checksum trước khi giải nén.

Blob là bất biến khi tồn tại. Cập nhật ảnh tạo path theo checksum mới; khi bỏ tham chiếu, adapter xóa atomically cả `cloudFileIndex/{fileId}` và `cloudFileBlobs/{fileId}`. Security Rules cho owner tạo hoặc xóa nhưng không ghi đè nội dung tại cùng file ID.

Event chuyển `syncing` trước upload và chỉ thành `synced` khi upload hoàn tất. Lỗi tăng retry count, lưu message và hiện trên UI. Trigger: debounce sau thay đổi, app foreground, online event và nút manual. Không upload theo keystroke và không phụ thuộc độc quyền Background Sync.

Snapshot chứa toàn bộ entity cần rebuild, cũng checksum + gzip. Restore phải kiểm tra schema, shop, checksum rồi thay dữ liệu trong transaction. Divergent revisions từ device khác tạo ConflictRecord; không silent overwrite.
