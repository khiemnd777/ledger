import { DEFAULT_EXPENSE_CATEGORIES } from "@pocket/domain";
import { addExpense, db, getDeviceId } from "@pocket/local-db";
import { Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { CirclePlus, Paperclip, Receipt, X } from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

export default function ExpensesPage() {
  const { activeShop } = useShop();
  const { show } = useToast();
  const shopId = activeShop?.id ?? "";
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const expenses =
    useLiveQuery(
      () => db.expenses.where("shopId").equals(shopId).reverse().toArray(),
      [shopId],
      [],
    ) ?? [];
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  async function submit() {
    try {
      if (amount <= 0) throw new Error("Nhập số tiền chi lớn hơn 0.");
      await addExpense({ shopId, deviceId: getDeviceId(), category, amount, note });
      show("Đã lưu chi phí shop");
      setOpen(false);
      setAmount(0);
      setNote("");
    } catch (cause) {
      setError(toVietnameseError(cause));
    }
  }
  return (
    <div>
      <PageHeader
        title="Chi phí shop"
        eyebrow="CHI PHÍ VẬN HÀNH"
        action={
          <Button onClick={() => setOpen(true)}>
            <CirclePlus />
            Thêm chi phí
          </Button>
        }
      />
      <Card className="expense-total">
        <span>
          <Receipt />
        </span>
        <div>
          <small>Tổng chi đã ghi nhận</small>
          <strong>{formatMoney(total)}</strong>
          <p>{expenses.length} khoản chi</p>
        </div>
      </Card>
      <div className="expense-list">
        {expenses.map((expense) => (
          <Card key={expense.id}>
            <span className="expense-icon">
              <Receipt />
            </span>
            <span>
              <strong>{expense.category}</strong>
              <small>{expense.note || "Không có ghi chú"}</small>
              <small>{formatDateTime(expense.date)}</small>
            </span>
            <b>{formatMoney(expense.amount)}</b>
          </Card>
        ))}
      </div>
      {open && (
        <div className="sheet-backdrop">
          <div className="bottom-sheet">
            <button type="button" className="sheet-close" onClick={() => setOpen(false)}>
              <X />
            </button>
            <h2>Thêm chi phí shop</h2>
            <div className="form-card">
              <label>
                Nhóm chi
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {DEFAULT_EXPENSE_CATEGORIES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Số tiền
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </label>
              <label>
                Ghi chú
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <label className="file-button">
                <Paperclip />
                Đính kèm ảnh hóa đơn
                <input type="file" accept="image/*" />
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <Button onClick={submit}>Lưu chi phí</Button>
          </div>
        </div>
      )}
    </div>
  );
}
