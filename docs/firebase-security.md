# Firebase Security

Rules ở `firebase/database.rules.json` yêu cầu `auth.uid == uid` cho mọi read/write dưới `users/{uid}` và deny mặc định nơi khác. Metadata nằm trong `cloudFileIndex`; dữ liệu base64 nằm trong `cloudFileBlobs` để thao tác list không tải toàn bộ blob.

Giới hạn:

- Mọi tệp lớn hơn 0 và tối đa 8 MB trước khi mã hóa base64.
- Mỗi chunk nhị phân là 512 KiB; rules chỉ nhận tối đa 16 chunk, mỗi chuỗi base64 tối đa 700.000 ký tự.
- MIME chỉ nhận gzip, JPEG, PNG, WebP, SVG và OOXML Excel.
- File ID và checksum là SHA-256 64 ký tự; đường dẫn phải bắt đầu bằng `users/{uid}/shops/`.
- Index và blob chỉ được create hoặc delete, không được overwrite.

App Check dùng reCAPTCHA v3 production. Emulator không khởi tạo App Check. Chạy `bun run test:rules` để kiểm tra owner, cross-user, anonymous, immutability, MIME, size và chunk bounds.
