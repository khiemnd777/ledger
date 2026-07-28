import { db } from "@pocket/local-db";
import { Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Check, PackageCheck, ScanLine, Share2, ShoppingBag } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { formatMoney } from "../../app/format";

export default function OrderSuccessPage() {
  const { saleId = "" } = useParams();
  const _location = useLocation();
  const data = useLiveQuery(async () => {
    const sale = await db.sales.get(saleId);
    if (!sale) return;
    const lines = await db.saleLines.where("saleId").equals(saleId).toArray();
    const movements = await db.stockMovements.where("referenceId").equals(saleId).toArray();
    return { sale, lines, movements };
  }, [saleId]);
  if (!data)
    return (
      <div className="success-page">
        <p>Đang tải đơn hàng…</p>
      </div>
    );
  const share = async () => {
    const text = `${data.sale.orderNumber} · Tổng ${formatMoney(data.sale.total)} · Đã thanh toán ${formatMoney(data.sale.amountPaid)}`;
    if (navigator.share) await navigator.share({ title: "Đơn hàng SỔ TAY", text });
    else await navigator.clipboard.writeText(text);
  };
  return (
    <div className="success-page">
      <div className="success-mark">
        <Check />
      </div>
      <p className="eyebrow">ĐÃ XUẤT KHO</p>
      <h1>Đơn hàng hoàn tất!</h1>
      <p className="success-order">{data.sale.orderNumber}</p>
      <Card className="success-summary">
        <div>
          <span>Tổng đơn</span>
          <strong>{formatMoney(data.sale.total)}</strong>
        </div>
        <div>
          <span>Đã thanh toán</span>
          <b>{formatMoney(data.sale.amountPaid)}</b>
        </div>
        <div className={data.sale.amountDue ? "has-due" : ""}>
          <span>Khách còn thiếu</span>
          <b>{formatMoney(data.sale.amountDue)}</b>
        </div>
      </Card>
      <Card className="stock-result">
        <h2>
          <PackageCheck /> Thay đổi tồn kho
        </h2>
        {data.lines.map((line) => {
          const movement = data.movements.find((item) => item.variantId === line.variantId);
          return (
            <div key={line.id}>
              <span>
                <strong>{line.productNameSnapshot}</strong>
                <small>
                  {line.variantNameSnapshot} · {line.skuSnapshot}
                </small>
              </span>
              <span>
                <b>{line.quantity} áo</b>
                <small>
                  {movement?.quantityBefore} → {movement?.quantityAfter} trong kho
                </small>
              </span>
            </div>
          );
        })}
      </Card>
      <div className="success-actions">
        <Link className="button button--primary" to="/scan">
          <ScanLine />
          Quét tiếp
        </Link>
        <Link className="button button--secondary" to={`/orders/${saleId}`}>
          <ShoppingBag />
          Xem đơn hàng <ArrowRight />
        </Link>
        <Button variant="ghost" onClick={() => void share()}>
          <Share2 />
          Chia sẻ biên nhận
        </Button>
      </div>
      <p className="success-note">
        Đơn hàng, tồn kho, thanh toán và lịch sử đã được lưu an toàn trên thiết bị.
      </p>
    </div>
  );
}
