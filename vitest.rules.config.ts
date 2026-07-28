import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["firebase/rules-tests/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
