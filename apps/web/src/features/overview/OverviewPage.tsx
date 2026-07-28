import { calculateReport } from "@pocket/domain";
import { db } from "@pocket/local-db";
import { Badge, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  Banknote,
  Box,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  PackagePlus,
  RefreshCw,
  ScanLine,
  Shirt,
  ShoppingBag,
  TrendingUp,
  Undo2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatDateTime, formatMoney } from "../../app/format";
import { useShop } from "../../app/ShopContext";

export default function OverviewPage() {
  const { activeShop } = useShop();
  const shopId = activeShop?.id ?? "";
  const data = useLiveQuery(async () => {
    const [sales, saleLines, expenses, returns, variants, products, customers, logs, pending] =
      await Promise.all([
        db.sales.where("shopId").equals(shopId).toArray(),
        db.saleLines.where("shopId").equals(shopId).toArray(),
        db.expenses.where("shopId").equals(shopId).toArray(),
        db.returnExchanges.where("shopId").equals(shopId).toArray(),
        db.variants.where("shopId").equals(shopId).toArray(),
        db.products.where("shopId").equals(shopId).toArray(),
        db.customers.where("shopId").equals(shopId).toArray(),
        db.auditLogs.where("shopId").equals(shopId).reverse().limit(5).toArray(),
        db.outbox.where("[shopId+syncStatus]").equals([shopId, "pending"]).count(),
      ]);
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter((sale) => sale.completedAt?.startsWith(today));
    const todayIds = new Set(todaySales.map((sale) => sale.id));
    const report = calculateReport({
      sales: todaySales,
      saleLines: saleLines.filter((line) => todayIds.has(line.saleId)),
      expenses: expenses.filter((expense) => expense.date.startsWith(today)),
      returns: returns.filter((item) => item.completedAt.startsWith(today)),
    });
    return { sales, saleLines, variants, products, customers, logs, pending, todaySales, report };
  }, [shopId]);
  if (!data)
    return (
      <div className="overview-page">
        <div className="skeleton" style={{ height: 180 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  const lowStock = data.variants.filter(
    (variant) => variant.stockQuantity <= variant.lowStockThreshold,
  );
  const owed = data.customers.reduce((sum, customer) => sum + customer.totalReceivable, 0);
  const shipping = data.sales.filter((sale) =>
    ["pending_confirmation", "packing", "shipping"].includes(sale.deliveryStatus),
  ).length;
  const productNames = new Map(data.products.map((product) => [product.id, product.name]));
  const best = [
    ...data.saleLines.reduce(
      (map, line) =>
        map.set(
          line.productId,
          (map.get(line.productId) ?? 0) + line.quantity - line.returnedQuantity,
        ),
      new Map<string, number>(),
    ),
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  return (
    <div className="overview-page">
      <header className="overview-header">
        <div>
          <p className="eyebrow">
            HÔM NAY ·{" "}
            {new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })
              .format(new Date())
              .toUpperCase()}
          </p>
          <h1>
            Chào buổi{" "}
            {new Date().getHours() < 12 ? "sáng" : new Date().getHours() < 18 ? "chiều" : "tối"} 👋
          </h1>
          <p>{activeShop?.name}</p>
        </div>
        <Link to="/sync" className="sync-pill">
          <span className={data.pending ? "is-pending" : ""}>
            <RefreshCw />
          </span>
          {data.pending ? `${data.pending} chờ đồng bộ` : "Đã lưu"}
        </Link>
      </header>
      <section className="overview-hero">
        <div>
          <p>DOANH THU HÔM NAY</p>
          <strong>{formatMoney(data.report.netRevenue)}</strong>
          <span>
            <TrendingUp /> Lợi nhuận gộp {formatMoney(data.report.grossProfit)}
          </span>
        </div>
        <div className="overview-hero__meta">
          <span>
            <b>{data.todaySales.length}</b> đơn hàng
          </span>
          <span>
            <b>{data.report.unitsSold}</b> áo đã bán
          </span>
        </div>
        <Link to="/scan">
          <ScanLine />
          Quét QR để bán <ArrowRight />
        </Link>
      </section>
      <div className="quick-actions">
        <Link to="/receive">
          <span className="quick-actions__amber">
            <PackagePlus />
          </span>
          <b>Nhập áo</b>
        </Link>
        <Link to="/products/new">
          <span className="quick-actions__violet">
            <Shirt />
          </span>
          <b>Thêm mẫu áo</b>
        </Link>
        <Link to="/returns">
          <span className="quick-actions__blue">
            <Undo2 />
          </span>
          <b>Đổi / Trả</b>
        </Link>
        <Link to="/expenses">
          <span className="quick-actions__green">
            <CircleDollarSign />
          </span>
          <b>Chi phí</b>
        </Link>
      </div>
      <section className="overview-grid">
        <Card className="overview-card overview-card--wide">
          <div className="section-title">
            <div>
              <h2>Cần chú ý</h2>
              <p>Việc cần xử lý trong shop</p>
            </div>
          </div>
          <div className="attention-list">
            <Link to="/customers">
              <span className="attention-icon attention-icon--red">
                <Users />
              </span>
              <span>
                <strong>Khách còn thiếu</strong>
                <small>
                  {data.customers.filter((customer) => customer.totalReceivable > 0).length} khách
                  cần thu
                </small>
              </span>
              <b>{formatMoney(owed)}</b>
              <ChevronRight />
            </Link>
            <Link to="/orders">
              <span className="attention-icon attention-icon--amber">
                <Clock3 />
              </span>
              <span>
                <strong>Chờ giao hàng</strong>
                <small>Đơn đang xử lý</small>
              </span>
              <b>{shipping}</b>
              <ChevronRight />
            </Link>
            <Link to="/inventory?filter=low">
              <span className="attention-icon attention-icon--blue">
                <Box />
              </span>
              <span>
                <strong>Sắp hết hàng</strong>
                <small>Tồn bằng hoặc dưới ngưỡng</small>
              </span>
              <b>{lowStock.length}</b>
              <ChevronRight />
            </Link>
          </div>
        </Card>
        <Card className="overview-card">
          <div className="section-title">
            <div>
              <h2>Bán chạy</h2>
              <p>Theo số áo đã bán</p>
            </div>
            <Link to="/reports">Xem báo cáo</Link>
          </div>
          {best.length ? (
            <div className="best-list">
              {best.map(([productId, quantity], index) => (
                <div key={productId}>
                  <i>{index + 1}</i>
                  <span className="product-swatch product-swatch--shirt">
                    <Shirt />
                  </span>
                  <span>
                    <strong>{productNames.get(productId)}</strong>
                    <small>{quantity} áo đã bán</small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="compact-empty">Chưa có đơn hoàn tất hôm nay.</p>
          )}
        </Card>
        <Card className="overview-card">
          <div className="section-title">
            <div>
              <h2>Hoạt động gần đây</h2>
              <p>Mọi thay đổi đều có lịch sử</p>
            </div>
          </div>
          <div className="activity-list">
            {data.logs.length ? (
              data.logs.map((log) => (
                <div key={log.id}>
                  <span>
                    {log.entityType === "sale" ? (
                      <ShoppingBag />
                    ) : log.entityType === "payment" ? (
                      <Banknote />
                    ) : (
                      <Box />
                    )}
                  </span>
                  <p>
                    <strong>{log.summary}</strong>
                    <small>{formatDateTime(log.createdAt)}</small>
                  </p>
                  <Badge tone="success">Đã lưu</Badge>
                </div>
              ))
            ) : (
              <p className="compact-empty">Hoạt động mới sẽ xuất hiện tại đây.</p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
