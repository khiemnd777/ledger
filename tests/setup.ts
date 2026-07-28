import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto });
if (!globalThis.navigator.storage) {
  Object.defineProperty(globalThis.navigator, "storage", {
    value: {
      persist: async () => true,
      persisted: async () => true,
      estimate: async () => ({ usage: 0, quota: 100_000_000 }),
    },
  });
}
