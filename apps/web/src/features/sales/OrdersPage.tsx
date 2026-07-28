import type { Sale } from "@pocket/domain";
import { cancelCompletedSale, db, getDeviceId } from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, PackageOpen, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDateTime, formatMoney } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader, SearchField } from "../../components/Ui";

const statusLabels: Record<string, string> = {
  draft: "Nháp",
  pending: "Chờ xử lý",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  partially_returned: "Trả một phần",
  fully_returned: "Đã trả",
};
export default function OrdersPage() {
  const { activeShop } = useShop();
  const { show } = useToast();
  const { saleId } = useParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const sales =
    useLiveQuery<Sale[]>(
      () =>
        activeShop
          ? db.sales.where("shopId").equals(activeShop.id).reverse().sortBy("createdAt")
          : Promise.resolve([] as Sale[]),
      [activeShop?.id],
    ) ?? [];
  const detail = useLiveQuery(
    async () =>
      saleId
        ? {
            sale: await db.sales.get(saleId),
            lines: await db.saleLines.where("saleId").equals(saleId).toArray(),
            payments: await db.payments.where("referenceId").equals(saleId).toArray(),
          }
        : undefined,
    [saleId],
  );
  const detailSale = detail?.sale;
  if (saleId && detailSale)
    return (
      <div>
        <PageHeader
          title={detailSale.orderNumber}
          eyebrow="CHI TIẾT ĐƠN HÀNG"
          back
          action={
            <Badge tone={detailSale.status.includes("returned") ? "warning" : "success"}>
              {statusLabels[detailSale.status]}
            </Badge>
          }
        />
        <div className="detail-grid">
          <Card>
            <h2>Sản phẩm</h2>
            {detail.lines.map((line) => (
              <div className="order-line" key={line.id}>
                <span className="product-swatch">
                  <PackageOpen />
                </span>
                <span>
                  <strong>{line.productNameSnapshot}</strong>
                  <small>
                    {line.variantNameSnapshot} · {line.skuSnapshot}
                  </small>
                  <small>
                    {line.quantity} × {formatMoney(line.unitPrice)}
                  </small>
                </span>
                <b>{formatMoney(line.lineTotal)}</b>
              </div>
            ))}
          </Card>
          <Card className="order-breakdown">
            <h2>Thanh toán</h2>
            <div>
              <span>Tạm tính</span>
              <b>{formatMoney(detailSale.subtotal)}</b>
            </div>
            <div>
              <span>Giảm giá</span>
              <b>−{formatMoney(detailSale.discount)}</b>
            </div>
            <div>
              <span>Phí ship</span>
              <b>{formatMoney(detailSale.shippingFeeCharged)}</b>
            </div>
            <div className="total">
              <span>Tổng cộng</span>
              <strong>{formatMoney(detailSale.total)}</strong>
            </div>
            <div>
              <span>Khách còn thiếu</span>
              <b>{formatMoney(detailSale.amountDue)}</b>
            </div>
          </Card>
          <Card>
            <h2>Thông tin</h2>
            <dl className="info-list">
              <div>
                <dt>Kênh bán</dt>
                <dd>{detailSale.sourceChannel}</dd>
              </div>
              <div>
                <dt>Giao hàng</dt>
                <dd>{detailSale.deliveryStatus}</dd>
              </div>
              <div>
                <dt>Hoàn tất</dt>
                <dd>{formatDateTime(detailSale.completedAt)}</dd>
              </div>
              <div>
                <dt>Ghi chú</dt>
                <dd>{detailSale.note || "—"}</dd>
              </div>
            </dl>
            {["completed", "partially_returned"].includes(detailSale.status) && (
              <Link className="button button--secondary" to={`/returns?sale=${detailSale.id}`}>
                Đổi / Trả áo
              </Link>
            )}
            {detailSale.status === "completed" && (
              <Button
                variant="danger"
                onClick={async () => {
                  if (
                    !activeShop ||
                    !window.confirm("Hủy đơn, hoàn toàn bộ tồn kho và ghi nhận khoản hoàn khách?")
                  )
                    return;
                  await cancelCompletedSale(activeShop.id, getDeviceId(), detailSale.id);
                  show("Đã hủy đơn và hoàn tồn bằng phát sinh đảo chiều");
                }}
              >
                Hủy đơn & Hoàn tồn
              </Button>
            )}
          </Card>
        </div>
      </div>
    );
  const filtered = sales.filter(
    (sale) =>
      (status === "all" || sale.status === status) &&
      sale.orderNumber.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div>
      <PageHeader title="Đơn hàng" eyebrow="LỊCH SỬ BÁN ÁO" />
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Tìm mã đơn" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="completed">Hoàn tất</option>
          <option value="partially_returned">Đã đổi/trả</option>
          <option value="cancelled">Đã hủy</option>
        </select>
      </div>
      <div className="order-list">
        {filtered.length ? (
          filtered.map((sale) => (
            <Link to={`/orders/${sale.id}`} key={sale.id}>
              <Card>
                <span className="order-list__icon">
                  <ShoppingBag />
                </span>
                <span>
                  <strong>{sale.orderNumber}</strong>
                  <small>
                    {formatDateTime(sale.completedAt)} · {sale.sourceChannel}
                  </small>
                </span>
                <span>
                  <b>{formatMoney(sale.total)}</b>
                  <Badge tone={sale.amountDue ? "warning" : "success"}>
                    {sale.amountDue
                      ? `Thiếu ${formatMoney(sale.amountDue)}`
                      : statusLabels[sale.status]}
                  </Badge>
                </span>
                <ChevronRight />
              </Card>
            </Link>
          ))
        ) : (
          <Card className="compact-empty">Không có đơn hàng phù hợp.</Card>
        )}
      </div>
    </div>
  );
}
