import type { Product, ProductVariant } from "@pocket/domain";
import { beforeEach, expect, it } from "vitest";
import { useCartStore } from "./cartStore";

beforeEach(() => useCartStore.getState().clear());
it("increments quantity when the same variant is scanned twice", () => {
  const variant = { id: "variant", salePrice: 189000 } as ProductVariant;
  const product = { id: "product", name: "Áo thun" } as Product;
  useCartStore.getState().addItem(variant, product);
  useCartStore.getState().addItem(variant, product);
  expect(useCartStore.getState().items).toHaveLength(1);
  expect(useCartStore.getState().items[0]?.quantity).toBe(2);
});
