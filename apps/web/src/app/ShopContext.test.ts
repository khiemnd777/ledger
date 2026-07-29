import type { Shop } from "@pocket/domain";
import { describe, expect, it } from "vitest";
import { resolveOwnedShops } from "./ShopContext";

const shop = { id: "shop-a", ownerUid: "user-a" } as Shop;

describe("resolveOwnedShops", () => {
  it("keeps loading while the live query still belongs to the signed-out state", () => {
    expect(resolveOwnedShops("user-a", { ownerUid: null, shops: [] })).toEqual({
      shops: [],
      loading: true,
    });
  });

  it("exposes shops only after the result belongs to the current user", () => {
    expect(resolveOwnedShops("user-a", { ownerUid: "user-a", shops: [shop] })).toEqual({
      shops: [shop],
      loading: false,
    });
  });

  it("does not expose the previous user's shops during an account change", () => {
    expect(resolveOwnedShops("user-b", { ownerUid: "user-a", shops: [shop] })).toEqual({
      shops: [],
      loading: true,
    });
  });
});
