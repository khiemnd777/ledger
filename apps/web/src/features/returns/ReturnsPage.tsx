import type { ReturnExchange } from "@pocket/domain";
import { completeReturnExchange, db, getDeviceId } from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Check, PackageOpen, Repeat2, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

const reasons: Array<[ReturnExchange["reason"], string]> = [
  ["wrong_size", "Sai size"],
  ["wrong_color", "Sai màu"],
  ["defective", "Sản phẩm lỗi"],
  ["changed_mind", "Khách đổi ý"],
  ["wrong_item", "Giao sai áo"],
  ["other", "Lý do khác"],
];
export default function ReturnsPage() {
  const { activeShop } = useShop();
  const [params] = useSearchParams();
  const { show } = useToast();
  const shopId = activeShop?.id ?? "";
  const [saleId, setSaleId] = useState(params.get("sale") ?? "");
  const [lineId, setLineId] = useState("");
  const [type, setType] = useState<"return" | "exchange">("exchange");
  const [reason, setReason] = useState<ReturnExchange["reason"]>("wrong_size");
  const [restock, setRestock] = useState(true);
  const [replacementId, setReplacementId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<ReturnExchange>();
  const data = useLiveQuery(
    async () => ({
      sales: await db.sales
        .where("shopId")
        .equals(shopId)
        .filter((sale) => ["completed", "partially_returned"].includes(sale.status))
        .reverse()
        .toArray(),
      lines: saleId ? await db.saleLines.where("saleId").equals(saleId).toArray() : [],
      variants: await db.variants.where("shopId").equals(shopId).toArray(),
      products: await db.products.where("shopId").equals(shopId).toArray(),
    }),
    [shopId, saleId],
    { sales: [], lines: [], variants: [], products: [] },
  );
  useEffect(() => {
    if (saleId && data.lines[0] && !lineId) setLineId(data.lines[0].id);
  }, [saleId, data.lines.length]);
  const line = data.lines.find((item) => item.id === lineId);
  const replacement = data.variants.find((v) => v.id === replacementId);
  const difference = line && replacement ? replacement.salePrice - line.unitPrice : 0;
  async function submit() {
    if (!line) {
      setError("Chọn sản phẩm cần đổi hoặc trả.");
      return;
    }
    setBusy(true);
    try {
      const record = await completeReturnExchange({
        shopId,
        deviceId: getDeviceId(),
        saleLineId: line.id,
        type,
        quantity: 1,
        reason,
        restock,
        replacementVariantId: type === "exchange" ? replacementId : undefined,
        paymentMethod: "cash",
      });
      setDone(record);
      show(type === "exchange" ? "Đổi áo hoàn tất" : "Trả áo hoàn tất");
    } catch (cause) {
      setError(toVietnameseError(cause));
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div>
        <PageHeader title="Đổi / Trả" eyebrow="ĐÃ HOÀN TẤT" back />
        <div className="return-success">
          <span>
            <Check />
          </span>
          <h2>{done.type === "exchange" ? "Đã đổi áo" : "Đã nhận áo trả"}</h2>
          <p>Tồn kho và báo cáo đã được cập nhật bằng các phát sinh đảo chiều.</p>
          <Card>
            <div>
              <span>Nhập lại kho</span>
              <b>{done.restock ? "Có" : "Không"}</b>
            </div>
            <div>
              <span>Thu thêm</span>
              <b>{formatMoney(done.collectionAmount)}</b>
            </div>
            <div>
              <span>Hoàn khách</span>
              <b>{formatMoney(done.refundAmount)}</b>
            </div>
          </Card>
          <Button
            onClick={() => {
              setDone(undefined);
              setSaleId("");
              setLineId("");
            }}
          >
            Xử lý đơn khác
          </Button>
        </div>
      </div>
    );
  return (
    <div>
      <PageHeader title="Đổi / Trả áo" eyebrow="GIỮ ĐỦ LỊCH SỬ KHO" back />
      <div className="return-layout">
        <main>
          <Card>
            <h2>1. Tìm đơn gốc</h2>
            <label className="select-row">
              <span>
                <Search />
                <i>
                  <b>Đơn hàng</b>
                  <small>Đơn hoàn tất hoặc đã trả một phần</small>
                </i>
              </span>
              <select
                value={saleId}
                onChange={(e) => {
                  setSaleId(e.target.value);
                  setLineId("");
                }}
              >
                <option value="">Chọn đơn hàng</option>
                {data.sales.map((sale) => (
                  <option value={sale.id} key={sale.id}>
                    {sale.orderNumber} · {formatMoney(sale.total)}
                  </option>
                ))}
              </select>
            </label>
          </Card>
          {saleId && (
            <Card>
              <h2>2. Chọn áo</h2>
              <div className="return-lines">
                {data.lines.map((item) => (
                  <button
                    type="button"
                    className={lineId === item.id ? "is-selected" : ""}
                    onClick={() => setLineId(item.id)}
                    key={item.id}
                  >
                    <span className="product-swatch">
                      <PackageOpen />
                    </span>
                    <span>
                      <strong>{item.productNameSnapshot}</strong>
                      <small>
                        {item.variantNameSnapshot} · {item.skuSnapshot}
                      </small>
                      <small>Còn có thể xử lý: {item.quantity - item.returnedQuantity}</small>
                    </span>
                    <b>{formatMoney(item.unitPrice)}</b>
                    <Check />
                  </button>
                ))}
              </div>
            </Card>
          )}
          {line && (
            <Card>
              <h2>3. Cách xử lý</h2>
              <div className="type-select">
                <button
                  type="button"
                  className={type === "exchange" ? "is-selected" : ""}
                  onClick={() => setType("exchange")}
                >
                  <Repeat2 />
                  <span>
                    <strong>Đổi áo</strong>
                    <small>Size, màu hoặc mẫu khác</small>
                  </span>
                  <Check />
                </button>
                <button
                  type="button"
                  className={type === "return" ? "is-selected" : ""}
                  onClick={() => setType("return")}
                >
                  <RotateCcw />
                  <span>
                    <strong>Trả & hoàn tiền</strong>
                    <small>Nhận lại áo từ khách</small>
                  </span>
                  <Check />
                </button>
              </div>
              <label>
                Lý do
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnExchange["reason"])}
                >
                  {reasons.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="switch-row">
                <span>
                  <strong>Nhập lại kho bán được</strong>
                  <small>Tắt nếu áo lỗi, bẩn hoặc hỏng</small>
                </span>
                <input
                  type="checkbox"
                  checked={restock}
                  onChange={(e) => setRestock(e.target.checked)}
                />
                <i />
              </label>
            </Card>
          )}
          {line && type === "exchange" && (
            <Card>
              <h2>4. Chọn áo đổi</h2>
              <select
                className="full-select"
                value={replacementId}
                onChange={(e) => setReplacementId(e.target.value)}
              >
                <option value="">Chọn size thay thế</option>
                {data.variants
                  .filter((v) => v.active && v.stockQuantity > 0 && v.id !== line.variantId)
                  .map((variant) => (
                    <option value={variant.id} key={variant.id}>
                      {data.products.find((p) => p.id === variant.productId)?.name} ·{" "}
                      {variant.attributeSummary} · tồn {variant.stockQuantity}
                    </option>
                  ))}
              </select>
            </Card>
          )}
        </main>
        <aside>
          <Card className="return-summary">
            <h2>Tóm tắt</h2>
            {line ? (
              <>
                <div>
                  <span>Áo khách trả</span>
                  <b>
                    {line.productNameSnapshot}
                    <small>{line.variantNameSnapshot}</small>
                  </b>
                </div>
                {type === "exchange" && (
                  <div>
                    <span>Áo khách nhận</span>
                    <b>
                      {replacement
                        ? `${data.products.find((p) => p.id === replacement.productId)?.name}`
                        : "Chưa chọn"}
                      <small>{replacement?.attributeSummary}</small>
                    </b>
                  </div>
                )}
                <div className="total">
                  <span>Chênh lệch</span>
                  <strong>
                    {difference > 0
                      ? `Thu thêm ${formatMoney(difference)}`
                      : difference < 0
                        ? `Hoàn ${formatMoney(Math.abs(difference))}`
                        : "Không chênh"}
                  </strong>
                </div>
                <p>
                  <Badge tone={restock ? "success" : "warning"}>
                    {restock ? "Áo trả sẽ cộng lại kho" : "Không nhập lại kho"}
                  </Badge>
                </p>
                {error && <p className="form-error">{error}</p>}
                <Button onClick={submit} disabled={busy || (type === "exchange" && !replacementId)}>
                  {busy ? "Đang xử lý…" : "Hoàn tất đổi / trả"}
                  <ArrowRight />
                </Button>
                <small>Đơn gốc không bị xóa. Mọi thay đổi dùng phát sinh đảo chiều.</small>
              </>
            ) : (
              <p>Chọn đơn và sản phẩm để xem tóm tắt.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
