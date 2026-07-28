import { calculateReport } from "@pocket/domain";
import { db } from "@pocket/local-db";
import { Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, PackageOpen, TrendingUp, WalletCards } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { PageHeader } from "../../components/Ui";

export default function ReportsPage() {
  const { activeShop } = useShop();
  const shopId = activeShop?.id ?? "";
  const [range, setRange] = useState("all");
  const data = useLiveQuery(
    async () => ({
      sales: await db.sales.where("shopId").equals(shopId).toArray(),
      lines: await db.saleLines.where("shopId").equals(shopId).toArray(),
      expenses: await db.expenses.where("shopId").equals(shopId).toArray(),
      returns: await db.returnExchanges.where("shopId").equals(shopId).toArray(),
      products: await db.products.where("shopId").equals(shopId).toArray(),
      variants: await db.variants.where("shopId").equals(shopId).toArray(),
      customers: await db.customers.where("shopId").equals(shopId).toArray(),
      suppliers: await db.suppliers.where("shopId").equals(shopId).toArray(),
    }),
    [shopId],
    {
      sales: [],
      lines: [],
      expenses: [],
      returns: [],
      products: [],
      variants: [],
      customers: [],
      suppliers: [],
    },
  );
  const report = calculateReport({
    sales: data.sales,
    saleLines: data.lines,
    expenses: data.expenses,
    returns: data.returns,
  });
  const names = new Map(data.products.map((p) => [p.id, p.name]));
  const byProduct = [
    ...data.lines.reduce(
      (map, line) =>
        map.set(
          line.productId,
          (map.get(line.productId) ?? 0) + line.quantity - line.returnedQuantity,
        ),
      new Map<string, number>(),
    ),
  ]
    .map(([id, units]) => ({ name: names.get(id)?.slice(0, 16), units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 8);
  const byChannel = [
    ...data.sales.reduce(
      (map, sale) => map.set(sale.sourceChannel, (map.get(sale.sourceChannel) ?? 0) + sale.total),
      new Map<string, number>(),
    ),
  ];
  const customerDebt = data.customers.reduce((sum, c) => sum + c.totalReceivable, 0);
  const supplierDebt = data.suppliers.reduce((sum, s) => sum + s.totalPayable, 0);
  const inventoryValue = data.variants.reduce(
    (sum, v) => sum + v.stockQuantity * v.purchasePrice,
    0,
  );
  async function exportExcel() {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tổng quan");
    sheet.columns = [
      { header: "Chỉ số", key: "metric", width: 28 },
      { header: "Giá trị", key: "value", width: 20 },
    ];
    sheet.addRows([
      { metric: "Doanh thu thuần", value: report.netRevenue },
      { metric: "Lợi nhuận gộp", value: report.grossProfit },
      { metric: "Lợi nhuận ròng", value: report.netProfit },
      { metric: "Số áo bán", value: report.unitsSold },
      { metric: "Khách còn thiếu", value: customerDebt },
      { metric: "Còn nợ xưởng", value: supplierDebt },
    ]);
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `pocket-bao-cao-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div>
      <PageHeader
        title="Báo cáo"
        eyebrow="SỨC KHỎE SHOP"
        action={
          <Button variant="secondary" onClick={() => void exportExcel()}>
            <Download />
            Xuất Excel
          </Button>
        }
      />
      <div className="report-toolbar">
        <div className="segmented">
          <button
            type="button"
            className={range === "all" ? "is-active" : ""}
            onClick={() => setRange("all")}
          >
            Toàn thời gian
          </button>
          <button type="button" disabled>
            7 ngày
          </button>
          <button type="button" disabled>
            Tháng này
          </button>
        </div>
        <p>Số liệu tính trực tiếp từ dữ liệu trên thiết bị, dùng được khi offline.</p>
      </div>
      <div className="report-stats">
        <Card>
          <span>
            <WalletCards />
          </span>
          <div>
            <small>Doanh thu thuần</small>
            <strong>{formatMoney(report.netRevenue)}</strong>
            <p>Không phải dòng tiền</p>
          </div>
        </Card>
        <Card>
          <span className="green">
            <TrendingUp />
          </span>
          <div>
            <small>Lợi nhuận gộp</small>
            <strong>{formatMoney(report.grossProfit)}</strong>
            <p>Sau giá vốn đã bán</p>
          </div>
        </Card>
        <Card>
          <span className="blue">
            <TrendingUp />
          </span>
          <div>
            <small>Lợi nhuận ròng</small>
            <strong>{formatMoney(report.netProfit)}</strong>
            <p>Sau chi phí shop</p>
          </div>
        </Card>
        <Card>
          <span className="amber">
            <PackageOpen />
          </span>
          <div>
            <small>Số áo đã bán</small>
            <strong>{report.unitsSold}</strong>
            <p>{data.sales.length} đơn hàng</p>
          </div>
        </Card>
      </div>
      <div className="report-grid">
        <Card className="chart-card">
          <div className="section-title">
            <div>
              <h2>Mẫu áo bán chạy</h2>
              <p>Theo số lượng áo bán ròng</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byProduct} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eceef1" />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={110}
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <Tooltip />
              <Bar dataKey="units" fill="#2563EB" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="report-breakdown">
          <h2>Tài chính liên quan</h2>
          <div>
            <span>Tổng giá vốn</span>
            <b>{formatMoney(report.costOfGoodsSold)}</b>
          </div>
          <div>
            <span>Chi phí shop</span>
            <b>{formatMoney(report.expenseTotal)}</b>
          </div>
          <div>
            <span>Giá trị tồn kho</span>
            <b>{formatMoney(inventoryValue)}</b>
          </div>
          <div>
            <span>Khách còn thiếu</span>
            <b className="text-warning">{formatMoney(customerDebt)}</b>
          </div>
          <div>
            <span>Còn nợ xưởng</span>
            <b className="text-warning">{formatMoney(supplierDebt)}</b>
          </div>
          <div>
            <span>Đổi / Trả</span>
            <b>{data.returns.length} lượt</b>
          </div>
        </Card>
        <Card className="report-breakdown">
          <h2>Doanh thu theo kênh</h2>
          {byChannel.map(([channel, value]) => (
            <div key={channel}>
              <span>{channel}</span>
              <b>{formatMoney(value)}</b>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
