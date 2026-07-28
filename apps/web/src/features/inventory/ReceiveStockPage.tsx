import { db, getDeviceId, receiveStock } from "@pocket/local-db";
import { Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, PackagePlus, Truck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

export default function ReceiveStockPage() {
  const { activeShop } = useShop();
  const shopId = activeShop?.id ?? "";
  const navigate = useNavigate();
  const { show } = useToast();
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [amountPaid, setAmountPaid] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = useLiveQuery(
    async () => ({
      products: await db.products.where("shopId").equals(shopId).toArray(),
      variants: await db.variants.where("shopId").equals(shopId).toArray(),
      suppliers: await db.suppliers.where("shopId").equals(shopId).toArray(),
    }),
    [shopId],
    { products: [], variants: [], suppliers: [] },
  );
  const selectedProduct = productId || data.products[0]?.id || "";
  const variants = data.variants.filter((v) => v.productId === selectedProduct);
  const parts = variants.map((v) => v.attributeSummary.split(" · "));
  const colors = [...new Set(parts.map((p) => p[0]))];
  const sizes = [...new Set(parts.map((p) => p[1]))];
  const neck = parts[0]?.[2];
  const lines = variants
    .filter((v) => (quantities[v.id] ?? 0) > 0)
    .map((v) => ({
      variantId: v.id,
      quantity: quantities[v.id] ?? 0,
      unitCost: costs[v.id] ?? v.purchasePrice,
    }));
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  async function submit() {
    if (!activeShop || lines.length === 0) {
      setError("Nhập số lượng cho ít nhất một biến thể.");
      return;
    }
    setBusy(true);
    try {
      const purchase = await receiveStock({
        shopId,
        deviceId: getDeviceId(),
        supplierId: supplierId || undefined,
        amountPaid,
        note,
        lines,
      });
      show(`Đã nhập áo ${purchase.receiptNumber}`);
      navigate("/inventory");
    } catch (cause) {
      setError(toVietnameseError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader title="Nhập áo" eyebrow="ĐỢT NHẬP ÁO MỚI" back />
      <div className="receive-layout">
        <main>
          <Card className="receive-info">
            <label>
              <span>
                <PackagePlus />
                Mẫu áo
              </span>
              <select value={selectedProduct} onChange={(e) => setProductId(e.target.value)}>
                {data.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                <Truck />
                Xưởng / Nhà cung cấp
              </span>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Chưa chọn xưởng</option>
                {data.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            {neck && (
              <p>
                Kiểu cổ: <b>{neck}</b>
              </p>
            )}
          </Card>
          <Card className="receive-matrix">
            <div className="matrix-row matrix-head">
              <span>Size \ Màu</span>
              {colors.map((color) => (
                <b key={color}>{color}</b>
              ))}
            </div>
            {sizes.map((size) => (
              <div className="matrix-row" key={size}>
                <strong>{size}</strong>
                {colors.map((color) => {
                  const variant = variants.find((v) => {
                    const p = v.attributeSummary.split(" · ");
                    return p[0] === color && p[1] === size;
                  });
                  return variant ? (
                    <label key={color}>
                      <input
                        aria-label={`${size} ${color}`}
                        type="number"
                        min="0"
                        value={quantities[variant.id] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setQuantities({ ...quantities, [variant.id]: Number(e.target.value) })
                        }
                      />
                      <small>Tồn {variant.stockQuantity}</small>
                    </label>
                  ) : (
                    <span key={color}>—</span>
                  );
                })}
              </div>
            ))}
          </Card>
          <Card className="cost-editor">
            <h2>Giá nhập</h2>
            <p>Giá hiện tại được điền sẵn; thay đổi sẽ cập nhật giá vốn bình quân.</p>
            {variants
              .filter((v) => (quantities[v.id] ?? 0) > 0)
              .map((variant) => (
                <label key={variant.id}>
                  <span>
                    {variant.attributeSummary}
                    <small>{quantities[variant.id]} áo</small>
                  </span>
                  <div>
                    <input
                      type="number"
                      value={costs[variant.id] ?? variant.purchasePrice}
                      onChange={(e) => setCosts({ ...costs, [variant.id]: Number(e.target.value) })}
                    />
                    <i>₫</i>
                  </div>
                </label>
              ))}
          </Card>
        </main>
        <aside>
          <Card className="receive-summary">
            <h2>Tổng đợt nhập</h2>
            <div>
              <span>Số biến thể</span>
              <b>{lines.length}</b>
            </div>
            <div>
              <span>Tổng số áo</span>
              <b>{lines.reduce((sum, line) => sum + line.quantity, 0)}</b>
            </div>
            <div className="total">
              <span>Thành tiền</span>
              <strong>{formatMoney(total)}</strong>
            </div>
            <label>
              Đã trả xưởng
              <div>
                <input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                />
                <i>₫</i>
              </div>
            </label>
            <div className="due">
              <span>Còn nợ xưởng</span>
              <b>{formatMoney(Math.max(0, total - amountPaid))}</b>
            </div>
            <label>
              Ghi chú
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <Button onClick={submit} disabled={busy}>
              {busy ? "Đang nhập kho…" : "Hoàn tất đợt nhập"}
              <Check />
            </Button>
            <small>Tồn kho, giá vốn, công nợ và lịch sử sẽ được lưu cùng lúc.</small>
          </Card>
        </aside>
      </div>
    </div>
  );
}
