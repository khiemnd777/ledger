# Kiến trúc SỔ TAY

## Ranh giới module

- `apps/web`: route, layout, form và state UI tạm thời.
- `packages/domain`: entity, lỗi typed và phép tính nghiệp vụ thuần.
- `packages/local-db`: Dexie schema, migration, repository và transaction.
- `packages/qr`: payload `PKT1`, CRC-16, parse và render QR.
- `packages/sync-engine`: outbox, changeset, snapshot, checksum, restore và conflict.
- `packages/firebase`: auth, App Check, Realtime Database blob adapter và emulator behavior.
- `packages/ui`: primitive UI dùng chung.

React không sở hữu phép tính tồn, doanh thu hay công nợ. Nghiệp vụ gọi transaction service, sau đó UI phản ứng với live query.

## Luồng ghi

1. UI validate input.
2. Domain service tính và kiểm tra invariant.
3. Một Dexie `rw` transaction ghi entity, ledger, audit và outbox.
4. UI đọc trạng thái mới từ IndexedDB ngay lập tức.
5. Sync engine gom pending events, nén và upload immutable changeset.
6. Chỉ sau upload thành công event mới chuyển `synced`.

## Giới hạn nhất quán

IndexedDB transaction đảm bảo atomic trên một thiết bị. Realtime Database chỉ chứa index metadata và blob base64 chia nhỏ, không sở hữu các bảng nghiệp vụ; SỔ TAY không tuyên bố strong consistency đa thiết bị. Revision và device ID dùng để phát hiện divergent edits, giữ cả local/remote và chuyển Conflict Center.
