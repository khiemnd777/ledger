import type { Product, ProductVariant, Purchase, Supplier } from "@pocket/domain";
import { cancelCompletedPurchase, db, getDeviceId, updatePurchaseDetails } from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Factory, PackageOpen, Pencil, ReceiptText, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDateTime, formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader, SearchField } from "../../components/Ui";

const statusLabels: Record<Purchase["status"], string> = {
  draft: "Nháp",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

export default function PurchasesPage() {
  const { activeShop } = useShop();
  const { purchaseId } = useParams();
  const { show } = useToast();
  const shopId = activeShop?.id ?? "";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Purchase["status"]>("all");
  const [editing, setEditing] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const data = useLiveQuery(
    async () => ({
      purchases: await db.purchases.where("shopId").equals(shopId).reverse().sortBy("receivedAt"),
      suppliers: await db.suppliers.where("shopId").equals(shopId).toArray(),
      products: await db.products.where("shopId").equals(shopId).toArray(),
      variants: await db.variants.where("shopId").equals(shopId).toArray(),
    }),
    [shopId],
    {
      purchases: [] as Purchase[],
      suppliers: [] as Supplier[],
      products: [] as Product[],
      variants: [] as ProductVariant[],
    },
  );
  const detail = useLiveQuery(
    async () =>
      purchaseId
        ? {
            purchase: await db.purchases.get(purchaseId),
            lines: await db.purchaseLines.where("purchaseId").equals(purchaseId).toArray(),
          }
        : undefined,
    [purchaseId],
  );
  const supplierNames = new Map(data.suppliers.map((supplier) => [supplier.id, supplier.name]));
  const productNames = new Map(data.products.map((product) => [product.id, product.name]));
  const variants = new Map(data.variants.map((variant) => [variant.id, variant]));
  const purchase = detail?.purchase;

  async function save() {
    if (!purchase) return;
    try {
      await updatePurchaseDetails({
        shopId,
        deviceId: getDeviceId(),
        purchaseId: purchase.id,
        supplierId: supplierId || undefined,
        receivedAt: `${receivedAt}T00:00:00.000Z`,
        note,
      });
      show("Đã cập nhật phiếu nhập");
      setEditing(false);
    } catch (cause) {
      setError(toVietnameseError(cause));
    }
  }

  async function cancel() {
    if (!purchase) return;
    if (
      !window.confirm(
        "Hủy phiếu nhập và tạo phát sinh xuất trả xưởng, giảm công nợ, ghi nhận tiền hoàn?",
      )
    )
      return;
    try {
      await cancelCompletedPurchase(shopId, getDeviceId(), purchase.id);
      show("Đã hủy phiếu nhập bằng các phát sinh đảo chiều");
    } catch (cause) {
      show(toVietnameseError(cause));
    }
  }

  if (purchase && detail) {
    return (
      <div>
        <PageHeader
          title={purchase.receiptNumber}
          eyebrow="CHI TIẾT PHIẾU NHẬP"
          back
          action={
            <Badge tone={purchase.status === "cancelled" ? "neutral" : "success"}>
              {statusLabels[purchase.status]}
            </Badge>
          }
        />
        <div className="detail-grid">
          <Card>
            <h2>Sản phẩm nhập</h2>
            {detail.lines.map((line) => {
              const variant = variants.get(line.variantId);
              return (
                <div className="order-line" key={line.id}>
                  <span className="product-swatch">
                    <PackageOpen />
                  </span>
                  <span>
                    <strong>{productNames.get(line.productId) ?? "Mẫu áo"}</strong>
                    <small>
                      {variant?.attributeSummary} · {variant?.sku}
                    </small>
                    <small>
                      {line.quantity} × {formatMoney(line.unitCost)}
                    </small>
                  </span>
                  <b>{formatMoney(line.lineTotal)}</b>
                </div>
              );
            })}
          </Card>
          <Card className="order-breakdown">
            <h2>Thanh toán xưởng</h2>
            <div>
              <span>Tổng phiếu</span>
              <b>{formatMoney(purchase.total)}</b>
            </div>
            <div>
              <span>Đã trả</span>
              <b>{formatMoney(purchase.amountPaid)}</b>
            </div>
            <div className="total">
              <span>Còn nợ</span>
              <strong>{formatMoney(purchase.amountDue)}</strong>
            </div>
          </Card>
          <Card>
            <h2>Thông tin</h2>
            <dl className="info-list">
              <div>
                <dt>Xưởng</dt>
                <dd>{supplierNames.get(purchase.supplierId ?? "") ?? "Chưa chọn xưởng"}</dd>
              </div>
              <div>
                <dt>Ngày nhập</dt>
                <dd>{formatDateTime(purchase.receivedAt)}</dd>
              </div>
              <div>
                <dt>Ghi chú</dt>
                <dd>{purchase.note || "—"}</dd>
              </div>
            </dl>
            {purchase.status === "completed" && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSupplierId(purchase.supplierId ?? "");
                    setReceivedAt(purchase.receivedAt.slice(0, 10));
                    setNote(purchase.note ?? "");
                    setError("");
                    setEditing(true);
                  }}
                >
                  <Pencil /> Sửa thông tin
                </Button>
                <Button variant="danger" onClick={cancel}>
                  Hủy phiếu & Đảo phát sinh
                </Button>
              </>
            )}
          </Card>
        </div>
        {editing && (
          <div className="sheet-backdrop">
            <div className="bottom-sheet">
              <button
                type="button"
                className="sheet-close"
                aria-label="Đóng"
                onClick={() => setEditing(false)}
              >
                <X />
              </button>
              <h2>Sửa phiếu nhập</h2>
              <p>Sản phẩm, số lượng và số tiền đã chốt được giữ bất biến.</p>
              <div className="form-card">
                <label>
                  Xưởng / Nhà cung cấp
                  <select
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                  >
                    <option value="">Chưa chọn xưởng</option>
                    {data.suppliers
                      .filter((supplier) => supplier.active || supplier.id === supplierId)
                      .map((supplier) => (
                        <option value={supplier.id} key={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Ngày nhập
                  <input
                    type="date"
                    value={receivedAt}
                    onChange={(event) => setReceivedAt(event.target.value)}
                  />
                </label>
                <label>
                  Ghi chú
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </div>
              {error && <p className="form-error">{error}</p>}
              <Button onClick={save}>Lưu thay đổi</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const filtered = data.purchases.filter(
    (item) =>
      (status === "all" || item.status === status) &&
      `${item.receiptNumber} ${supplierNames.get(item.supplierId ?? "") ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div>
      <PageHeader title="Phiếu nhập" eyebrow="LỊCH SỬ NHẬP ÁO" />
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Tìm mã phiếu hoặc xưởng" />
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="completed">Hoàn tất</option>
          <option value="cancelled">Đã hủy</option>
        </select>
      </div>
      <div className="order-list">
        {filtered.map((item) => (
          <Link to={`/purchases/${item.id}`} key={item.id}>
            <Card>
              <span className="order-list__icon">
                <ReceiptText />
              </span>
              <span>
                <strong>{item.receiptNumber}</strong>
                <small>
                  <Factory /> {supplierNames.get(item.supplierId ?? "") ?? "Chưa chọn xưởng"}
                </small>
                <small>{formatDateTime(item.receivedAt)}</small>
              </span>
              <span>
                <b>{formatMoney(item.total)}</b>
                <Badge
                  tone={
                    item.status === "cancelled" ? "neutral" : item.amountDue ? "warning" : "success"
                  }
                >
                  {item.status === "cancelled"
                    ? "Đã hủy"
                    : item.amountDue
                      ? `Nợ ${formatMoney(item.amountDue)}`
                      : "Đã trả đủ"}
                </Badge>
              </span>
              <ChevronRight />
            </Card>
          </Link>
        ))}
        {!filtered.length && (
          <Card className="compact-empty">
            Không có phiếu nhập phù hợp. <Link to="/receive">Tạo phiếu nhập</Link>
          </Card>
        )}
      </div>
    </div>
  );
}
