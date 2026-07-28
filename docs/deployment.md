# Deployment

## Firebase project

Tạo Web App, bật Email/Password + Google Auth, Realtime Database ở `asia-southeast1`, Hosting và App Check reCAPTCHA v3. Điền `.env.local` từ `.env.example`, gồm `VITE_FIREBASE_DATABASE_URL`. Không tạo Cloud Storage bucket và không cần gắn billing. Firebase Web config có thể nằm trong frontend; service credentials thì không.

## Validation

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
```

Rules tests cần emulator/Java. Playwright cần Chromium (`bunx playwright install chromium`).

## Deploy

```bash
firebase --config firebase.json use your-project-id
firebase --config firebase.json deploy --only database
bun run build
firebase --config firebase.json deploy --only hosting
```

Hosting rewrite đưa mọi route về `index.html`. Hashed assets cache immutable; HTML no-cache để service worker update an toàn.

## CI secrets

Khuyến nghị Workload Identity Federation hoặc `FIREBASE_SERVICE_ACCOUNT_SO_TAY`. Vite public config dùng repository/environment variables `VITE_FIREBASE_*`. Bảo vệ environment production và main branch; không lưu JSON credential vào git.
