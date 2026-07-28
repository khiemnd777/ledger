import { hasFirebaseConfig, uploadProductImage } from "@pocket/firebase";
import { createProductWithVariants, db, getDeviceId } from "@pocket/local-db";
import { Button, Card } from "@pocket/ui";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDollarSign,
  ImagePlus,
  PackageCheck,
  Palette,
  QrCode,
  Shirt,
  Sparkles,
  Tags,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

const schema = z.object({
  name: z.string().min(2),
  productCode: z.string().min(2),
  material: z.string(),
  colors: z.string().min(1),
  sizes: z.string().min(1),
  neck: z.string().min(1),
  purchasePrice: z.number().int().nonnegative(),
  salePrice: z.number().int().positive(),
  openingStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
});
type Values = z.infer<typeof schema>;
const steps = [
  { label: "Cơ bản", icon: Shirt },
  { label: "Hình ảnh", icon: ImagePlus },
  { label: "Thuộc tính", icon: Tags },
  { label: "Giá trị", icon: Palette },
  { label: "Biến thể", icon: Sparkles },
  { label: "Giá bán", icon: CircleDollarSign },
  { label: "Tồn đầu", icon: PackageCheck },
  { label: "Tem QR", icon: QrCode },
  { label: "Xác nhận", icon: Check },
];
export default function ProductFormPage() {
  const { activeShop } = useShop();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { show } = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageProgress, setImageProgress] = useState(0);
  const {
    register,
    watch,
    getValues,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: {
      name: "Áo thun nữ basic",
      productCode: "ATB",
      material: "Cotton compact",
      colors: "Đen, Trắng, Be",
      sizes: "S, M, L, XL",
      neck: "Cổ tròn",
      purchasePrice: 82000,
      salePrice: 189000,
      openingStock: 5,
      lowStockThreshold: 3,
    },
  });
  const values = watch();
  const colors = values.colors
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const sizes = values.sizes
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const necks = values.neck
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const variantCount = colors.length * sizes.length * necks.length;
  async function finish() {
    if (!activeShop) return;
    const parsed = schema.safeParse(getValues());
    if (!parsed.success) {
      setError("Kiểm tra lại thông tin bắt buộc và giá bán.");
      setStep(0);
      return;
    }
    setBusy(true);
    try {
      const result = await createProductWithVariants({
        shopId: activeShop.id,
        deviceId: getDeviceId(),
        name: parsed.data.name,
        productCode: parsed.data.productCode,
        material: parsed.data.material,
        purchasePrice: parsed.data.purchasePrice,
        salePrice: parsed.data.salePrice,
        openingStock: parsed.data.openingStock,
        lowStockThreshold: parsed.data.lowStockThreshold,
        attributes: [
          { name: "Màu", values: colors.map((value) => ({ value })) },
          { name: "Size", values: sizes.map((value) => ({ value })) },
          { name: "Kiểu cổ", values: necks.map((value) => ({ value })) },
        ],
      });
      if (imageFiles.length && user && hasFirebaseConfig()) {
        const imageIds: string[] = [];
        for (const [index, file] of imageFiles.entries()) {
          const uploaded = await uploadProductImage({
            ownerUid: user.uid,
            shopId: activeShop.id,
            productId: result.product.id,
            file,
            onProgress: (percent) =>
              setImageProgress(Math.round(((index + percent / 100) / imageFiles.length) * 100)),
          });
          imageIds.push(uploaded.path);
        }
        await db.products.put({
          ...result.product,
          imageIds,
          updatedAt: new Date().toISOString(),
          revision: result.product.revision + 1,
        });
      }
      show(`Đã tạo ${variantCount} biến thể và QR riêng`);
      navigate(`/products/${result.product.id}`);
    } catch (cause) {
      setError(toVietnameseError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="product-form">
      <PageHeader title="Thêm mẫu áo" eyebrow={`BƯỚC ${step + 1} / ${steps.length}`} back />
      <div className="wizard-steps">
        {steps.map(({ label, icon: Icon }, index) => (
          <button
            type="button"
            key={label}
            className={index === step ? "is-current" : index < step ? "is-done" : ""}
            onClick={() => setStep(index)}
          >
            <i>{index < step ? <Check /> : <Icon />}</i>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="wizard-layout">
        <main>
          {step === 0 && (
            <section>
              <h2>Thông tin mẫu áo</h2>
              <p>Thông tin chung dùng cho tất cả size và màu.</p>
              <Card className="form-card form-grid">
                <label>
                  Tên mẫu áo
                  <input {...register("name")} />
                  {errors.name && <small>Tên mẫu cần ít nhất 2 ký tự</small>}
                </label>
                <label>
                  Mã mẫu
                  <input {...register("productCode")} />
                </label>
                <label>
                  Chất liệu
                  <input {...register("material")} />
                </label>
                <label>
                  Nhóm áo
                  <select>
                    <option>Áo thun</option>
                    <option>Áo polo</option>
                    <option>Áo sơ mi</option>
                    <option>Khác</option>
                  </select>
                </label>
                <label className="form-grid__wide">
                  Mô tả
                  <textarea rows={3} placeholder="Phom áo, đặc điểm nổi bật…" />
                </label>
              </Card>
            </section>
          )}
          {step === 1 && (
            <section>
              <h2>Hình ảnh mẫu áo</h2>
              <p>Ảnh sẽ được nén WebP trước khi tải lên.</p>
              <Card className="image-drop">
                <ImagePlus />
                <strong>Thêm ảnh sản phẩm</strong>
                <span>JPG, PNG hoặc WebP · tối đa 8 MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))}
                />
              </Card>
              {imageFiles.length > 0 && (
                <div className="image-queue">
                  <strong>{imageFiles.length} ảnh đã chọn</strong>
                  <span>
                    {imageProgress
                      ? `Đã tải ${imageProgress}%`
                      : hasFirebaseConfig()
                        ? "Sẽ nén WebP và tải khi lưu"
                        : "Cần cấu hình Firebase để tải ảnh"}
                  </span>
                </div>
              )}
              <p className="info-callout">
                Bạn có thể bỏ qua và thêm ảnh sau trong chi tiết mẫu áo.
              </p>
            </section>
          )}
          {step === 2 && (
            <section>
              <h2>Thuộc tính bán áo</h2>
              <p>SỔ TAY tạo một biến thể riêng cho mỗi tổ hợp.</p>
              <div className="attribute-cards">
                <Card>
                  <Palette />
                  <span>
                    <strong>Màu</strong>
                    <small>Đen, Trắng, Be…</small>
                  </span>
                  <Check />
                </Card>
                <Card>
                  <Tags />
                  <span>
                    <strong>Size</strong>
                    <small>S, M, L, XL…</small>
                  </span>
                  <Check />
                </Card>
                <Card>
                  <Shirt />
                  <span>
                    <strong>Kiểu cổ</strong>
                    <small>Cổ tròn, cổ polo…</small>
                  </span>
                  <Check />
                </Card>
              </div>
            </section>
          )}
          {step === 3 && (
            <section>
              <h2>Giá trị thuộc tính</h2>
              <p>Phân tách bằng dấu phẩy.</p>
              <Card className="form-card">
                <label>
                  Màu
                  <input {...register("colors")} />
                  <small>{colors.length} màu</small>
                </label>
                <label>
                  Size
                  <input {...register("sizes")} />
                  <small>{sizes.length} size</small>
                </label>
                <label>
                  Kiểu cổ
                  <input {...register("neck")} />
                  <small>{necks.length} kiểu cổ</small>
                </label>
              </Card>
            </section>
          )}
          {step === 4 && (
            <section>
              <h2>Kiểm tra biến thể</h2>
              <p>Hệ thống sẽ tạo {variantCount} biến thể độc lập.</p>
              <Card className="variant-preview">
                <div className="variant-preview__head">
                  <span>Tên biến thể</span>
                  <span>SKU dự kiến</span>
                </div>
                {colors
                  .flatMap((color) =>
                    sizes.flatMap((size) =>
                      necks.map((neck, _index) => `${color} · ${size} · ${neck}`),
                    ),
                  )
                  .slice(0, 12)
                  .map((name, index) => (
                    <div key={name}>
                      <span>{name}</span>
                      <code>
                        {values.productCode.toUpperCase()}-{String(index + 1).padStart(3, "0")}
                      </code>
                    </div>
                  ))}
                {variantCount > 12 && <p>+ {variantCount - 12} biến thể khác</p>}
              </Card>
            </section>
          )}
          {step === 5 && (
            <section>
              <h2>Giá nhập & giá bán</h2>
              <p>Áp dụng ban đầu cho mọi biến thể; có thể sửa riêng sau.</p>
              <Card className="form-card form-grid">
                <label>
                  Giá nhập
                  <input type="number" {...register("purchasePrice", { valueAsNumber: true })} />
                </label>
                <label>
                  Giá bán
                  <input type="number" {...register("salePrice", { valueAsNumber: true })} />
                </label>
                <div className="price-margin">
                  <span>Lãi gộp dự kiến / áo</span>
                  <strong>
                    {formatMoney(Math.max(0, values.salePrice - values.purchasePrice))}
                  </strong>
                </div>
              </Card>
            </section>
          )}
          {step === 6 && (
            <section>
              <h2>Tồn kho đầu kỳ</h2>
              <p>Số lượng này áp dụng cho mỗi biến thể và tạo lịch sử nhập kho đầu kỳ.</p>
              <Card className="form-card form-grid">
                <label>
                  Tồn mỗi biến thể
                  <input type="number" {...register("openingStock", { valueAsNumber: true })} />
                </label>
                <label>
                  Ngưỡng sắp hết
                  <input
                    type="number"
                    {...register("lowStockThreshold", { valueAsNumber: true })}
                  />
                </label>
                <div className="price-margin">
                  <span>Tổng số áo ban đầu</span>
                  <strong>{variantCount * values.openingStock} áo</strong>
                </div>
              </Card>
            </section>
          )}
          {step === 7 && (
            <section>
              <h2>Tem QR theo biến thể</h2>
              <p>Mỗi size, màu và kiểu cổ sẽ có QR riêng.</p>
              <Card className="qr-explainer">
                <QrCode />
                <div>
                  <strong>{variantCount} mã QR sẽ được tạo</strong>
                  <p>
                    Mã chỉ chứa phiên bản, ID biến thể và checksum — không chứa giá, tồn kho hay dữ
                    liệu riêng tư.
                  </p>
                  <code>PKT1:variant-id:7A42</code>
                </div>
              </Card>
            </section>
          )}
          {step === 8 && (
            <section>
              <h2>Xác nhận mẫu áo</h2>
              <p>Kiểm tra một lần cuối trước khi lưu.</p>
              <Card className="review-card">
                <div className="review-card__art">
                  <Shirt />
                </div>
                <div>
                  <h3>{values.name}</h3>
                  <p>
                    {values.productCode.toUpperCase()} · {values.material}
                  </p>
                  <dl>
                    <div>
                      <dt>Biến thể</dt>
                      <dd>{variantCount}</dd>
                    </div>
                    <div>
                      <dt>Kho ban đầu</dt>
                      <dd>{variantCount * values.openingStock} áo</dd>
                    </div>
                    <div>
                      <dt>Giá bán</dt>
                      <dd>{formatMoney(values.salePrice)}</dd>
                    </div>
                    <div>
                      <dt>Tem QR</dt>
                      <dd>{variantCount} tem</dd>
                    </div>
                  </dl>
                </div>
              </Card>
              {error && <p className="form-error">{error}</p>}
            </section>
          )}
        </main>
        <aside>
          <h3>Tóm tắt</h3>
          <div>
            <span>Mẫu áo</span>
            <b>{values.name}</b>
          </div>
          <div>
            <span>Thuộc tính</span>
            <b>{colors.length + sizes.length + necks.length} giá trị</b>
          </div>
          <div>
            <span>Biến thể</span>
            <b>{variantCount}</b>
          </div>
          <div>
            <span>Giá bán</span>
            <b>{formatMoney(values.salePrice)}</b>
          </div>
          <div>
            <span>Tồn dự kiến</span>
            <b>{variantCount * values.openingStock} áo</b>
          </div>
        </aside>
      </div>
      <footer>
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ArrowLeft />
          Quay lại
        </Button>
        {step < 8 ? (
          <Button onClick={() => setStep(step + 1)}>
            Tiếp tục <ArrowRight />
          </Button>
        ) : (
          <Button disabled={busy} onClick={finish}>
            {busy ? "Đang tạo…" : "Tạo mẫu áo & QR"}
            <Check />
          </Button>
        )}
      </footer>
    </div>
  );
}
