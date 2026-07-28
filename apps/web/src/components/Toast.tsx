import { CheckCircle2, CircleAlert, X } from "lucide-react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}
const ToastContext = createContext<{
  show: (message: string, tone?: ToastItem["tone"]) => void;
} | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: ToastItem["tone"] = "success") => {
    const id = Date.now();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3500);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div className={`toast toast--${item.tone}`} key={item.id}>
            {item.tone === "success" ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}
            <span>{item.message}</span>
            <button
              type="button"
              aria-label="Đóng"
              onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))}
            >
              <X size={17} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
