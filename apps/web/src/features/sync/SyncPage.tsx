import { FirebaseCloudAdapter, getFirebaseClients } from "@pocket/firebase";
import { db, getStorageStatus } from "@pocket/local-db";
import { createSnapshotArchive, restoreSnapshotArchive, SyncEngine } from "@pocket/sync-engine";
import { Badge, Button, Card } from "@pocket/ui";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../app/AuthContext";
import { formatDateTime, toVietnameseError } from "../../app/format";
import { useShop } from "../../app/ShopContext";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/Ui";

export default function SyncPage() {
  const { activeShop } = useShop();
  const { user } = useAuth();
  const { show } = useToast();
  const shopId = activeShop?.id ?? "";
  const [busy, setBusy] = useState("");
  const [_error, setError] = useState("");
  const storage = useLiveQuery(() => getStorageStatus(shopId), [shopId]);
  const conflicts =
    useLiveQuery(() => db.conflicts.where({ shopId, status: "open" }).toArray(), [shopId], []) ??
    [];
  const snapshots =
    useLiveQuery(
      () => db.snapshots.where("shopId").equals(shopId).reverse().toArray(),
      [shopId],
      [],
    ) ?? [];
  const failed =
    useLiveQuery(
      () => db.outbox.where("[shopId+syncStatus]").equals([shopId, "failed"]).toArray(),
      [shopId],
      [],
    ) ?? [];
  const clients = getFirebaseClients();
  async function sync() {
    if (!clients || !user) {
      setError(
        "Chưa có cấu hình Firebase. Dữ liệu vẫn an toàn trên thiết bị; hãy tải bản sao lưu bên dưới.",
      );
      return;
    }
    setBusy("sync");
    setError("");
    try {
      const result = await new SyncEngine(
        db,
        new FirebaseCloudAdapter(clients.storage),
        user.uid,
      ).sync(shopId);
      show(result.uploaded ? `Đã đồng bộ ${result.uploaded} thay đổi` : "Không có thay đổi mới");
    } catch (cause) {
      setError(toVietnameseError(cause));
    } finally {
      setBusy("");
    }
  }
  async function backup() {
    setBusy("backup");
    try {
      const { envelope, archive } = await createSnapshotArchive(db, shopId);
      const bytes = Uint8Array.from(archive);
      const url = URL.createObjectURL(new Blob([bytes.buffer], { type: "application/gzip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `pocket-${activeShop?.name.replaceAll(" ", "-").toLowerCase()}-${envelope.createdAt.slice(0, 10)}.json.gz`;
      link.click();
      URL.revokeObjectURL(url);
      show("Đã tạo bản sao lưu có checksum");
    } catch (cause) {
      setError(toVietnameseError(cause));
    } finally {
      setBusy("");
    }
  }
  async function restore(file?: File) {
    if (!file) return;
    if (!window.confirm("Khôi phục sẽ thay dữ liệu shop hiện tại bằng bản sao đã chọn. Tiếp tục?"))
      return;
    setBusy("restore");
    try {
      const report = await restoreSnapshotArchive(
        db,
        new Uint8Array(await file.arrayBuffer()),
        shopId,
      );
      show(`Khôi phục xong ${report.records} bản ghi, đã kiểm tra toàn vẹn`);
    } catch (cause) {
      setError(toVietnameseError(cause));
    } finally {
      setBusy("");
    }
  }
  async function resolve(id: string, choice: "local" | "remote") {
    const conflict = await db.conflicts.get(id);
    if (!conflict) return;
    await db.conflicts.put({
      ...conflict,
      status: choice === "local" ? "resolved_local" : "resolved_remote",
      resolvedAt: new Date().toISOString(),
    });
    show(`Đã giữ phiên bản ${choice === "local" ? "trên thiết bị" : "từ cloud"}`);
  }
  const usagePercent = storage?.quota ? Math.round((storage.usage / storage.quota) * 100) : 0;
  return (
    <div>
      <PageHeader
        title="Đồng bộ & Sao lưu"
        eyebrow="DỮ LIỆU LOCAL-FIRST"
        back
        action={
          <Badge tone={navigator.onLine ? "success" : "warning"}>
            {navigator.onLine ? "Có mạng" : "Ngoại tuyến"}
          </Badge>
        }
      />
      <div className="sync-grid">
        <main>
          <Card className="sync-status">
            <span className={storage?.pending ? "sync-status__pending" : "sync-status__ok"}>
              {storage?.pending ? <RefreshCw /> : <CheckCircle2 />}
            </span>
            <div>
              <h2>
                {storage?.pending
                  ? `${storage.pending} thay đổi chờ đồng bộ`
                  : "Dữ liệu trên thiết bị đã sẵn sàng"}
              </h2>
              <p>
                {clients
                  ? "Cloud Storage đã kết nối. SỔ TAY tự thử lại khi có mạng."
                  : "Chưa kết nối Firebase Cloud Storage. Sao lưu thủ công vẫn hoạt động."}
              </p>
              <small>Lần đồng bộ gần nhất: {formatDateTime(storage?.lastSuccessfulSync)}</small>
            </div>
            <Button onClick={sync} disabled={busy === "sync"}>
              {busy === "sync" ? "Đang đồng bộ…" : "Đồng bộ ngay"}
              <RefreshCw />
            </Button>
          </Card>
          {failed.length > 0 && (
            <Card className="sync-error">
              <AlertTriangle />
              <div>
                <h3>{failed.length} mục đồng bộ thất bại</h3>
                <p>{failed[0]?.lastError}</p>
              </div>
              <Button variant="danger" onClick={sync}>
                Thử lại
              </Button>
            </Card>
          )}
          <section>
            <div className="section-title">
              <div>
                <h2>Sao lưu & khôi phục</h2>
                <p>Tệp nén có checksum SHA-256 và đủ dữ liệu để dựng lại shop.</p>
              </div>
            </div>
            <div className="backup-actions">
              <Card>
                <Download />
                <div>
                  <h3>Tải bản sao thiết bị</h3>
                  <p>Tạo bản sao bất biến ngay bây giờ, dùng được không cần cloud.</p>
                </div>
                <Button variant="secondary" onClick={backup} disabled={busy === "backup"}>
                  {busy === "backup" ? "Đang tạo…" : "Tạo & tải xuống"}
                </Button>
              </Card>
              <Card>
                <Upload />
                <div>
                  <h3>Khôi phục bản sao</h3>
                  <p>Kiểm tra schema, shop và checksum trước khi ghi dữ liệu.</p>
                </div>
                <label className="button button--secondary">
                  Chọn tệp
                  <input
                    type="file"
                    accept=".gz,application/gzip"
                    onChange={(e) => void restore(e.target.files?.[0])}
                  />
                </label>
              </Card>
            </div>
          </section>
          <section>
            <div className="section-title">
              <div>
                <h2>Trung tâm xung đột</h2>
                <p>SỔ TAY không bao giờ âm thầm ghi đè hai phiên bản khác nhau.</p>
              </div>
              <Badge tone={conflicts.length ? "warning" : "success"}>
                {conflicts.length} đang mở
              </Badge>
            </div>
            {conflicts.length ? (
              <div className="conflict-list">
                {conflicts.map((conflict) => (
                  <Card key={conflict.id}>
                    <AlertTriangle />
                    <span>
                      <strong>
                        {conflict.entityType} · {conflict.entityId.slice(0, 8)}
                      </strong>
                      <small>
                        Thiết bị: bản {conflict.localRevision} · Cloud: bản{" "}
                        {conflict.remoteRevision}
                      </small>
                    </span>
                    <div>
                      <Button
                        variant="secondary"
                        onClick={() => void resolve(conflict.id, "local")}
                      >
                        Giữ thiết bị
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void resolve(conflict.id, "remote")}
                      >
                        Giữ cloud
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="consistency-ok">
                <ShieldCheck />
                <div>
                  <h3>Không có xung đột</h3>
                  <p>Các phiên bản dữ liệu hiện không cần xử lý thủ công.</p>
                </div>
              </Card>
            )}
          </section>
        </main>
        <aside>
          <Card className="device-card">
            <Smartphone />
            <h3>Thiết bị hiện tại</h3>
            <code>{storage?.deviceId}</code>
            <div>
              <span>Lưu trữ bền vững</span>
              <Badge tone={storage?.persisted ? "success" : "warning"}>
                {storage?.persisted ? "Đã cấp" : "Chưa cấp"}
              </Badge>
            </div>
            <div>
              <span>Dung lượng dùng</span>
              <b>{((storage?.usage ?? 0) / 1024 / 1024).toFixed(1)} MB</b>
            </div>
            <div className="storage-bar">
              <i style={{ width: `${Math.min(100, usagePercent)}%` }} />
            </div>
            <small>{usagePercent}% hạn mức trình duyệt</small>
          </Card>
          <Card className="cloud-card">
            <Cloud />
            <h3>Cloud Storage</h3>
            <p>
              {clients
                ? "Đã cấu hình Firebase"
                : "Cần thêm biến môi trường Firebase để đồng bộ nhiều thiết bị."}
            </p>
            <Badge tone={clients ? "success" : "neutral"}>
              {clients ? "Đã kết nối" : "Chưa cấu hình"}
            </Badge>
          </Card>
          <Card className="snapshot-card">
            <HardDrive />
            <h3>Lịch sử snapshot cloud</h3>
            {snapshots.length ? (
              snapshots.map((snapshot) => (
                <div key={snapshot.id}>
                  <span>{formatDateTime(snapshot.createdAt)}</span>
                  <b>{(snapshot.byteSize / 1024).toFixed(0)} KB</b>
                </div>
              ))
            ) : (
              <p>Chưa có snapshot cloud trên thiết bị này.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
