import type { Product, ProductVariant } from "@pocket/domain";
import { deleteCloudFile, hasFirebaseConfig, uploadProductImage } from "@pocket/firebase";
import { db, getDeviceId, setProductActive, updateProduct } from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronRight,
  CirclePlus,
  ImagePlus,
  PackageOpen,
  Pencil,
  QrCode,
  Shirt,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { EmptyState, PageHeader, SearchField } from "../../components/Ui";

export default function ProductsPage() {
  const { activeShop } = useShop();
  const { user } = useAuth();
  const { show } = useToast();
  const { productId } = useParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low">("all");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [material, setMaterial] = useState("");
  const [description, setDescription] = useState("");
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [variantDrafts, setVariantDrafts] = useState<
    Record<
      string,
      { salePrice: number; purchasePrice: number; lowStockThreshold: number; active: boolean }
    >
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  function openEditor(current: Product, own: ProductVariant[]) {
    setName(current.name);
    setProductCode(current.productCode);
    setMaterial(current.material ?? "");
    setDescription(current.description ?? "");
    setImageIds(current.imageIds);
    setImageFiles([]);
    setVariantDrafts(
      Object.fromEntries(
        own.map((variant) => [
          variant.id,
          {
            salePrice: variant.salePrice,
            purchasePrice: variant.purchasePrice,
            lowStockThreshold: variant.lowStockThreshold,
            active: variant.active,
          },
        ]),
      ),
    );
    setError("");
    setEditing(true);
  }
  if (product) {
    const currentProduct = product;
    const own = variants.filter((variant) => variant.productId === product.id);
    const stock = own.reduce((sum, variant) => sum + variant.stockQuantity, 0);
    async function save() {
      if (!activeShop) return;
      const uploadedPaths: string[] = [];
      setBusy(true);
      setError("");
      try {
        if (imageFiles.length) {
          if (!user || !hasFirebaseConfig())
            throw new Error("Cần đăng nhập Firebase để tải ảnh lên cloud.");
          for (const file of imageFiles) {
            const uploaded = await uploadProductImage({
              ownerUid: user.uid,
              shopId: activeShop.id,
              productId: currentProduct.id,
              file,
            });
            uploadedPaths.push(uploaded.path);
          }
        }
        const nextImageIds = [...new Set([...imageIds, ...uploadedPaths])];
        await updateProduct({
          shopId: activeShop.id,
          deviceId: getDeviceId(),
          productId: currentProduct.id,
          name,
          productCode,
          material,
          description,
          imageIds: nextImageIds,
          variants: own.map((variant) => ({ id: variant.id, ...variantDrafts[variant.id] })),
        });
        const removed = currentProduct.imageIds.filter((path) => !nextImageIds.includes(path));
        if (user && hasFirebaseConfig() && removed.length)
          await Promise.allSettled(removed.map((path) => deleteCloudFile(user.uid, path)));
        show("Đã cập nhật mẫu áo và biến thể");
        setEditing(false);
      } catch (cause) {
        if (user && hasFirebaseConfig())
          await Promise.allSettled(
            uploadedPaths
              .filter((path) => !currentProduct.imageIds.includes(path))
              .map((path) => deleteCloudFile(user.uid, path)),
          );
        setError(toVietnameseError(cause));
      } finally {
        setBusy(false);
      }
    }
    async function toggleActive() {
      if (!activeShop) return;
      const next = !currentProduct.active;
      if (
        !next &&
        !window.confirm("Tạm ẩn mẫu áo và toàn bộ biến thể? Lịch sử bán/nhập vẫn được giữ nguyên.")
      )
        return;
      try {
        await setProductActive(activeShop.id, getDeviceId(), currentProduct.id, next);
        show(next ? "Đã kích hoạt lại mẫu áo" : "Đã tạm ẩn mẫu áo");
      } catch (cause) {
        show(toVietnameseError(cause));
      }
    }
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
              <div className="crud-actions">
                <Button variant="secondary" onClick={() => openEditor(product, own)}>
                  <Pencil /> Sửa
                </Button>
                <Button variant={product.active ? "danger" : "secondary"} onClick={toggleActive}>
                  {product.active ? "Tạm ẩn" : "Kích hoạt"}
                </Button>
                <Link className="button button--secondary" to={`/qr-labels?product=${product.id}`}>
                  <QrCode /> In tem QR
                </Link>
              </div>
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
                    {!variant.active
                      ? "Tạm ẩn"
                      : variant.stockQuantity === 0
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
        {editing && (
          <div className="sheet-backdrop">
            <div className="bottom-sheet bottom-sheet--wide">
              <button
                type="button"
                className="sheet-close"
                aria-label="Đóng"
                onClick={() => setEditing(false)}
              >
                <X />
              </button>
              <h2>Sửa mẫu áo</h2>
              <p>Giá, ngưỡng cảnh báo và trạng thái được lưu riêng cho từng biến thể.</p>
              <div className="form-card form-grid">
                <label>
                  Tên mẫu áo
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                  Mã mẫu
                  <input
                    value={productCode}
                    onChange={(event) => setProductCode(event.target.value)}
                  />
                </label>
                <label>
                  Chất liệu
                  <input value={material} onChange={(event) => setMaterial(event.target.value)} />
                </label>
                <label className="span-full">
                  Mô tả
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>
              <div className="crud-image-list">
                {imageIds.map((path) => (
                  <div key={path}>
                    <span>{path.split("/").at(-1)}</span>
                    <Button
                      variant="ghost"
                      onClick={() => setImageIds(imageIds.filter((item) => item !== path))}
                    >
                      <Trash2 /> Xóa ảnh
                    </Button>
                  </div>
                ))}
                <label className="file-button">
                  <ImagePlus /> Thêm ảnh
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => setImageFiles([...(event.target.files ?? [])])}
                  />
                </label>
                {imageFiles.length > 0 && (
                  <small>{imageFiles.length} ảnh mới sẽ được tải lên khi lưu.</small>
                )}
              </div>
              <div className="crud-variant-editor">
                {own.map((variant) => {
                  const draft = variantDrafts[variant.id];
                  if (!draft) return null;
                  return (
                    <Card key={variant.id}>
                      <strong>{variant.attributeSummary}</strong>
                      <small>{variant.sku}</small>
                      <label>
                        Giá bán
                        <input
                          type="number"
                          value={draft.salePrice}
                          onChange={(event) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [variant.id]: { ...draft, salePrice: Number(event.target.value) },
                            })
                          }
                        />
                      </label>
                      <label>
                        Giá vốn
                        <input
                          type="number"
                          value={draft.purchasePrice}
                          onChange={(event) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [variant.id]: { ...draft, purchasePrice: Number(event.target.value) },
                            })
                          }
                        />
                      </label>
                      <label>
                        Ngưỡng thấp
                        <input
                          type="number"
                          value={draft.lowStockThreshold}
                          onChange={(event) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [variant.id]: {
                                ...draft,
                                lowStockThreshold: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(event) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [variant.id]: { ...draft, active: event.target.checked },
                            })
                          }
                        />{" "}
                        Đang bán
                      </label>
                    </Card>
                  );
                })}
              </div>
              {error && <p className="form-error">{error}</p>}
              <Button onClick={save} disabled={busy}>
                {busy ? "Đang lưu…" : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        )}
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
                    {!product.active && <Badge tone="neutral">Tạm ẩn</Badge>}
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
