import { db, getDeviceId, getInventoryConsistency, repairInventory } from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  History,
  PackageOpen,
  PackagePlus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDateTime, formatMoney } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader, SearchField } from "../../components/Ui";

export default function InventoryPage() {
  const { activeShop } = useShop();
  const { show } = useToast();
  const shopId = activeShop?.id ?? "";
  const [tab, setTab] = useState<"stock" | "matrix" | "history" | "check">("stock");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">(
    new URLSearchParams(location.search).get("filter") === "low" ? "low" : "all",
  );
  const [productId, setProductId] = useState("");
  const [neck, setNeck] = useState("");
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof getInventoryConsistency>>>();
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
  const names = new Map(data.products.map((p) => [p.id, p.name]));
  const total = data.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const low = data.variants.filter(
    (v) => v.stockQuantity > 0 && v.stockQuantity <= v.lowStockThreshold,
  ).length;
  const out = data.variants.filter((v) => v.stockQuantity === 0).length;
  const value = data.variants.reduce((sum, v) => sum + v.stockQuantity * v.purchasePrice, 0);
  const filtered = data.variants
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
  return (
    <div>
      <PageHeader
        title="Kho áo"
        eyebrow="TỒN KHO THEO BIẾN THỂ"
        action={
          <Link className="button button--primary compact-button" to="/receive">
            <PackagePlus />
            Nhập áo
          </Link>
        }
      />
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
            <strong>{low} biến thể</strong>
          </div>
        </Card>
        <Card>
          <span className="red">
            <PackageOpen />
          </span>
          <div>
            <small>Hết hàng</small>
            <strong>{out} biến thể</strong>
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
          <div className="stock-list">
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
                <span>
                  <small>Tồn</small>
                  <b
                    className={
                      variant.stockQuantity <= variant.lowStockThreshold ? "text-warning" : ""
                    }
                  >
                    {variant.stockQuantity}
                  </b>
                </span>
                <span>
                  <small>Giá vốn</small>
                  <b>{formatMoney(variant.purchasePrice)}</b>
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
                <ChevronRight />
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
              <p>So sánh tồn cache của biến thể với tổng phát sinh trong sổ kho.</p>
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
                <p>{checks?.length ?? 0} biến thể khớp với lịch sử kho.</p>
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
    </div>
  );
}
