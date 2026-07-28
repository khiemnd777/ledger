# Giao thức QR

Payload: `PKT1:{variantId}:{checksum}`. Checksum là CRC-16/CCITT-FALSE 4 ký tự hex trên `PKT1:{variantId}`.

QR không chứa giá, giá vốn, tồn, khách hàng, UID, Storage path hay credential. Sau parse, ứng dụng kiểm tra version, checksum, variant tồn tại, thuộc active shop và còn active. QR là identifier, không phải quyền truy cập.

Máy quét dùng camera sau qua `@zxing/browser`, cooldown 1.3 giây, âm/rung best-effort. Nhập SKU và tải ảnh QR là fallback bắt buộc khi camera bị chặn hoặc không có.
