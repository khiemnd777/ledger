import { getFirebaseClients, RealtimeDatabaseCloudAdapter } from "@pocket/firebase";
import { db } from "@pocket/local-db";
import { SyncEngine } from "@pocket/sync-engine";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BarChart3,
  Boxes,
  House,
  Menu,
  PackagePlus,
  ScanLine,
  Shirt,
  ShoppingBag,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PoweredBy } from "../components/Ui";
import { useAuth } from "./AuthContext";
import { useShop } from "./ShopContext";

const navItems: Array<{
  to: string;
  label: string;
  icon: typeof House;
  central?: boolean;
  end?: boolean;
}> = [
  { to: "/", label: "Tổng quan", icon: House, end: true },
  { to: "/sell", label: "Lên đơn", icon: ShoppingBag },
  { to: "/scan", label: "Quét QR", icon: ScanLine, central: true },
  { to: "/inventory", label: "Kho áo", icon: Boxes },
  { to: "/more", label: "Khác", icon: Menu },
];

const desktopExtra = [
  { to: "/products", label: "Mẫu áo", icon: Shirt },
  { to: "/receive", label: "Nhập áo", icon: PackagePlus },
  { to: "/reports", label: "Báo cáo", icon: BarChart3 },
] as const;

export default function AppShell() {
  const { activeShop } = useShop();
  const { user } = useAuth();
  const pending =
    useLiveQuery(
      () =>
        activeShop
          ? db.outbox.where("[shopId+syncStatus]").equals([activeShop.id, "pending"]).count()
          : Promise.resolve(0),
      [activeShop?.id],
      0,
    ) ?? 0;
  const location = useLocation();
  const scannerOpen = location.pathname === "/scan";
  const syncEngine = useMemo(() => {
    const clients = getFirebaseClients();
    return clients && user
      ? new SyncEngine(db, new RealtimeDatabaseCloudAdapter(clients.database, user.uid), user.uid)
      : undefined;
  }, [user?.uid]);
  useEffect(() => {
    if (!syncEngine || !activeShop || !navigator.onLine) return;
    const timer = window.setTimeout(
      () => void syncEngine.sync(activeShop.id).catch(() => undefined),
      1800,
    );
    const online = () => void syncEngine.sync(activeShop.id).catch(() => undefined);
    const visible = () => {
      if (document.visibilityState === "visible") online();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [syncEngine, activeShop?.id, pending]);
  return (
    <div className={`app-shell ${scannerOpen ? "app-shell--scanner" : ""}`}>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="SỔ TAY">
          <span>ST</span>
          <strong>SỔ TAY</strong>
        </NavLink>
        <p className="sidebar__shop">{activeShop?.name}</p>
        <nav aria-label="Điều hướng chính">
          {[...navItems, ...desktopExtra].map(({ to, label, icon: Icon, ...item }) => (
            <NavLink key={to} to={to} end={"end" in item ? item.end : false}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__sync">
          <span className={pending ? "status-dot status-dot--warning" : "status-dot"} />
          {pending ? `${pending} mục chờ đồng bộ` : "Đã lưu trên thiết bị"}
        </div>
        <PoweredBy className="powered-by--sidebar" />
      </aside>
      <div className="app-main">
        {!scannerOpen && (
          <div className="connectivity" hidden={navigator.onLine}>
            <WifiOff size={16} /> Đang ngoại tuyến · Mọi thay đổi vẫn được lưu
          </div>
        )}
        <main className={scannerOpen ? "scanner-main" : "page-content"}>
          <Outlet />
        </main>
        {!scannerOpen && (
          <nav className="bottom-nav" aria-label="Điều hướng chính">
            {navItems.map(({ to, label, icon: Icon, central, end }) => (
              <NavLink key={to} to={to} end={end} className={central ? "bottom-nav__central" : ""}>
                <span className="bottom-nav__icon">
                  <Icon />
                </span>
                <span>{label}</span>
                {central && pending > 0 && <i>{pending}</i>}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
