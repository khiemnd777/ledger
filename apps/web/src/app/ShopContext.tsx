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

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const shopsResult = useLiveQuery<Shop[]>(
    () =>
      user ? db.shops.where("ownerUid").equals(user.uid).toArray() : Promise.resolve([] as Shop[]),
    [user?.uid],
  );
  const shops = shopsResult ?? [];
  const [activeShopId, setActiveShopIdState] = useState(() =>
    localStorage.getItem("pocket-active-shop"),
  );
  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? shops[0];

  useEffect(() => {
    void requestPersistentStorage();
  }, []);
  useEffect(() => {
    if (!activeShopId && shops[0]) setActiveShopIdState(shops[0].id);
  }, [shops, activeShopId]);

  const value = useMemo(
    () => ({
      shops,
      activeShop,
      loading: user !== null && shopsResult === undefined,
      setActiveShopId: (id: string) => {
        localStorage.setItem("pocket-active-shop", id);
        setActiveShopIdState(id);
      },
    }),
    [shops, activeShop, shopsResult],
  );
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside ShopProvider");
  return value;
}
