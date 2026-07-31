import {
  calculateSaleTotals,
  type DeliveryStatus,
  type PaymentMethod,
  type SalesChannel,
} from "@pocket/domain";
import { completeSale, db, getDeviceId } from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Banknote,
  Boxes,
  ChevronRight,
  Minus,
  PackageOpen,
  Plus,
  ScanLine,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCartStore } from "../../app/cartStore";
import { formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

export default function SellPage() {
  const { activeShop } = useShop();
  const shopId = activeShop?.id ?? "";
  const navigate = useNavigate();
  const { show } = useToast();
  const { items, updateQuantity, updatePrice, removeItem, customerId, setCustomerId, clear } =
    useCartStore();
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [channel, setChannel] = useState<SalesChannel>("direct");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("not_required");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const customers =
    useLiveQuery(
      () =>
        db.customers
          .where("shopId")
          .equals(shopId)
          .filter((c) => c.active)
          .toArray(),
      [shopId],
      [],
    ) ?? [];
  const totals = useMemo(
    () =>
      calculateSaleTotals(
        items.map((item) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
        })),
        discount,
        shipping,
        amountPaid,
      ),
    [items, discount, shipping, amountPaid],
  );
  async function submit() {
    if (!activeShop) return;
    if (totals.amountDue > 0 && !customerId) {
      setError("Chọn khách hàng để ghi nhận khoản còn thiếu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await completeSale({
        shopId,
        deviceId: getDeviceId(),
        customerId,
        sourceChannel: channel,
        paymentMethod,
        deliveryStatus,
        lines: items.map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
        })),
        discount,
        shippingFeeCharged: shipping,
        amountPaid,
        note,
      });
      clear();
      show("Đã hoàn tất đơn và trừ tồn kho");
      navigate(`/order-success/${result.sale.id}`, { state: result });
    } catch (cause) {
      setError(toVietnameseError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sell-page">
      <PageHeader
        title="Lên đơn"
        eyebrow="ĐƠN BÁN MỚI"
        action={
          <Badge tone={navigator.onLine ? "success" : "warning"}>
            {navigator.onLine ? "Online" : "Offline"}
          </Badge>
        }
      />
      {items.length === 0 ? (
        <Card className="empty-cart">
          <span>
            <ShoppingBag />
          </span>
          <h2>Giỏ hàng đang trống</h2>
          <p>Quét tem QR trên áo để thêm đúng size, màu và kiểu vào đơn.</p>
          <Link className="button button--primary" to="/scan">
            <ScanLine />
            Quét QR để bán
          </Link>
          <Link className="text-link" to="/inventory?mode=select">
            Chọn từ kho áo <ChevronRight />
          </Link>
        </Card>
      ) : (
        <div className="sell-layout">
          <section>
            <div className="cart-heading">
              <h2>{items.length} size trong đơn</h2>
              <div className="cart-heading__actions">
                <Link to="/inventory?mode=select">
                  <Boxes /> Chọn từ kho
                </Link>
                <Link to="/scan">
                  <ScanLine /> Quét thêm
                </Link>
              </div>
            </div>
            <div className="cart-list">
              {items.map((item) => (
                <Card className="cart-line" key={item.variant.id}>
                  <span className="product-swatch">
                    <PackageOpen />
                  </span>
                  <div className="cart-line__main">
                    <strong>{item.product.name}</strong>
                    <span>{item.variant.attributeSummary}</span>
                    <small>
                      {item.variant.sku} · Tồn {item.variant.stockQuantity}
                    </small>
                    <label>
                      Giá bán{" "}
                      <input
                        aria-label={`Giá bán ${item.product.name}`}
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updatePrice(item.variant.id, Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <div className="cart-line__side">
                    <button
                      type="button"
                      aria-label="Xóa"
                      onClick={() => removeItem(item.variant.id)}
                    >
                      <Trash2 />
                    </button>
                    <b>{formatMoney(item.quantity * item.unitPrice)}</b>
                    <div className="stepper">
                      <button
                        type="button"
                        aria-label="Giảm"
                        onClick={() =>
                          item.quantity === 1
                            ? removeItem(item.variant.id)
                            : updateQuantity(item.variant.id, item.quantity - 1)
                        }
                      >
                        <Minus />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Tăng"
                        onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}
                      >
                        <Plus />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
          <aside className="order-panel">
            <Card>
              <h2>Thông tin đơn</h2>
              <label className="select-row">
                <span>
                  <UserRound />
                  <i>
                    <b>Khách hàng</b>
                    <small>{customerId ? "Đã chọn" : "Khách lẻ"}</small>
                  </i>
                </span>
                <select
                  value={customerId ?? ""}
                  onChange={(e) => setCustomerId(e.target.value || undefined)}
                >
                  <option value="">Khách lẻ</option>
                  {customers.map((customer) => (
                    <option value={customer.id} key={customer.id}>
                      {customer.name} · {customer.phone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-row">
                <span>
                  <ShoppingBag />
                  <i>
                    <b>Kênh bán</b>
                    <small>Nguồn đơn hàng</small>
                  </i>
                </span>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as SalesChannel)}
                >
                  <option value="direct">Trực tiếp</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                  <option value="zalo">Zalo</option>
                  <option value="shopee">Shopee</option>
                  <option value="other">Khác</option>
                </select>
              </label>
              <label className="select-row">
                <span>
                  <Truck />
                  <i>
                    <b>Giao hàng</b>
                    <small>Trạng thái xử lý</small>
                  </i>
                </span>
                <select
                  value={deliveryStatus}
                  onChange={(e) => setDeliveryStatus(e.target.value as DeliveryStatus)}
                >
                  <option value="not_required">Không cần giao</option>
                  <option value="pending_confirmation">Chờ xác nhận</option>
                  <option value="packing">Đang đóng gói</option>
                  <option value="shipping">Đang giao</option>
                  <option value="delivered">Đã giao</option>
                </select>
              </label>
            </Card>
            <Card>
              <h2>Thanh toán</h2>
              <div className="money-field">
                <span>Giảm giá</span>
                <div>
                  <input
                    aria-label="Giảm giá đơn hàng"
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                  />
                  <span>₫</span>
                </div>
              </div>
              <div className="money-field">
                <span>Phí ship thu khách</span>
                <div>
                  <input
                    aria-label="Phí ship thu khách"
                    type="number"
                    min="0"
                    value={shipping}
                    onChange={(e) => setShipping(Number(e.target.value))}
                  />
                  <span>₫</span>
                </div>
              </div>
              <label className="select-row">
                <span>
                  <Banknote />
                  <i>
                    <b>Phương thức</b>
                  </i>
                </span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">Tiền mặt</option>
                  <option value="bank_transfer">Chuyển khoản</option>
                  <option value="cod">COD</option>
                  <option value="card">Thẻ</option>
                  <option value="other">Khác</option>
                </select>
              </label>
              <div className="money-field money-field--paid">
                <span>Khách thanh toán</span>
                <div>
                  <input
                    aria-label="Số tiền khách thanh toán"
                    type="number"
                    min="0"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                  />
                  <span>₫</span>
                </div>
              </div>
              <label className="note-field">
                Ghi chú
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Giao sau 18h…"
                />
              </label>
            </Card>
            <Card className="order-total">
              <div>
                <span>Tạm tính</span>
                <b>{formatMoney(totals.subtotal)}</b>
              </div>
              <div>
                <span>Giảm giá</span>
                <b>− {formatMoney(discount)}</b>
              </div>
              <div>
                <span>Phí ship</span>
                <b>+ {formatMoney(shipping)}</b>
              </div>
              <div className="order-total__grand">
                <span>Tổng đơn</span>
                <strong>{formatMoney(totals.total)}</strong>
              </div>
              {totals.amountDue > 0 && (
                <div className="order-total__due">
                  <span>Khách còn thiếu</span>
                  <strong>{formatMoney(totals.amountDue)}</strong>
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button disabled={busy} onClick={submit}>
                {busy ? "Đang xuất kho…" : "Hoàn tất đơn & Xuất kho"}
                <ChevronRight />
              </Button>
              <small>Kho chỉ thay đổi sau khi hoàn tất. Toàn bộ thao tác được lưu cùng lúc.</small>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
