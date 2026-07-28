import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pocket/domain": resolve(__dirname, "packages/domain/src/index.ts"),
      "@pocket/local-db": resolve(__dirname, "packages/local-db/src/index.ts"),
      "@pocket/qr": resolve(__dirname, "packages/qr/src/index.ts"),
      "@pocket/sync-engine": resolve(__dirname, "packages/sync-engine/src/index.ts"),
      "@pocket/firebase": resolve(__dirname, "packages/firebase/src/index.ts"),
      "@pocket/ui": resolve(__dirname, "packages/ui/src/index.tsx"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [resolve(__dirname, "tests/setup.ts")],
    exclude: ["tests/e2e/**", "firebase/rules-tests/**", "node_modules/**", "dist/**"],
    coverage: { provider: "v8", reporter: ["text", "html"], include: ["packages/**/*.ts"] },
  },
});
