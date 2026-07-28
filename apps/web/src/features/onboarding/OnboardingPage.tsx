import { createShop, db, getDeviceId, seedDemoData } from "@pocket/local-db";
import { Button, Card } from "@pocket/ui";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Palette,
  ScanLine,
  Shirt,
  Sparkles,
  Store,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { Field } from "../../components/Ui";

const STEPS = ["Chào mừng", "Thông tin shop", "Thiết lập bán áo", "Sẵn sàng"];

export default function OnboardingPage() {
  const { user } = useAuth();
  const { activeShop, setActiveShopId } = useShop();
  const navigate = useNavigate();
  const { show } = useToast();
  const [step, setStep] = useState(activeShop ? 2 : 0);
  const [name, setName] = useState("Pocket Store 01");
  const [threshold, setThreshold] = useState(3);
  const [negative, setNegative] = useState(false);
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  async function next() {
    if (step === 1 && !activeShop && user) {
      const shop = await createShop({
        ownerUid: user.uid,
        name,
        allowNegativeStock: negative,
        defaultLowStockThreshold: threshold,
        deviceId: getDeviceId(),
      });
      setActiveShopId(shop.id);
    }
    if (step === 2 && activeShop)
      await db.shops.put({
        ...activeShop,
        allowNegativeStock: negative,
        defaultLowStockThreshold: threshold,
      });
    if (step < 3) setStep(step + 1);
  }
  async function finish() {
    if (!activeShop) return;
    setBusy(true);
    try {
      if (demo) await seedDemoData(activeShop.id, getDeviceId());
      else await db.shops.put({ ...activeShop, onboardingComplete: true });
      show("Shop đã sẵn sàng để bán áo");
      navigate("/");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding-page">
      <header>
        <div className="auth-brand auth-brand--dark">
          <span>PO</span>
          <strong>SỔ TAY</strong>
        </div>
        <p>
          {step + 1}/{STEPS.length}
        </p>
      </header>
      <div className="onboarding-progress">
        {STEPS.map((label, index) => (
          <div key={label} className={index <= step ? "is-active" : ""}>
            <i>{index < step ? <Check size={14} /> : index + 1}</i>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <main>
        {step === 0 && (
          <section className="onboarding-intro">
            <div className="onboarding-visual">
              <span>
                <Shirt />
              </span>
              <i>
                <ScanLine />
              </i>
            </div>
            <p className="eyebrow">XIN CHÀO</p>
            <h1>
              Bán đúng áo.
              <br />
              Biết đúng tồn.
            </h1>
            <p>
              SỔ TAY sẽ giúp bạn tạo shop, mẫu áo đầu tiên và tem QR theo từng size, màu trong vài
              phút.
            </p>
            <div className="onboarding-benefits">
              <div>
                <Store />
                <span>
                  <strong>Shop của riêng bạn</strong>
                  <small>Tách biệt và an toàn</small>
                </span>
              </div>
              <div>
                <Palette />
                <span>
                  <strong>Size & màu có sẵn</strong>
                  <small>Tùy chỉnh bất kỳ lúc nào</small>
                </span>
              </div>
            </div>
          </section>
        )}
        {step === 1 && (
          <section>
            <p className="eyebrow">SHOP CỦA BẠN</p>
            <h1>Đặt tên cho shop</h1>
            <p className="section-lead">Tên này xuất hiện trên đơn hàng, báo cáo và tem QR.</p>
            <Card className="form-card">
              <Field label="Tên shop">
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Tiền tệ">
                <input value="VND — Việt Nam đồng" disabled />
              </Field>
              <Field label="Múi giờ">
                <input value="Asia/Ho_Chi_Minh" disabled />
              </Field>
            </Card>
          </section>
        )}
        {step === 2 && (
          <section>
            <p className="eyebrow">THIẾT LẬP NHANH</p>
            <h1>Cách bạn quản lý kho</h1>
            <p className="section-lead">Mặc định phù hợp với shop quần áo nhỏ và có thể đổi sau.</p>
            <Card className="settings-list">
              <div>
                <span>
                  <strong>Cảnh báo sắp hết</strong>
                  <small>Khi số lượng còn bằng hoặc dưới mức này</small>
                </span>
                <input
                  className="number-input"
                  type="number"
                  min="0"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </div>
              <label>
                <span>
                  <strong>Cho phép tồn kho âm</strong>
                  <small>Nên tắt để tránh bán quá số lượng</small>
                </span>
                <input
                  type="checkbox"
                  checked={negative}
                  onChange={(e) => setNegative(e.target.checked)}
                />
                <i />
              </label>
              <div className="attribute-chips">
                <span>
                  Size: <b>S</b>
                  <b>M</b>
                  <b>L</b>
                  <b>XL</b>
                </span>
                <span>
                  Màu: <b>Đen</b>
                  <b>Trắng</b>
                  <b>Be</b>
                </span>
                <span>
                  Thuộc tính: <b>Kiểu cổ</b>
                  <b>Chất liệu</b>
                </span>
              </div>
            </Card>
          </section>
        )}
        {step === 3 && (
          <section className="onboarding-ready">
            <span className="ready-icon">
              <Sparkles />
            </span>
            <p className="eyebrow">SẴN SÀNG RỒI</p>
            <h1>Khởi động shop nhé!</h1>
            <p>Bạn có thể thêm dữ liệu mẫu để khám phá ngay, hoặc bắt đầu với một shop trống.</p>
            <button
              type="button"
              className={`demo-option ${demo ? "is-selected" : ""}`}
              onClick={() => setDemo(true)}
            >
              <i>
                <Sparkles />
              </i>
              <span>
                <strong>Dùng dữ liệu mẫu</strong>
                <small>3 mẫu áo, 42 biến thể, đơn hàng và công nợ</small>
              </span>
              <Check />
            </button>
            <button
              type="button"
              className={`demo-option ${!demo ? "is-selected" : ""}`}
              onClick={() => setDemo(false)}
            >
              <i>
                <Shirt />
              </i>
              <span>
                <strong>Bắt đầu shop trống</strong>
                <small>Tự thêm mẫu áo đầu tiên của bạn</small>
              </span>
              <Check />
            </button>
          </section>
        )}
      </main>
      <footer>
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft />
            Quay lại
          </Button>
        )}
        <Button
          onClick={step === 3 ? finish : next}
          disabled={busy || (step === 1 && name.trim().length < 2)}
        >
          {busy ? "Đang chuẩn bị…" : step === 3 ? "Vào shop" : "Tiếp tục"}
          <ArrowRight />
        </Button>
      </footer>
    </div>
  );
}
