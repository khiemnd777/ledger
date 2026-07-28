# Firebase Security

Rules ở `firebase/storage.rules` yêu cầu `request.auth.uid == uid` cho mọi read/write dưới `users/{uid}` và deny mặc định nơi khác.

Giới hạn:

- Ảnh product/receipt: JPEG, PNG, WebP; dưới 8 MB.
- Changeset: `application/gzip`; dưới 10 MB; immutable create-only.
- Snapshot: `application/gzip`; dưới 25 MB; immutable create-only.
- QR label: SVG; dưới 2 MB.
- Excel export: đúng OOXML MIME; dưới 20 MB.

App Check dùng reCAPTCHA v3 production. Emulator không khởi tạo App Check. Chạy `bun run test:rules` để kiểm tra owner, cross-user, anonymous, MIME và size.
