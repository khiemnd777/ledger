import { db } from "@pocket/local-db";
import { Button, Card } from "@pocket/ui";
import {
  BellRing,
  Camera,
  Download,
  LogOut,
  QrCode,
  Save,
  ShieldCheck,
  Store,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

export default function SettingsPage() {
  const { activeShop } = useShop();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { show } = useToast();
  const [name, setName] = useState(activeShop?.name ?? "");
  const [threshold, setThreshold] = useState(activeShop?.defaultLowStockThreshold ?? 3);
  const [negative, setNegative] = useState(activeShop?.allowNegativeStock ?? false);
  async function save() {
    if (!activeShop) return;
    await db.shops.put({
      ...activeShop,
      name: name.trim(),
      defaultLowStockThreshold: threshold,
      allowNegativeStock: negative,
      revision: activeShop.revision + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    });
    show("Đã lưu cài đặt shop");
  }
  return (
    <div>
      <PageHeader title="Cài đặt" eyebrow="SỔ TAY & SHOP" back />
      <div className="settings-layout">
        <main>
          <section>
            <h2>
              <Store />
              Thông tin shop
            </h2>
            <Card className="form-card form-grid">
              <label>
                Tên shop
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Tiền tệ
                <input value="VND — Việt Nam đồng" disabled />
              </label>
              <label>
                Múi giờ
                <input value="Asia/Ho_Chi_Minh" disabled />
              </label>
              <label>
                Ngưỡng sắp hết
                <input
                  type="number"
                  min="0"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </label>
            </Card>
          </section>
          <section>
            <h2>
              <ShieldCheck />
              Quy tắc kho
            </h2>
            <Card className="settings-list">
              <label>
                <span>
                  <strong>Cho phép tồn kho âm</strong>
                  <small>SỔ TAY sẽ chặn hoàn tất đơn khi không đủ tồn nếu tắt</small>
                </span>
                <input
                  type="checkbox"
                  checked={negative}
                  onChange={(e) => setNegative(e.target.checked)}
                />
                <i />
              </label>
              <div>
                <span>
                  <strong>Kiểm tra nhất quán kho</strong>
                  <small>Đối chiếu cache với sổ phát sinh</small>
                </span>
                <Button variant="secondary" onClick={() => navigate("/inventory")}>
                  Mở công cụ
                </Button>
              </div>
            </Card>
          </section>
          <section>
            <h2>
              <Camera />
              Máy quét & QR
            </h2>
            <Card className="settings-list">
              <div>
                <span>
                  <strong>Camera ưu tiên</strong>
                  <small>Camera sau · tự động lấy nét</small>
                </span>
                <b>Phía sau</b>
              </div>
              <label>
                <span>
                  <strong>Âm thanh & rung</strong>
                  <small>Phản hồi khi quét thành công</small>
                </span>
                <input type="checkbox" defaultChecked />
                <i />
              </label>
              <div>
                <span>
                  <strong>Mẫu tem mặc định</strong>
                  <small>A4 · 3 cột · có giá bán</small>
                </span>
                <Button variant="secondary" onClick={() => navigate("/qr-labels")}>
                  <QrCode />
                  Cài tem
                </Button>
              </div>
            </Card>
          </section>
          <section>
            <h2>
              <Download />
              Ứng dụng PWA
            </h2>
            <Card className="settings-list">
              <div>
                <span>
                  <strong>Phiên bản</strong>
                  <small>Ứng dụng sẽ báo trước khi nạp bản mới</small>
                </span>
                <b>1.0.0</b>
              </div>
              <div>
                <span>
                  <strong>Cài lên màn hình chính</strong>
                  <small>Dùng menu trình duyệt → Thêm vào màn hình chính</small>
                </span>
                <BellRing />
              </div>
            </Card>
          </section>
        </main>
        <aside>
          <Button onClick={save}>
            <Save />
            Lưu cài đặt
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await signOut();
              navigate("/auth");
            }}
          >
            <LogOut />
            Đăng xuất
          </Button>
          <Card className="danger-zone">
            <h3>
              <Trash2 />
              Vùng dữ liệu
            </h3>
            <p>
              Xóa shop hoặc khôi phục bản sao là thao tác có ảnh hưởng lớn. Hãy tạo bản sao lưu
              trước.
            </p>
            <Button variant="danger" onClick={() => navigate("/sync")}>
              Quản lý dữ liệu
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
