import type { Product, ProductVariant } from "@pocket/domain";
import { db } from "@pocket/local-db";
import { Badge, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, CirclePlus, PackageOpen, QrCode, Shirt } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatMoney } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { EmptyState, PageHeader, SearchField } from "../../components/Ui";

export default function ProductsPage() {
  const { activeShop } = useShop();
  const { productId } = useParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low">("all");
  const products =
    useLiveQuery<Product[]>(
      () =>
        activeShop
          ? db.products.where("shopId").equals(activeShop.id).toArray()
          : Promise.resolve([] as Product[]),
      [activeShop?.id],
    ) ?? [];
  const variants =
    useLiveQuery<ProductVariant[]>(
      () =>
        activeShop
          ? db.variants.where("shopId").equals(activeShop.id).toArray()
          : Promise.resolve([] as ProductVariant[]),
      [activeShop?.id],
    ) ?? [];
  const product = products.find((item) => item.id === productId);
  if (product) {
    const own = variants.filter((variant) => variant.productId === product.id);
    const stock = own.reduce((sum, variant) => sum + variant.stockQuantity, 0);
    return (
      <div>
        <PageHeader
          title={product.name}
          eyebrow={product.productCode}
          back
          action={
            <Badge tone={product.active ? "success" : "neutral"}>
              {product.active ? "Đang bán" : "Tạm ẩn"}
            </Badge>
          }
        />
        <div className="product-detail">
          <Card className="product-detail__hero">
            <span className="product-hero-art">
              <Shirt />
            </span>
            <div>
              <p>
                {product.description || `${product.material || "Mẫu áo"} · ${own.length} biến thể`}
              </p>
              <div>
                <span>
                  <small>Tổng tồn</small>
                  <strong>{stock} áo</strong>
                </span>
                <span>
                  <small>Giá bán từ</small>
                  <strong>{formatMoney(Math.min(...own.map((v) => v.salePrice)))}</strong>
                </span>
                <span>
                  <small>Sắp hết</small>
                  <strong>
                    {own.filter((v) => v.stockQuantity <= v.lowStockThreshold).length}
                  </strong>
                </span>
              </div>
            </div>
          </Card>
          <section>
            <div className="section-title">
              <div>
                <h2>Biến thể áo</h2>
                <p>Mỗi biến thể có SKU, QR và tồn riêng</p>
              </div>
              <Link className="button button--secondary" to={`/qr-labels?product=${product.id}`}>
                <QrCode />
                In tem QR
              </Link>
            </div>
            <div className="variant-grid">
              {own.map((variant) => (
                <Card key={variant.id}>
                  <div>
                    <span className="product-swatch">
                      <PackageOpen />
                    </span>
                    <span>
                      <strong>{variant.attributeSummary}</strong>
                      <small>{variant.sku}</small>
                    </span>
                  </div>
                  <div>
                    <span>
                      <small>Tồn kho</small>
                      <b
                        className={
                          variant.stockQuantity <= variant.lowStockThreshold ? "text-warning" : ""
                        }
                      >
                        {variant.stockQuantity}
                      </b>
                    </span>
                    <span>
                      <small>Giá bán</small>
                      <b>{formatMoney(variant.salePrice)}</b>
                    </span>
                  </div>
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
                      ? "Hết hàng"
                      : variant.stockQuantity <= variant.lowStockThreshold
                        ? "Sắp hết"
                        : "Còn hàng"}
                  </Badge>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }
  const filtered = products
    .filter(
      (product) =>
        product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.productCode.toLowerCase().includes(query.toLowerCase()),
    )
    .filter(
      (product) =>
        filter === "all" ||
        variants
          .filter((v) => v.productId === product.id)
          .some((v) => v.stockQuantity <= v.lowStockThreshold),
    );
  return (
    <div>
      <PageHeader
        title="Mẫu áo"
        eyebrow="DANH MỤC SHOP"
        action={
          <Link className="button button--primary compact-button" to="/products/new">
            <CirclePlus />
            Thêm mẫu áo
          </Link>
        }
      />
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Tìm tên hoặc mã mẫu" />
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
        </div>
      </div>
      {filtered.length ? (
        <div className="product-list">
          {filtered.map((product) => {
            const own = variants.filter((variant) => variant.productId === product.id);
            const stock = own.reduce((sum, variant) => sum + variant.stockQuantity, 0);
            const low = own.filter(
              (variant) => variant.stockQuantity <= variant.lowStockThreshold,
            ).length;
            return (
              <Link to={`/products/${product.id}`} key={product.id}>
                <Card>
                  <span className="product-card-art">
                    <Shirt />
                  </span>
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.productCode} · {product.material || "Chưa có chất liệu"}
                    </small>
                    <small>{own.length} biến thể</small>
                  </span>
                  <span>
                    <b>{stock} áo</b>
                    {low > 0 && <Badge tone="warning">{low} sắp hết</Badge>}
                    <small>{own[0] ? formatMoney(own[0].salePrice) : "—"}</small>
                  </span>
                  <ChevronRight />
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Chưa có mẫu áo"
          description="Tạo mẫu áo, các biến thể size/màu và tem QR đầu tiên."
          action={
            <Link className="button button--primary" to="/products/new">
              <CirclePlus />
              Thêm mẫu áo
            </Link>
          }
        />
      )}
    </div>
  );
}
