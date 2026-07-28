import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Skeleton } from "../components/Ui";
import AppShell from "./AppShell";
import { useAuth } from "./AuthContext";
import { useShop } from "./ShopContext";

const AuthPage = lazy(() => import("../features/auth/AuthPage"));
const OnboardingPage = lazy(() => import("../features/onboarding/OnboardingPage"));
const OverviewPage = lazy(() => import("../features/overview/OverviewPage"));
const SellPage = lazy(() => import("../features/sales/SellPage"));
const ScannerPage = lazy(() => import("../features/sales/ScannerPage"));
const OrderSuccessPage = lazy(() => import("../features/sales/OrderSuccessPage"));
const OrdersPage = lazy(() => import("../features/sales/OrdersPage"));
const ProductsPage = lazy(() => import("../features/products/ProductsPage"));
const ProductFormPage = lazy(() => import("../features/products/ProductFormPage"));
const QrLabelsPage = lazy(() => import("../features/products/QrLabelsPage"));
const InventoryPage = lazy(() => import("../features/inventory/InventoryPage"));
const ReceiveStockPage = lazy(() => import("../features/inventory/ReceiveStockPage"));
const ReturnsPage = lazy(() => import("../features/returns/ReturnsPage"));
const ContactsPage = lazy(() => import("../features/contacts/ContactsPage"));
const ExpensesPage = lazy(() => import("../features/reports/ExpensesPage"));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage"));
const MorePage = lazy(() => import("../features/settings/MorePage"));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage"));
const SyncPage = lazy(() => import("../features/sync/SyncPage"));

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { activeShop, loading: shopLoading } = useShop();
  const location = useLocation();
  if (loading || (user && shopLoading))
    return (
      <div className="splash">
        <div className="splash__logo">PO</div>
        <p>Đang mở SỔ TAY…</p>
      </div>
    );
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (!activeShop && location.pathname !== "/onboarding")
    return <Navigate to="/onboarding" replace />;
  return children;
}

function RouteFallback() {
  return (
    <div className="route-loading">
      <Skeleton height={44} />
      <Skeleton height={156} />
      <Skeleton height={110} />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/onboarding"
          element={
            <Guard>
              <OnboardingPage />
            </Guard>
          }
        />
        <Route
          element={
            <Guard>
              <AppShell />
            </Guard>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="sell" element={<SellPage />} />
          <Route path="scan" element={<ScannerPage />} />
          <Route path="order-success/:saleId" element={<OrderSuccessPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:saleId" element={<OrdersPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:productId" element={<ProductsPage />} />
          <Route path="qr-labels" element={<QrLabelsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="receive" element={<ReceiveStockPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="customers" element={<ContactsPage type="customer" />} />
          <Route path="suppliers" element={<ContactsPage type="supplier" />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="more" element={<MorePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
