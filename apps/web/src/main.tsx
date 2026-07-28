import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@pocket/ui";
import { RefreshCw, X } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { AuthProvider } from "./app/AuthContext";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { ShopProvider } from "./app/ShopContext";
import { ToastProvider } from "./components/Toast";
import "./styles/global.css";

function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("PWA registration failed", error);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <RefreshCw />
      <span>
        <strong>Có phiên bản SỔ TAY mới</strong>
        <small>Cập nhật an toàn sau khi dữ liệu đã được lưu.</small>
      </span>
      <Button onClick={() => void updateServiceWorker(true)}>Cập nhật</Button>
      <button type="button" aria-label="Để sau" onClick={() => setNeedRefresh(false)}>
        <X />
      </button>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Không tìm thấy phần tử gốc của ứng dụng.");
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ShopProvider>
            <ToastProvider>
              <App />
              <UpdateBanner />
            </ToastProvider>
          </ShopProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
