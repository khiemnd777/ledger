# Giao thức đồng bộ

Mỗi transaction tạo OutboxEvents. Sync đọc tối đa 250 pending event, sort theo timestamp/ID, đóng gói changeset schema 1, SHA-256 JSON core, gzip và upload:

`users/{uid}/shops/{shopId}/changes/{year}/{month}/change-{id}.json.gz`

Event chuyển `syncing` trước upload và chỉ thành `synced` khi upload hoàn tất. Lỗi tăng retry count, lưu message và hiện trên UI. Trigger: debounce sau thay đổi, app foreground, online event và nút manual. Không upload theo keystroke và không phụ thuộc độc quyền Background Sync.

Snapshot chứa toàn bộ entity cần rebuild, cũng checksum + gzip. Restore phải kiểm tra schema, shop, checksum rồi thay dữ liệu trong transaction. Divergent revisions từ device khác tạo ConflictRecord; không silent overwrite.
