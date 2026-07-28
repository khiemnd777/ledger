# SỔ TAY

**Quản lý bán áo bằng QR ngay trên điện thoại.**

SỔ TAY là PWA mobile-first cho shop thời trang nhỏ: quản lý mẫu áo và biến thể, in/quét QR, bán hàng, nhập áo, đổi trả, công nợ, chi phí và báo cáo. Ứng dụng làm việc trên IndexedDB khi offline và đồng bộ các changeset bất biến lên Firebase Cloud Storage khi có mạng.

## Kiến trúc

- React + TypeScript strict + Vite; Bun workspace
- Dexie/IndexedDB là cơ sở dữ liệu làm việc và nguồn cho báo cáo offline
- Mọi nghiệp vụ quan trọng chạy trong một Dexie transaction
- Firebase Authentication xác thực người dùng
- Firebase Cloud Storage lưu changeset, snapshot, ảnh, tem và file xuất; không được dùng như query database
- Firebase Hosting phục vụ static PWA; không có backend, API route, Firestore hay Cloud Functions
- Outbox local-first, snapshot có SHA-256 checksum, gzip bằng fflate

Xem [kiến trúc](docs/architecture.md), [mô hình dữ liệu](docs/data-model.md) và [giao thức đồng bộ](docs/sync-protocol.md).

## Yêu cầu

- Bun 1.3 trở lên
- Trình duyệt hiện đại hỗ trợ IndexedDB và Web Crypto
- Java 21+ khi chạy Firebase Emulator Suite
- Tài khoản Firebase khi cần auth, đồng bộ cloud và deploy

## Cài đặt và chạy

```bash
bun install --frozen-lockfile
cp .env.example .env.local
bun run dev
```

Nếu chưa cấu hình Firebase, ứng dụng hiện rõ **chế độ phát triển cục bộ**. Toàn bộ nghiệp vụ và sao lưu tệp vẫn chạy; dữ liệu không được mô tả là đã đồng bộ cloud.

## Firebase

1. Tạo Firebase project và Web App.
2. Bật Authentication providers: Email/Password và Google.
3. Tạo Cloud Storage bucket và Hosting site.
4. Copy `.env.example` thành `.env.local`, điền các giá trị `VITE_FIREBASE_*`.
5. Với production, tạo reCAPTCHA v3 site key và điền `VITE_FIREBASE_APP_CHECK_SITE_KEY`.
6. Copy `.firebaserc.example` thành `.firebaserc`, thay project ID.
7. Deploy rules trước khi cho người dùng upload.

Firebase Web config là cấu hình công khai, không phải service credential. Không đưa service-account JSON hoặc CI token vào repository.

### Emulator

```bash
firebase --config firebase.json emulators:start --only auth,storage
bun run dev
```

Giữ `VITE_USE_FIREBASE_EMULATORS=true` trong local. Production không kết nối emulator và chỉ khởi tạo App Check khi có site key.

## Kiểm thử và chất lượng

```bash
bun run typecheck
bun run lint
bun run test
bun run test:e2e
bun run test:rules
bun run build
```

Unit tests bao phủ QR/checksum, tiền, giá vốn bình quân, báo cáo, conflict, changeset và rollback transaction bán hàng. Playwright dùng camera-denial/manual fallback; Rules tests cần Storage emulator.

## Build và deploy

```bash
bun run build
firebase --config firebase.json deploy --only hosting,storage
```

Output production ở `apps/web/dist`. GitHub Actions có validation cho pull request và deploy main bằng protected secrets.

## Sao lưu và khôi phục

Mở **Khác → Đồng bộ & Sao lưu**. Bản sao tải về chứa tất cả bảng cần dựng lại shop, gzip và SHA-256 checksum. Khi khôi phục, SỔ TAY kiểm tra schema, shop ID và checksum trước một transaction thay dữ liệu. Chi tiết tại [backup-restore.md](docs/backup-restore.md).

## Bảo mật

- Storage Rules bắt buộc auth và cô lập tuyệt đối dưới `users/{uid}`.
- Upload bị giới hạn MIME, kích thước và đường dẫn; executable bị từ chối mặc định.
- QR chỉ là định danh có checksum, không phải authorization token và không chứa giá vốn, tồn hay UID.
- Tiền lưu bằng integer VND; giá vốn lịch sử nằm trên từng sale line.
- Completed sale không bị xóa; hủy/đổi/trả phải tạo stock movements đảo chiều.

## Giới hạn đã biết

SỔ TAY hỗ trợ nhiều người dùng độc lập và một người có nhiều shop. Kiến trúc không backend và không server database **không cung cấp cộng tác giao dịch thời gian thực cho nhiều nhân viên trong cùng một shop**. Đồng bộ đa thiết bị là best-effort: khi phát hiện hai phiên bản, ứng dụng giữ cả hai và yêu cầu giải quyết trong Conflict Center.

Camera, đèn pin, background sync và persistent storage phụ thuộc trình duyệt. SỔ TAY luôn cung cấp nhập SKU, ảnh QR, outbox và nút thử lại thay vì phụ thuộc riêng vào các API đó.
