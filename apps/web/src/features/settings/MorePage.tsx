import { Card } from "@pocket/ui";
import {
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  Factory,
  FileText,
  QrCode,
  ReceiptText,
  RotateCcw,
  Settings,
  Shirt,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, PoweredBy } from "../../components/Ui";

const groups = [
  {
    title: "Bán hàng",
    items: [
      { to: "/orders", label: "Đơn hàng", hint: "Tất cả trạng thái", icon: ShoppingBag },
      { to: "/returns", label: "Đổi / Trả áo", hint: "Đổi size, màu, mẫu", icon: RotateCcw },
      { to: "/customers", label: "Khách hàng", hint: "Lịch sử & khách còn thiếu", icon: Users },
    ],
  },
  {
    title: "Hàng hóa",
    items: [
      { to: "/products", label: "Mẫu áo", hint: "Size và giá bán", icon: Shirt },
      { to: "/purchases", label: "Phiếu nhập", hint: "Sửa, hủy và đối soát", icon: ReceiptText },
      { to: "/qr-labels", label: "Tem QR", hint: "In A4 hoặc máy in nhiệt", icon: QrCode },
      {
        to: "/suppliers",
        label: "Xưởng / Nhà cung cấp",
        hint: "Lịch sử & còn nợ xưởng",
        icon: Factory,
      },
    ],
  },
  {
    title: "Vận hành",
    items: [
      {
        to: "/expenses",
        label: "Chi phí shop",
        hint: "Quảng cáo, đóng gói…",
        icon: CircleDollarSign,
      },
      { to: "/reports", label: "Báo cáo", hint: "Doanh thu, lợi nhuận, tồn", icon: BarChart3 },
      { to: "/sync", label: "Đồng bộ & Sao lưu", hint: "Thiết bị, cloud, xung đột", icon: Cloud },
      { to: "/settings", label: "Cài đặt", hint: "Shop, kho, camera, PWA", icon: Settings },
    ],
  },
];
export default function MorePage() {
  return (
    <div>
      <PageHeader title="Khác" eyebrow="QUẢN LÝ SHOP" />
      <div className="more-grid">
        {groups.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <Card>
              {group.items.map(({ to, label, hint, icon: Icon }) => (
                <Link to={to} key={to}>
                  <span>
                    <Icon />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </div>
                  <ChevronRight />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
      <Card className="architecture-note">
        <FileText />
        <div>
          <strong>SỔ TAY local-first</strong>
          <p>
            Dữ liệu làm việc nằm trên thiết bị và được đưa vào hàng chờ đồng bộ sau mỗi giao dịch.
          </p>
        </div>
      </Card>
      <PoweredBy className="powered-by--more" />
    </div>
  );
}
