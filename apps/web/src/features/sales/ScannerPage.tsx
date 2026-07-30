import type { Product, ProductVariant } from "@pocket/domain";
import { db, resolveVariant } from "@pocket/local-db";
import { parseQrPayload } from "@pocket/qr";
import { Button } from "@pocket/ui";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  ChevronLeft,
  Flashlight,
  ImagePlus,
  Keyboard,
  ScanLine,
  ShoppingBag,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCartStore } from "../../app/cartStore";
import { formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { alertVariantNote } from "../../app/variantNote";

function feedback() {
  navigator.vibrate?.(70);
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.035;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  } catch {
    /* Sound is optional. */
  }
}

export default function ScannerPage() {
  const { activeShop } = useShop();
  const navigate = useNavigate();
  const addItem = useCartStore((state) => state.addItem);
  const count = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | undefined>(undefined);
  const lastScan = useRef<{ value: string; at: number } | undefined>(undefined);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [permission, setPermission] = useState<"loading" | "ready" | "denied" | "unavailable">(
    "loading",
  );
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ variant: ProductVariant; product: Product }>();
  const [torch, setTorch] = useState(false);

  async function handleValue(raw: string) {
    if (!activeShop) return;
    const now = Date.now();
    if (lastScan.current?.value === raw && now - lastScan.current.at < 1300) return;
    lastScan.current = { value: raw, at: now };
    try {
      const lookup = raw.startsWith("PKT") ? parseQrPayload(raw).variantId : raw;
      const variant = await resolveVariant(activeShop.id, lookup);
      const product = await db.products.get(variant.productId);
      if (!product) throw new Error("Không tìm thấy mẫu áo.");
      alertVariantNote(variant.note);
      addItem(variant, product);
      setResult({ variant, product });
      setError("");
      feedback();
    } catch (cause) {
      setError(toVietnameseError(cause));
    }
  }

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;
    const reader = new BrowserQRCodeReader();
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then((stream) => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        if (cancelled) return;
        return reader
          .decodeFromConstraints(
            { audio: false, video: { facingMode: { ideal: "environment" } } },
            videoRef.current as HTMLVideoElement,
            (scanResult) => {
              if (scanResult) void handleValue(scanResult.getText());
            },
          )
          .then((controls) => {
            controlsRef.current = controls;
            setPermission("ready");
          });
      })
      .catch((cause: DOMException) => {
        setPermission(cause.name === "NotAllowedError" ? "denied" : "unavailable");
      });
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [mode, activeShop?.id]);

  async function uploadImage(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const decoded = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      await handleValue(decoded.getText());
    } catch {
      setError("Không đọc được QR trong ảnh. Hãy chọn ảnh rõ và đủ sáng.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return (
    <div className="scanner-page">
      <header>
        <button type="button" aria-label="Đóng máy quét" onClick={() => navigate(-1)}>
          <ChevronLeft />
        </button>
        <div>
          <strong>Quét QR để bán</strong>
          <span>Đưa tem vào giữa khung</span>
        </div>
        <Link to="/sell" className="scanner-cart">
          <ShoppingBag />
          <b>{count}</b>
        </Link>
      </header>
      <div className="scanner-camera">
        <video ref={videoRef} autoPlay muted playsInline />
        <div className="scanner-shade scanner-shade--top" />
        <div className="scanner-shade scanner-shade--left" />
        <div className="scanner-shade scanner-shade--right" />
        <div className="scanner-shade scanner-shade--bottom" />
        <div className="scan-frame">
          <i />
          <i />
          <i />
          <i />
          <span />
        </div>
        {permission === "loading" && (
          <div className="camera-state">
            <Camera />
            <p>Đang mở camera sau…</p>
          </div>
        )}
        {(permission === "denied" || permission === "unavailable") && (
          <div className="camera-state camera-state--error">
            <Camera />
            <h2>{permission === "denied" ? "Camera đang bị chặn" : "Không tìm thấy camera"}</h2>
            <p>
              {permission === "denied"
                ? "Cho phép camera trong cài đặt trình duyệt, hoặc dùng cách nhập bên dưới."
                : "Bạn vẫn có thể nhập SKU hoặc tải ảnh QR."}
            </p>
          </div>
        )}
        {error && (
          <div className="scan-error">
            <X />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              Đóng
            </button>
          </div>
        )}
        {result && (
          <div className="scan-result" role="status">
            <button
              type="button"
              className="scan-result__close"
              onClick={() => setResult(undefined)}
            >
              <X />
            </button>
            <div className="scan-result__top">
              <span className="product-swatch">
                <ScanLine />
              </span>
              <div>
                <small>ĐÃ THÊM VÀO ĐƠN</small>
                <h2>{result.product.name}</h2>
                <p>{result.variant.attributeSummary}</p>
              </div>
            </div>
            <div className="scan-result__details">
              <span>
                SKU <b>{result.variant.sku}</b>
              </span>
              <span>
                Tồn hiện tại <b>{result.variant.stockQuantity}</b>
              </span>
              <span>
                Giá bán <b>{formatMoney(result.variant.salePrice)}</b>
              </span>
            </div>
            <div>
              <Button variant="secondary" onClick={() => setResult(undefined)}>
                <ScanLine />
                Quét tiếp
              </Button>
              <Button onClick={() => navigate("/sell")}>Xem đơn ({count})</Button>
            </div>
          </div>
        )}
      </div>
      <footer>
        <button
          type="button"
          className={torch ? "is-active" : ""}
          onClick={async () => {
            try {
              await controlsRef.current?.switchTorch?.(!torch);
              setTorch(!torch);
            } catch {
              setError("Thiết bị không hỗ trợ bật đèn pin trong trình duyệt.");
            }
          }}
        >
          <Flashlight />
          <span>Đèn pin</span>
        </button>
        <label>
          <ImagePlus />
          <span>Chọn ảnh QR</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void uploadImage(e.target.files?.[0])}
          />
        </label>
        <button type="button" onClick={() => setMode(mode === "camera" ? "manual" : "camera")}>
          <Keyboard />
          <span>Nhập SKU</span>
        </button>
      </footer>
      {mode === "manual" && (
        <div className="manual-sheet">
          <div>
            <button type="button" onClick={() => setMode("camera")}>
              <X />
            </button>
            <Keyboard />
            <h2>Nhập SKU thủ công</h2>
            <p>SKU nằm ngay dưới mã QR trên tem áo.</p>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="VD: ATB-001"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleValue(manual);
              }}
            />
            <Button onClick={() => void handleValue(manual)} disabled={!manual.trim()}>
              Thêm vào đơn
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
