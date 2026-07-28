import type { Customer, Purchase, Sale, Supplier } from "@pocket/domain";
import {
  createCustomer,
  createSupplier,
  db,
  getDeviceId,
  recordDebtPayment,
  setPartyActive,
  updateParty,
} from "@pocket/local-db";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Banknote,
  ChevronRight,
  CirclePlus,
  Factory,
  Pencil,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatMoney, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader, SearchField } from "../../components/Ui";

export default function ContactsPage({ type }: { type: "customer" | "supplier" }) {
  const { activeShop } = useShop();
  const { show } = useToast();
  const shopId = activeShop?.id ?? "";
  const customerMode = type === "customer";
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [sheet, setSheet] = useState<"add" | "edit" | "pay" | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"bank_transfer" | "cash">("bank_transfer");
  const [error, setError] = useState("");
  const customers =
    useLiveQuery<Customer[]>(
      () => db.customers.where("shopId").equals(shopId).toArray(),
      [shopId],
    ) ?? [];
  const suppliers =
    useLiveQuery<Supplier[]>(
      () => db.suppliers.where("shopId").equals(shopId).toArray(),
      [shopId],
    ) ?? [];
  const contacts: Array<Customer | Supplier> = customerMode ? customers : suppliers;
  const selected = contacts.find((item) => item.id === selectedId);
  const sales =
    useLiveQuery<Sale[]>(
      () =>
        selectedId && customerMode
          ? db.sales.where("customerId").equals(selectedId).reverse().toArray()
          : Promise.resolve([] as Sale[]),
      [selectedId, customerMode],
    ) ?? [];
  const purchases =
    useLiveQuery<Purchase[]>(
      () =>
        selectedId && !customerMode
          ? db.purchases.where("supplierId").equals(selectedId).reverse().toArray()
          : Promise.resolve([] as Purchase[]),
      [selectedId, customerMode],
    ) ?? [];
  const debt = (contact: (typeof contacts)[number]) =>
    "totalReceivable" in contact ? contact.totalReceivable : contact.totalPayable;
  const filtered = contacts.filter((item) =>
    `${item.name} ${item.phone}`.toLowerCase().includes(query.toLowerCase()),
  );
  function openAdd() {
    setName("");
    setPhone("");
    setAddress("");
    setNote("");
    setError("");
    setSheet("add");
  }
  function openEdit() {
    if (!selected) return;
    setName(selected.name);
    setPhone(selected.phone ?? "");
    setAddress(selected.address ?? "");
    setNote(selected.note ?? "");
    setError("");
    setSheet("edit");
  }
  async function saveParty() {
    if (!name.trim()) {
      setError("Nhập tên trước khi lưu.");
      return;
    }
    try {
      if (sheet === "edit" && selected) {
        await updateParty({
          shopId,
          deviceId: getDeviceId(),
          partyType: type,
          partyId: selected.id,
          name,
          phone,
          address,
          note,
        });
        show(`Đã sửa ${customerMode ? "khách hàng" : "xưởng"}`);
      } else if (customerMode)
        await createCustomer({ shopId, deviceId: getDeviceId(), name, phone, address, note });
      else await createSupplier({ shopId, deviceId: getDeviceId(), name, phone, address, note });
      if (sheet === "add") show(`Đã thêm ${customerMode ? "khách hàng" : "xưởng"}`);
      setSheet(null);
      setName("");
      setPhone("");
      setAddress("");
      setNote("");
    } catch (cause) {
      setError(toVietnameseError(cause));
    }
  }
  async function pay() {
    if (!selected) return;
    try {
      await recordDebtPayment({
        shopId,
        deviceId: getDeviceId(),
        partyType: type,
        partyId: selected.id,
        amount,
        method,
      });
      show("Đã ghi nhận thanh toán công nợ");
      setSheet(null);
      setAmount(0);
    } catch (cause) {
      setError(toVietnameseError(cause));
    }
  }
  async function toggleActive() {
    if (!selected) return;
    const active = !selected.active;
    if (
      !active &&
      !window.confirm(
        `Tạm ẩn ${customerMode ? "khách hàng" : "xưởng"}? Công nợ và lịch sử vẫn được giữ nguyên.`,
      )
    )
      return;
    try {
      await setPartyActive({
        shopId,
        deviceId: getDeviceId(),
        partyType: type,
        partyId: selected.id,
        active,
      });
      show(active ? "Đã kích hoạt lại" : "Đã tạm ẩn");
    } catch (cause) {
      show(toVietnameseError(cause));
    }
  }
  if (selected) {
    const history: Array<Sale | Purchase> = customerMode ? sales : purchases;
    return (
      <div>
        <PageHeader
          title={selected.name}
          eyebrow={customerMode ? "KHÁCH HÀNG" : "XƯỞNG / NHÀ CUNG CẤP"}
          back
          onBack={() => setSelectedId("")}
          action={
            <Badge tone={selected.active ? "success" : "neutral"}>
              {selected.active ? "Đang hoạt động" : "Tạm ẩn"}
            </Badge>
          }
        />
        <div className="contact-detail">
          <Card className="contact-hero">
            <span>{customerMode ? <UserRound /> : <Factory />}</span>
            <div>
              <h2>{selected.name}</h2>
              <p>
                <Phone />
                {selected.phone || "Chưa có số điện thoại"}
              </p>
              <small>{selected.address || "Chưa có địa chỉ"}</small>
            </div>
            <div>
              <small>{customerMode ? "Khách còn thiếu" : "Còn nợ xưởng"}</small>
              <strong>{formatMoney(debt(selected))}</strong>
              <Button onClick={() => setSheet("pay")} disabled={debt(selected) === 0}>
                <Banknote />
                Ghi nhận thanh toán
              </Button>
              <div className="crud-actions">
                <Button variant="secondary" onClick={openEdit}>
                  <Pencil /> Sửa
                </Button>
                <Button variant={selected.active ? "danger" : "secondary"} onClick={toggleActive}>
                  {selected.active ? "Tạm ẩn" : "Kích hoạt"}
                </Button>
              </div>
            </div>
          </Card>
          <section>
            <h2>{customerMode ? "Lịch sử mua hàng" : "Lịch sử nhập áo"}</h2>
            <div className="order-list">
              {history.map((record) => (
                <Card key={record.id}>
                  <span>{customerMode ? <UserRound /> : <Factory />}</span>
                  <span>
                    <strong>
                      {"orderNumber" in record ? record.orderNumber : record.receiptNumber}
                    </strong>
                    <small>
                      {formatDateTime(
                        "completedAt" in record
                          ? record.completedAt
                          : (record as Purchase).receivedAt,
                      )}
                    </small>
                  </span>
                  <span>
                    <b>{formatMoney(record.total)}</b>
                    <small>Còn thiếu {formatMoney(record.amountDue)}</small>
                  </span>
                </Card>
              ))}
            </div>
          </section>
        </div>
        {sheet && renderSheet()}
      </div>
    );
  }
  function renderSheet() {
    return (
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
          <h2>
            {sheet === "add"
              ? `Thêm ${customerMode ? "khách hàng" : "xưởng"}`
              : sheet === "edit"
                ? `Sửa ${customerMode ? "khách hàng" : "xưởng"}`
                : "Ghi nhận thanh toán"}
          </h2>
          <p>
            {sheet === "add" || sheet === "edit"
              ? "Thông tin cơ bản có thể bổ sung sau."
              : `${selected?.name} · Còn ${formatMoney(selected ? debt(selected) : 0)}`}
          </p>
          {sheet === "add" || sheet === "edit" ? (
            <div className="form-card">
              <label>
                Tên
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Số điện thoại
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label>
                Địa chỉ
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label>
                Ghi chú
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="form-card">
              <label>
                Số tiền
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </label>
              <label>
                Phương thức
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value as typeof method)}
                >
                  <option value="bank_transfer">Chuyển khoản</option>
                  <option value="cash">Tiền mặt</option>
                </select>
              </label>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <Button onClick={sheet === "pay" ? pay : saveParty}>
            {sheet === "pay" ? "Lưu thanh toán" : "Lưu thông tin"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title={customerMode ? "Khách hàng" : "Xưởng / Nhà cung cấp"}
        eyebrow={customerMode ? "NGƯỜI MUA" : "NGUỒN NHẬP ÁO"}
        action={
          <Button onClick={openAdd}>
            <CirclePlus />
            Thêm {customerMode ? "khách" : "xưởng"}
          </Button>
        }
      />
      <div className="contact-stats">
        <Card>
          <small>{customerMode ? "Khách còn thiếu" : "Còn nợ xưởng"}</small>
          <strong>{formatMoney(contacts.reduce((sum, item) => sum + debt(item), 0))}</strong>
          <span>{contacts.filter((item) => debt(item) > 0).length} khoản cần theo dõi</span>
        </Card>
        <Card>
          <small>Tổng {customerMode ? "khách" : "xưởng"}</small>
          <strong>{contacts.filter((item) => item.active).length}</strong>
          <span>Đang hoạt động</span>
        </Card>
      </div>
      <SearchField value={query} onChange={setQuery} placeholder={`Tìm tên hoặc số điện thoại`} />
      <div className="contact-list">
        {filtered.map((contact) => (
          <button type="button" onClick={() => setSelectedId(contact.id)} key={contact.id}>
            <Card>
              <span className="contact-avatar">{customerMode ? <UserRound /> : <Factory />}</span>
              <span>
                <strong>{contact.name}</strong>
                {!contact.active && <Badge tone="neutral">Tạm ẩn</Badge>}
                <small>{contact.phone || "Chưa có số điện thoại"}</small>
              </span>
              <span>
                <small>{customerMode ? "Còn thiếu" : "Còn nợ"}</small>
                <b className={debt(contact) > 0 ? "text-warning" : "text-success"}>
                  {formatMoney(debt(contact))}
                </b>
              </span>
              <ChevronRight />
            </Card>
          </button>
        ))}
      </div>
      {sheet && renderSheet()}
    </div>
  );
}
