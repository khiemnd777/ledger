import { createId, DEFAULT_EXPENSE_CATEGORIES } from "@pocket/domain";
import { deleteCloudFile, hasFirebaseConfig, uploadExpenseAttachment } from "@pocket/firebase";
import { addExpense, db, getDeviceId, setExpenseActive, updateExpense } from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import { CirclePlus, Paperclip, Pencil, Receipt, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../app/AuthContext";
import { formatDateTime, formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

export default function ExpensesPage() {
  const { activeShop } = useShop();
  const { user } = useAuth();
  const { show } = useToast();
  const shopId = activeShop?.id ?? "";
  const [sheet, setSheet] = useState<"add" | "edit" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"active" | "voided" | "all">("active");
  const [category, setCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const expenses =
    useLiveQuery(
      () => db.expenses.where("shopId").equals(shopId).reverse().toArray(),
      [shopId],
      [],
    ) ?? [];
  const activeExpenses = expenses.filter((item) => !item.deletedAt);
  const visible = expenses.filter((item) =>
    filter === "all" ? true : filter === "active" ? !item.deletedAt : Boolean(item.deletedAt),
  );
  const total = activeExpenses.reduce((sum, item) => sum + item.amount, 0);
  function openAdd() {
    setSelectedId("");
    setCategory(DEFAULT_EXPENSE_CATEGORIES[0]);
    setAmount(0);
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    setAttachmentIds([]);
    setAttachmentFiles([]);
    setError("");
    setSheet("add");
  }
  function openEdit(expense: (typeof expenses)[number]) {
    setSelectedId(expense.id);
    setCategory(expense.category);
    setAmount(expense.amount);
    setNote(expense.note ?? "");
    setDate(expense.date.slice(0, 10));
    setAttachmentIds(expense.attachmentIds);
    setAttachmentFiles([]);
    setError("");
    setSheet("edit");
  }
  async function submit() {
    const uploadedPaths: string[] = [];
    const previousAttachments =
      expenses.find((expense) => expense.id === selectedId)?.attachmentIds ?? [];
    try {
      if (amount <= 0) throw new Error("Nhập số tiền chi lớn hơn 0.");
      const expenseId = sheet === "edit" ? selectedId : createId();
      if (attachmentFiles.length) {
        if (!user || !hasFirebaseConfig())
          throw new Error("Cần đăng nhập Firebase để tải ảnh hóa đơn lên cloud.");
        for (const file of attachmentFiles) {
          const uploaded = await uploadExpenseAttachment({
            ownerUid: user.uid,
            shopId,
            expenseId,
            file,
          });
          uploadedPaths.push(uploaded.path);
        }
      }
      const nextAttachmentIds = [...new Set([...attachmentIds, ...uploadedPaths])];
      if (sheet === "edit")
        await updateExpense({
          shopId,
          deviceId: getDeviceId(),
          expenseId: selectedId,
          category,
          amount,
          note,
          date: `${date}T00:00:00.000Z`,
          attachmentIds: nextAttachmentIds,
        });
      else
        await addExpense({
          id: expenseId,
          shopId,
          deviceId: getDeviceId(),
          category,
          amount,
          note,
          date: `${date}T00:00:00.000Z`,
          attachmentIds: nextAttachmentIds,
        });
      const removed = previousAttachments.filter((path) => !nextAttachmentIds.includes(path));
      if (user && hasFirebaseConfig() && removed.length)
        await Promise.allSettled(removed.map((path) => deleteCloudFile(user.uid, path)));
      show(sheet === "edit" ? "Đã cập nhật chi phí" : "Đã lưu chi phí shop");
      setSheet(null);
      setAmount(0);
      setNote("");
    } catch (cause) {
      if (user && hasFirebaseConfig())
        await Promise.allSettled(
          uploadedPaths
            .filter((path) => !previousAttachments.includes(path))
            .map((path) => deleteCloudFile(user.uid, path)),
        );
      setError(toVietnameseError(cause));
    }
  }
  async function toggle(expense: (typeof expenses)[number]) {
    const active = Boolean(expense.deletedAt);
    if (
      !active &&
      !window.confirm("Hủy khoản chi này? Báo cáo sẽ loại khoản này nhưng lịch sử vẫn được giữ.")
    )
      return;
    try {
      await setExpenseActive(shopId, getDeviceId(), expense.id, active);
      show(active ? "Đã khôi phục khoản chi" : "Đã hủy khoản chi");
    } catch (cause) {
      show(toVietnameseError(cause));
    }
  }
  return (
    <div>
      <PageHeader
        title="Chi phí shop"
        eyebrow="CHI PHÍ VẬN HÀNH"
        action={
          <Button onClick={openAdd}>
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
          <p>{activeExpenses.length} khoản chi đang tính vào báo cáo</p>
        </div>
      </Card>
      <div className="segmented expense-filter">
        <button
          type="button"
          className={filter === "active" ? "is-active" : ""}
          onClick={() => setFilter("active")}
        >
          Đang tính
        </button>
        <button
          type="button"
          className={filter === "voided" ? "is-active" : ""}
          onClick={() => setFilter("voided")}
        >
          Đã hủy
        </button>
        <button
          type="button"
          className={filter === "all" ? "is-active" : ""}
          onClick={() => setFilter("all")}
        >
          Tất cả
        </button>
      </div>
      <div className="expense-list">
        {visible.map((expense) => (
          <Card key={expense.id}>
            <span className="expense-icon">
              <Receipt />
            </span>
            <span>
              <strong>{expense.category}</strong>
              <small>{expense.note || "Không có ghi chú"}</small>
              <small>{formatDateTime(expense.date)}</small>
              {expense.attachmentIds.length > 0 && (
                <small>{expense.attachmentIds.length} ảnh hóa đơn</small>
              )}
              {expense.deletedAt && <Badge tone="neutral">Đã hủy</Badge>}
            </span>
            <b>{formatMoney(expense.amount)}</b>
            <div className="crud-actions">
              {!expense.deletedAt && (
                <Button variant="ghost" onClick={() => openEdit(expense)} aria-label="Sửa chi phí">
                  <Pencil />
                </Button>
              )}
              <Button
                variant={expense.deletedAt ? "secondary" : "danger"}
                onClick={() => toggle(expense)}
              >
                {expense.deletedAt ? <RotateCcw /> : <Trash2 />}
                {expense.deletedAt ? "Khôi phục" : "Hủy"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {sheet && (
        <div className="sheet-backdrop">
          <div className="bottom-sheet">
            <button
              type="button"
              className="sheet-close"
              aria-label="Đóng"
              onClick={() => setSheet(null)}
            >
              <X />
            </button>
            <h2>{sheet === "edit" ? "Sửa chi phí shop" : "Thêm chi phí shop"}</h2>
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
              <label>
                Ngày chi
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label className="file-button">
                <Paperclip />
                Đính kèm ảnh hóa đơn
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => setAttachmentFiles([...(event.target.files ?? [])])}
                />
              </label>
              {attachmentIds.length > 0 && (
                <div className="crud-image-list span-full">
                  {attachmentIds.map((path) => (
                    <div key={path}>
                      <span>{path.split("/").at(-1)}</span>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setAttachmentIds(attachmentIds.filter((item) => item !== path))
                        }
                      >
                        <Trash2 /> Xóa ảnh
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {attachmentFiles.length > 0 && (
                <small>{attachmentFiles.length} ảnh mới sẽ được tải khi lưu.</small>
              )}
            </div>
            {error && <p className="form-error">{error}</p>}
            <Button onClick={submit}>{sheet === "edit" ? "Lưu thay đổi" : "Lưu chi phí"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
