import type { Shop } from "@pocket/domain";
import { db, requestPersistentStorage } from "@pocket/local-db";
import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";

interface ShopContextValue {
  shops: Shop[];
  activeShop?: Shop;
  setActiveShopId: (id: string) => void;
  loading: boolean;
}

interface OwnedShopsResult {
  ownerUid: string | null;
  shops: Shop[];
}

export function resolveOwnedShops(
  ownerUid: string | undefined,
  result: OwnedShopsResult | undefined,
) {
  if (!ownerUid) return { shops: [] as Shop[], loading: false };
  if (!result || result.ownerUid !== ownerUid) return { shops: [] as Shop[], loading: true };
  return { shops: result.shops, loading: false };
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const ownerUid = user?.uid;
  // Dexie keeps the previous live-query value while dependencies resubscribe.
  // Stamp each result so a signed-out result cannot be mistaken for this user's shops.
  const shopsResult = useLiveQuery<OwnedShopsResult>(
    async () => ({
      ownerUid: ownerUid ?? null,
      shops: ownerUid ? await db.shops.where("ownerUid").equals(ownerUid).toArray() : [],
    }),
    [ownerUid],
  );
  const { shops, loading } = resolveOwnedShops(ownerUid, shopsResult);
  const [activeShopId, setActiveShopIdState] = useState(() =>
    localStorage.getItem("pocket-active-shop"),
  );
  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? shops[0];

  useEffect(() => {
    void requestPersistentStorage();
  }, []);
  useEffect(() => {
    if (!activeShop || activeShop.id === activeShopId) return;
    localStorage.setItem("pocket-active-shop", activeShop.id);
    setActiveShopIdState(activeShop.id);
  }, [activeShop, activeShopId]);

  const value = useMemo(
    () => ({
      shops,
      activeShop,
      loading,
      setActiveShopId: (id: string) => {
        localStorage.setItem("pocket-active-shop", id);
        setActiveShopIdState(id);
      },
    }),
    [shops, activeShop, loading],
  );
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside ShopProvider");
  return value;
}
