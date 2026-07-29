import { db } from "@pocket/local-db";
import { generateQrDataUrl } from "@pocket/qr";
import { Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckSquare, Printer, QrCode, Square, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMoney } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { PageHeader } from "../../components/Ui";

export default function QrLabelsPage() {
  const { activeShop } = useShop();
  const [params] = useSearchParams();
  const productId = params.get("product");
  const [selected, setSelected] = useState<string[]>([]);
  const [layout, setLayout] = useState<"a4" | "thermal">("a4");
  const [showPrice, setShowPrice] = useState(true);
  const [images, setImages] = useState<Record<string, string>>({});
  const data = useLiveQuery(
    async () => {
      if (!activeShop) return { variants: [], products: [] };
      const variants = await db.variants
        .where("shopId")
        .equals(activeShop.id)
        .filter((variant) => !productId || variant.productId === productId)
        .toArray();
      const products = await db.products.where("shopId").equals(activeShop.id).toArray();
      return { variants, products };
    },
    [activeShop?.id, productId],
    { variants: [], products: [] },
  );
  useEffect(() => {
    if (data.variants.length && selected.length === 0)
      setSelected(data.variants.map((variant) => variant.id));
  }, [data.variants.length]);
  useEffect(() => {
    let active = true;
    void Promise.all(
      data.variants
        .filter((variant) => selected.includes(variant.id))
        .map(
          async (variant) => [variant.id, await generateQrDataUrl(variant.qrValue, 220)] as const,
        ),
    ).then((entries) => {
      if (active) setImages(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [selected.join(","), data.variants.length]);
  const names = new Map(data.products.map((product) => [product.id, product.name]));
  const readyToPrint =
    selected.length > 0 && selected.every((variantId) => Boolean(images[variantId]));
  return (
    <div className={`labels-page labels-page--${layout}`}>
      <PageHeader
        title="Tem QR"
        eyebrow={`${selected.length} BIẾN THỂ ĐÃ CHỌN`}
        back
        action={
          <Button disabled={!readyToPrint} onClick={() => window.print()}>
            <Printer />
            {selected.length > 0 && !readyToPrint ? "Đang tạo QR…" : "In tem"}
          </Button>
        }
      />
      <Card className="label-toolbar">
        <button
          type="button"
          onClick={() =>
            setSelected(
              selected.length === data.variants.length ? [] : data.variants.map((v) => v.id),
            )
          }
        >
          {selected.length === data.variants.length ? <CheckSquare /> : <Square />} Chọn tất cả
        </button>
        <label>
          Khổ tem
          <select value={layout} onChange={(e) => setLayout(e.target.value as "a4" | "thermal")}>
            <option value="a4">A4 · 3 cột</option>
            <option value="thermal">Nhiệt · 50 × 30 mm</option>
          </select>
        </label>
        <label className="switch-row">
          Hiện giá
          <input
            type="checkbox"
            checked={showPrice}
            onChange={(e) => setShowPrice(e.target.checked)}
          />
          <i />
        </label>
      </Card>
      <Card className="printer-help">
        <span>
          <Wifi />
        </span>
        <div>
          <strong>In trực tiếp bằng máy in hệ thống</strong>
          <p>
            QR được sinh tự động cho từng biến thể. Trên iPhone, chọn máy in AirPrint; trên máy
            tính, chọn máy in thường hoặc máy in nhiệt 50 × 30 mm trong hộp thoại in.
          </p>
        </div>
      </Card>
      <div className="label-selector">
        {data.variants.map((variant) => (
          <button
            type="button"
            className={selected.includes(variant.id) ? "is-selected" : ""}
            onClick={() =>
              setSelected((current) =>
                current.includes(variant.id)
                  ? current.filter((id) => id !== variant.id)
                  : [...current, variant.id],
              )
            }
            key={variant.id}
          >
            <QrCode />
            <span>
              <strong>{names.get(variant.productId)}</strong>
              <small>
                {variant.attributeSummary} · {variant.sku}
              </small>
            </span>
            {selected.includes(variant.id) ? <CheckSquare /> : <Square />}
          </button>
        ))}
      </div>
      <section className="print-sheet">
        {data.variants
          .filter((variant) => selected.includes(variant.id))
          .map((variant) => (
            <div className="qr-label" key={variant.id}>
              {images[variant.id] ? (
                <img src={images[variant.id]} alt={`QR ${variant.sku}`} />
              ) : (
                <span className="qr-loading">
                  <QrCode />
                </span>
              )}
              <div>
                <strong>{names.get(variant.productId)}</strong>
                <span>{variant.attributeSummary}</span>
                <code>{variant.sku}</code>
                {showPrice && <b>{formatMoney(variant.salePrice)}</b>}
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
