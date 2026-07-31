import {
  adjustStock,
  db,
  getDeviceId,
  getInventoryConsistency,
  repairInventory,
  updateVariantNote,
} from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  History,
  PackageOpen,
  PackagePlus,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShoppingBag,
  StickyNote,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCartStore } from "../../app/cartStore";
import { formatDateTime, formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { alertVariantNote } from "../../app/variantNote";
import { useToast } from "../../components/Toast";
import { PageHeader, SearchField } from "../../components/Ui";
import { getStockAdjustmentDelta, QUICK_STOCK_ADJUSTMENT_REASON } from "./inventory.utils";

export default function InventoryPage() {
  const { activeShop } = useShop();
  const { show } = useToast();
  const [searchParams] = useSearchParams();
  const selectionMode = searchParams.get("mode") === "select";
  const shopId = activeShop?.id ?? "";
  const { items: cartItems, addItem } = useCartStore();
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const [tab, setTab] = useState<"stock" | "matrix" | "history" | "check">("stock");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">(
    searchParams.get("filter") === "low" ? "low" : "all",
  );
  const [productId, setProductId] = useState("");
  const [neck, setNeck] = useState("");
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof getInventoryConsistency>>>();
  const [editingStockId, setEditingStockId] = useState("");
  const [draftStockQuantity, setDraftStockQuantity] = useState("");
  const [savingStockId, setSavingStockId] = useState("");
  const [stockEditError, setStockEditError] = useState("");
  const [notingVariantId, setNotingVariantId] = useState("");
  const [draftVariantNote, setDraftVariantNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const stockInputRef = useRef<HTMLInputElement>(null);
  const data = useLiveQuery(
    async () => ({
      variants: await db.variants.where("shopId").equals(shopId).toArray(),
      products: await db.products.where("shopId").equals(shopId).toArray(),
      movements: await db.stockMovements
        .where("shopId")
        .equals(shopId)
        .reverse()
        .limit(100)
        .toArray(),
    }),
    [shopId],
    { variants: [], products: [], movements: [] },
  );
  const products = new Map(data.products.map((product) => [product.id, product]));
  const names = new Map(data.products.map((product) => [product.id, product.name]));
  const total = data.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const low = data.variants.filter(
    (v) => v.stockQuantity > 0 && v.stockQuantity <= v.lowStockThreshold,
  ).length;
  const out = data.variants.filter((v) => v.stockQuantity === 0).length;
  const value = data.variants.reduce((sum, v) => sum + v.stockQuantity * v.purchasePrice, 0);
  const filtered = data.variants
    .filter((variant) => {
      if (!selectionMode) return true;
      const product = products.get(variant.productId);
      return Boolean(product?.active && !product.deletedAt && variant.active && !variant.deletedAt);
    })
    .filter((v) =>
      `${names.get(v.productId)} ${v.attributeSummary} ${v.sku}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter(
      (v) =>
        filter === "all" ||
        (filter === "low"
          ? v.stockQuantity > 0 && v.stockQuantity <= v.lowStockThreshold
          : v.stockQuantity === 0),
    );
  const selectedProduct = productId || data.products[0]?.id || "";
  const matrixVariants = data.variants.filter((v) => v.productId === selectedProduct);
  const parts = matrixVariants.map((v) => v.attributeSummary.split(" · "));
  const colors = [...new Set(parts.map((p) => p[0]).filter(Boolean))];
  const sizes = [...new Set(parts.map((p) => p[1]).filter(Boolean))];
  const necks = [...new Set(parts.map((p) => p[2]).filter(Boolean))];
  const selectedNeck = neck || necks[0];
  const notingVariant = data.variants.find((variant) => variant.id === notingVariantId);
  async function runCheck() {
    setChecks(await getInventoryConsistency(shopId));
    setTab("check");
  }
  async function repair(variantId: string) {
    if (
      !window.confirm(
        "Sửa tồn cache theo tổng lịch sử kho? Hành động này sẽ được ghi vào nhật ký và không thay đổi lịch sử.",
      )
    )
      return;
    await repairInventory(
      shopId,
      getDeviceId(),
      variantId,
      "Người dùng xác nhận sửa từ màn hình kiểm tra",
    );
    setChecks(await getInventoryConsistency(shopId));
    show("Đã sửa tồn cache và lưu lịch sử");
  }
  function beginStockEdit(variantId: string, stockQuantity: number) {
    if (savingStockId) return;
    setEditingStockId(variantId);
    setDraftStockQuantity(String(stockQuantity));
    setStockEditError("");
  }
  function cancelStockEdit() {
    if (savingStockId) return;
    setEditingStockId("");
    setDraftStockQuantity("");
    setStockEditError("");
  }
  useEffect(() => {
    if (!editingStockId) return;
    stockInputRef.current?.focus();
    stockInputRef.current?.select();
  }, [editingStockId]);
  async function submitStockEdit(variantId: string, currentQuantity: number) {
    if (savingStockId) return;
    try {
      const quantityDelta = getStockAdjustmentDelta(currentQuantity, draftStockQuantity);
      if (quantityDelta === 0) {
        cancelStockEdit();
        return;
      }
      setSavingStockId(variantId);
      setStockEditError("");
      const result = await adjustStock({
        shopId,
        deviceId: getDeviceId(),
        variantId,
        quantityDelta,
        reason: QUICK_STOCK_ADJUSTMENT_REASON,
      });
      show(`Đã cập nhật tồn ${result.variant.sku}: ${result.variant.stockQuantity} áo`);
      setEditingStockId("");
      setDraftStockQuantity("");
    } catch (cause) {
      const message = toVietnameseError(cause);
      setStockEditError(message);
      show(message, "error");
    } finally {
      setSavingStockId("");
    }
  }
  function openVariantNote(variantId: string, note?: string) {
    setNotingVariantId(variantId);
    setDraftVariantNote(note ?? "");
    setNoteError("");
  }
  async function saveVariantNote() {
    if (!notingVariant || noteBusy) return;
    setNoteBusy(true);
    setNoteError("");
    try {
      const updated = await updateVariantNote({
        shopId,
        deviceId: getDeviceId(),
        variantId: notingVariant.id,
        note: draftVariantNote,
      });
      show(updated.note ? `Đã lưu ghi chú ${updated.sku}` : `Đã xóa ghi chú ${updated.sku}`);
      setNotingVariantId("");
      setDraftVariantNote("");
    } catch (cause) {
      setNoteError(toVietnameseError(cause));
    } finally {
      setNoteBusy(false);
    }
  }
  function addVariantToCart(variantId: string) {
    const variant = data.variants.find((item) => item.id === variantId);
    const product = variant ? products.get(variant.productId) : undefined;
    if (!variant || !product) return;
    if (variant.stockQuantity <= 0 && !activeShop?.allowNegativeStock) {
      show(`${variant.sku} đã hết hàng`);
      return;
    }
    alertVariantNote(variant.note);
    addItem(variant, product);
    show(`Đã thêm ${variant.sku} vào đơn`);
  }
  return (
    <div>
      <PageHeader
        title={selectionMode ? "Chọn áo vào đơn" : "Kho áo"}
        eyebrow={selectionMode ? "CHỌN SIZE TỪ KHO" : "TỒN KHO THEO SIZE"}
        action={
          selectionMode ? (
            <Link className="button button--primary compact-button" to="/sell">
              <ShoppingBag />
              Xem đơn ({cartQuantity})
            </Link>
          ) : (
            <div className="page-header-actions">
              <Link className="button button--secondary compact-button" to="/qr-labels">
                <QrCode />
                Tem QR
              </Link>
              <Link className="button button--primary compact-button" to="/receive">
                <PackagePlus />
                Nhập áo
              </Link>
            </div>
          )
        }
      />
      {!selectionMode && (
        <div className="inventory-stats">
          <Card>
            <span>
              <Boxes />
            </span>
            <div>
              <small>Tổng tồn</small>
              <strong>{total} áo</strong>
            </div>
          </Card>
          <Card>
            <span className="amber">
              <AlertTriangle />
            </span>
            <div>
              <small>Sắp hết</small>
              <strong>{low} size</strong>
            </div>
          </Card>
          <Card>
            <span className="red">
              <PackageOpen />
            </span>
            <div>
              <small>Hết hàng</small>
              <strong>{out} size</strong>
            </div>
          </Card>
          <Card>
            <span className="green">
              <ClipboardCheck />
            </span>
            <div>
              <small>Giá trị kho</small>
              <strong>{formatMoney(value)}</strong>
            </div>
          </Card>
        </div>
      )}
      {!selectionMode && (
        <div className="tabs">
          <button
            type="button"
            onClick={() => setTab("stock")}
            className={tab === "stock" ? "is-active" : ""}
          >
            <Boxes />
            Hiện tại
          </button>
          <button
            type="button"
            onClick={() => setTab("matrix")}
            className={tab === "matrix" ? "is-active" : ""}
          >
            <Search />
            Ma trận
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={tab === "history" ? "is-active" : ""}
          >
            <History />
            Lịch sử kho
          </button>
          <button type="button" onClick={runCheck} className={tab === "check" ? "is-active" : ""}>
            <CheckCircle2 />
            Kiểm tra
          </button>
        </div>
      )}
      {tab === "stock" && (
        <>
          <div className="toolbar">
            <SearchField value={query} onChange={setQuery} placeholder="Tìm mẫu, size, màu, SKU" />
            <div className="segmented">
              <button
                type="button"
                className={filter === "all" ? "is-active" : ""}
                onClick={() => setFilter("all")}
              >
                Tất cả
              </button>
              <button
                type="button"
                className={filter === "low" ? "is-active" : ""}
                onClick={() => setFilter("low")}
              >
                Sắp hết
              </button>
              <button
                type="button"
                className={filter === "out" ? "is-active" : ""}
                onClick={() => setFilter("out")}
              >
                Hết hàng
              </button>
            </div>
          </div>
          <div className={`stock-list ${selectionMode ? "stock-list--selecting" : ""}`}>
            {filtered.map((variant) => (
              <Card key={variant.id}>
                <span className="product-swatch">
                  <PackageOpen />
                </span>
                <span>
                  <strong>{names.get(variant.productId)}</strong>
                  <small>{variant.attributeSummary}</small>
                  <code>{variant.sku}</code>
                </span>
                <span className="stock-quantity-cell">
                  <small>Tồn</small>
                  {!selectionMode && editingStockId === variant.id ? (
                    <input
                      type="number"
                      ref={stockInputRef}
                      step="1"
                      inputMode="numeric"
                      className="stock-quantity-input"
                      aria-label={`Tồn mới của ${names.get(variant.productId)} ${variant.attributeSummary}`}
                      aria-invalid={Boolean(stockEditError)}
                      aria-busy={savingStockId === variant.id}
                      title={stockEditError || "Nhấn Enter để lưu, Escape để hủy"}
                      value={draftStockQuantity}
                      readOnly={savingStockId === variant.id}
                      onChange={(event) => {
                        setDraftStockQuantity(event.target.value);
                        setStockEditError("");
                      }}
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={() => {
                        if (savingStockId !== variant.id) cancelStockEdit();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitStockEdit(variant.id, variant.stockQuantity);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelStockEdit();
                        }
                      }}
                    />
                  ) : selectionMode ? (
                    <b
                      className={
                        variant.stockQuantity <= variant.lowStockThreshold ? "text-warning" : ""
                      }
                    >
                      {variant.stockQuantity}
                    </b>
                  ) : (
                    <button
                      type="button"
                      className={`stock-quantity-trigger ${
                        variant.stockQuantity <= variant.lowStockThreshold ? "text-warning" : ""
                      }`}
                      aria-label={`Tồn ${variant.stockQuantity} áo. Nhấp đúp để chỉnh tồn ${names.get(variant.productId)} ${variant.attributeSummary}`}
                      title="Nhấp đúp để chỉnh tồn"
                      onDoubleClick={() => beginStockEdit(variant.id, variant.stockQuantity)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          beginStockEdit(variant.id, variant.stockQuantity);
                        }
                      }}
                    >
                      {variant.stockQuantity}
                    </button>
                  )}
                </span>
                <span>
                  <small>{selectionMode ? "Giá bán" : "Giá vốn"}</small>
                  <b>{formatMoney(selectionMode ? variant.salePrice : variant.purchasePrice)}</b>
                </span>
                <Badge
                  tone={
                    variant.stockQuantity === 0
                      ? "danger"
                      : variant.stockQuantity <= variant.lowStockThreshold
                        ? "warning"
                        : "success"
                  }
                >
                  {variant.stockQuantity === 0
                    ? "Hết"
                    : variant.stockQuantity <= variant.lowStockThreshold
                      ? "Sắp hết"
                      : "Ổn"}
                </Badge>
                {selectionMode && (
                  <Button
                    aria-label={`Thêm ${names.get(variant.productId)} ${variant.attributeSummary} vào đơn`}
                    disabled={variant.stockQuantity <= 0 && !activeShop?.allowNegativeStock}
                    onClick={() => addVariantToCart(variant.id)}
                  >
                    <Plus />
                    {cartItems.find((item) => item.variant.id === variant.id)
                      ? `Thêm nữa · ${cartItems.find((item) => item.variant.id === variant.id)?.quantity}`
                      : variant.stockQuantity <= 0 && !activeShop?.allowNegativeStock
                        ? "Hết hàng"
                        : "Thêm vào đơn"}
                  </Button>
                )}
                {!selectionMode && (
                  <Button
                    variant="ghost"
                    className={`variant-note-button ${variant.note ? "has-note" : ""}`}
                    aria-label={`Ghi chú ${names.get(variant.productId)} ${variant.attributeSummary}`}
                    onClick={() => openVariantNote(variant.id, variant.note)}
                  >
                    <StickyNote /> Ghi chú
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
      {tab === "matrix" && (
        <section className="matrix-section">
          <div className="matrix-controls">
            <label>
              Mẫu áo
              <select
                value={selectedProduct}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setNeck("");
                }}
              >
                {data.products.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {necks.length > 1 && (
              <label>
                Kiểu cổ
                <select value={selectedNeck} onChange={(e) => setNeck(e.target.value)}>
                  {necks.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Card className="stock-matrix">
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
                  const variant = matrixVariants.find((v) => {
                    const p = v.attributeSummary.split(" · ");
                    return (
                      p[0] === color && p[1] === size && (!selectedNeck || p[2] === selectedNeck)
                    );
                  });
                  return (
                    <span
                      className={
                        variant && variant.stockQuantity <= variant.lowStockThreshold
                          ? "is-low"
                          : ""
                      }
                      key={color}
                    >
                      {variant?.stockQuantity ?? "—"}
                      <small>
                        {variant?.stockQuantity === 0
                          ? "Hết"
                          : variant && variant.stockQuantity <= variant.lowStockThreshold
                            ? "Sắp hết"
                            : ""}
                      </small>
                    </span>
                  );
                })}
              </div>
            ))}
          </Card>
        </section>
      )}
      {tab === "history" && (
        <div className="movement-list">
          {data.movements.map((movement) => {
            const variant = data.variants.find((v) => v.id === movement.variantId);
            return (
              <Card key={movement.id}>
                <span className={movement.quantityDelta > 0 ? "movement-in" : "movement-out"}>
                  {movement.quantityDelta > 0 ? "+" : "−"}
                </span>
                <span>
                  <strong>{names.get(variant?.productId ?? "")}</strong>
                  <small>
                    {variant?.attributeSummary} · {variant?.sku}
                  </small>
                  <small>
                    {movement.reason} · {formatDateTime(movement.occurredAt)}
                  </small>
                </span>
                <span>
                  <b className={movement.quantityDelta > 0 ? "text-success" : ""}>
                    {movement.quantityDelta > 0 ? "+" : ""}
                    {movement.quantityDelta}
                  </b>
                  <small>
                    {movement.quantityBefore} → {movement.quantityAfter}
                  </small>
                </span>
              </Card>
            );
          })}
        </div>
      )}
      {tab === "check" && (
        <section className="consistency">
          <Card className="consistency-head">
            <CheckCircle2 />
            <div>
              <h2>Đối chiếu tồn kho</h2>
              <p>So sánh tồn cache của size với tổng phát sinh trong sổ kho.</p>
            </div>
            <Button variant="secondary" onClick={runCheck}>
              <RefreshCw />
              Kiểm tra lại
            </Button>
          </Card>
          {checks?.filter((c) => !c.consistent).length === 0 ? (
            <Card className="consistency-ok">
              <CheckCircle2 />
              <div>
                <h3>Dữ liệu kho nhất quán</h3>
                <p>{checks?.length ?? 0} size khớp với lịch sử kho.</p>
              </div>
            </Card>
          ) : (
            checks
              ?.filter((c) => !c.consistent)
              .map((check) => (
                <Card className="consistency-error" key={check.variant.id}>
                  <AlertTriangle />
                  <span>
                    <strong>
                      {names.get(check.variant.productId)} · {check.variant.attributeSummary}
                    </strong>
                    <small>
                      Cache: {check.variant.stockQuantity} · Sổ kho: {check.ledgerQuantity} · Lệch{" "}
                      {check.difference}
                    </small>
                  </span>
                  <Button variant="danger" onClick={() => void repair(check.variant.id)}>
                    Sửa cache
                  </Button>
                </Card>
              ))
          )}
        </section>
      )}
      {notingVariant && (
        <div className="sheet-backdrop">
          <div className="bottom-sheet">
            <button
              type="button"
              className="sheet-close"
              aria-label="Đóng"
              disabled={noteBusy}
              onClick={() => setNotingVariantId("")}
            >
              <X />
            </button>
            <h2>Ghi chú áo</h2>
            <p>
              {names.get(notingVariant.productId)} · {notingVariant.attributeSummary} ·{" "}
              {notingVariant.sku}
            </p>
            <div className="form-card">
              <label>
                Ghi chú
                <textarea
                  rows={4}
                  value={draftVariantNote}
                  onChange={(event) => setDraftVariantNote(event.target.value)}
                  placeholder="VD: Áo bán cho khách A"
                  disabled={noteBusy}
                />
                <small>Ghi chú sẽ được báo khi size này được chọn bán.</small>
              </label>
            </div>
            {noteError && (
              <p className="form-error" role="alert">
                {noteError}
              </p>
            )}
            <Button onClick={() => void saveVariantNote()} disabled={noteBusy}>
              {noteBusy ? "Đang lưu…" : "Lưu ghi chú"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
