import type {
  ConflictRecord,
  EntityMeta,
  EntityType,
  OutboxEvent,
  SnapshotRecord,
} from "@pocket/domain";
import { createId, createMeta, nowIso, PocketError } from "@pocket/domain";
import { db, getDeviceId, type PocketDatabase } from "@pocket/local-db";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export interface Changeset {
  schemaVersion: 1;
  changeSetId: string;
  shopId: string;
  deviceId: string;
  baseSnapshotId?: string;
  createdAt: string;
  checksum: string;
  events: OutboxEvent[];
}

export interface SnapshotEnvelope {
  schemaVersion: 1;
  snapshotId: string;
  shopId: string;
  deviceId: string;
  createdAt: string;
  latestChangeSetId?: string;
  checksum: string;
  tables: Record<string, unknown[]>;
}

export interface CloudFileAdapter {
  upload(path: string, data: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  list(prefix: string): Promise<Array<{ path: string; updatedAt?: string }>>;
  delete(path: string): Promise<void>;
}

export async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? strToU8(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildChangeset(
  shopId: string,
  events: OutboxEvent[],
  baseSnapshotId?: string,
): Promise<Changeset> {
  const core = {
    schemaVersion: 1 as const,
    changeSetId: createId(),
    shopId,
    deviceId: getDeviceId(),
    baseSnapshotId,
    createdAt: nowIso(),
    events: [...events].sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    ),
  };
  return { ...core, checksum: await sha256(JSON.stringify(core)) };
}

export function encodeGzip(value: unknown): Uint8Array {
  return gzipSync(strToU8(JSON.stringify(value)), { level: 6 });
}

export function decodeGzip<T>(value: Uint8Array): T {
  try {
    return JSON.parse(strFromU8(gunzipSync(value))) as T;
  } catch (error) {
    throw new PocketError(
      "CORRUPTED_SNAPSHOT",
      "Tệp sao lưu bị hỏng.",
      "Chọn bản sao lưu khác hoặc tải lại.",
      error,
    );
  }
}

export function cloudPartition(date = new Date()): { year: string; month: string } {
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
  };
}

const SNAPSHOT_TABLES = [
  "products",
  "attributes",
  "attributeValues",
  "variants",
  "customers",
  "suppliers",
  "sales",
  "saleLines",
  "purchases",
  "purchaseLines",
  "stockMovements",
  "returnExchanges",
  "payments",
  "expenses",
  "auditLogs",
  "conflicts",
] as const;

export async function createSnapshotArchive(database: PocketDatabase, shopId: string) {
  const tables: SnapshotEnvelope["tables"] = {};
  for (const name of SNAPSHOT_TABLES)
    tables[name] = await database.table(name).where("shopId").equals(shopId).toArray();
  const core = {
    schemaVersion: 1 as const,
    snapshotId: createId(),
    shopId,
    deviceId: getDeviceId(),
    createdAt: nowIso(),
    tables,
  };
  const envelope: SnapshotEnvelope = { ...core, checksum: await sha256(JSON.stringify(core)) };
  return { envelope, archive: encodeGzip(envelope) };
}

export async function restoreSnapshotArchive(
  database: PocketDatabase,
  archive: Uint8Array,
  expectedShopId: string,
) {
  const envelope = decodeGzip<SnapshotEnvelope>(archive);
  if (envelope.schemaVersion !== 1)
    throw new PocketError(
      "UNSUPPORTED_SCHEMA",
      "Bản sao lưu dùng phiên bản dữ liệu chưa hỗ trợ.",
      "Cập nhật SỔ TAY trước khi khôi phục.",
    );
  if (envelope.shopId !== expectedShopId)
    throw new PocketError(
      "SNAPSHOT_OTHER_SHOP",
      "Bản sao lưu thuộc shop khác.",
      "Chọn đúng bản sao lưu của shop.",
    );
  const { checksum, ...core } = envelope;
  if ((await sha256(JSON.stringify(core))) !== checksum)
    throw new PocketError(
      "CHECKSUM_MISMATCH",
      "Kiểm tra toàn vẹn bản sao lưu thất bại.",
      "Không sử dụng tệp này; chọn bản khác.",
    );
  const names = Object.keys(envelope.tables);
  await database.transaction(
    "rw",
    names.map((name) => database.table(name)),
    async () => {
      for (const name of names) {
        const table = database.table(name);
        await table.where("shopId").equals(expectedShopId).delete();
        if (envelope.tables[name]?.length) await table.bulkAdd(envelope.tables[name]);
      }
    },
  );
  return {
    tables: names.length,
    records: Object.values(envelope.tables).reduce((sum, rows) => sum + rows.length, 0),
  };
}

export class SyncEngine {
  private running?: Promise<{ uploaded: number; path?: string }>;

  constructor(
    private readonly database: PocketDatabase,
    private readonly cloud: CloudFileAdapter,
    private readonly ownerUid: string,
  ) {}

  sync(shopId: string): Promise<{ uploaded: number; path?: string }> {
    if (this.running) return this.running;
    this.running = this.run(shopId).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async run(shopId: string) {
    const pending = await this.database.outbox
      .where("[shopId+syncStatus]")
      .equals([shopId, "pending"])
      .limit(250)
      .toArray();
    if (pending.length === 0) return { uploaded: 0 };
    await this.database.outbox.bulkPut(
      pending.map((event) => ({ ...event, syncStatus: "syncing" as const, updatedAt: nowIso() })),
    );
    try {
      const latestSnapshot = await this.database.snapshots.where("shopId").equals(shopId).last();
      const changeset = await buildChangeset(shopId, pending, latestSnapshot?.snapshotId);
      const { year, month } = cloudPartition(new Date(changeset.createdAt));
      const path = `users/${this.ownerUid}/shops/${shopId}/changes/${year}/${month}/change-${changeset.changeSetId}.json.gz`;
      await this.cloud.upload(path, encodeGzip(changeset), "application/gzip");
      await this.database.outbox.bulkPut(
        pending.map((event) => ({
          ...event,
          syncStatus: "synced" as const,
          updatedAt: nowIso(),
          lastError: undefined,
        })),
      );
      return { uploaded: pending.length, path };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.database.outbox.bulkPut(
        pending.map((event) => ({
          ...event,
          syncStatus: "failed" as const,
          updatedAt: nowIso(),
          retryCount: event.retryCount + 1,
          lastError: message,
        })),
      );
      throw new PocketError(
        "SYNC_UPLOAD_FAILED",
        "Chưa thể đồng bộ dữ liệu.",
        "Kiểm tra mạng rồi bấm Thử lại.",
        error,
      );
    }
  }

  async retryFailed(shopId: string) {
    await this.database.outbox
      .where("[shopId+syncStatus]")
      .equals([shopId, "failed"])
      .modify({ syncStatus: "pending" });
    return this.sync(shopId);
  }

  async createSnapshot(shopId: string): Promise<SnapshotRecord> {
    await this.sync(shopId);
    const { envelope, archive: compressed } = await createSnapshotArchive(this.database, shopId);
    const { year, month } = cloudPartition(new Date(envelope.createdAt));
    const path = `users/${this.ownerUid}/shops/${shopId}/snapshots/${year}/${month}/snapshot-${envelope.snapshotId}.json.gz`;
    await this.cloud.upload(path, compressed, "application/gzip");
    const record: SnapshotRecord = {
      ...createMeta(shopId, getDeviceId()),
      snapshotId: envelope.snapshotId,
      deviceId: envelope.deviceId,
      schemaVersion: 1,
      latestChangeSetId: envelope.latestChangeSetId,
      checksum: envelope.checksum,
      cloudPath: path,
      byteSize: compressed.byteLength,
    };
    await this.database.snapshots.add(record);
    return record;
  }

  async restoreSnapshot(path: string, expectedShopId: string) {
    return restoreSnapshotArchive(this.database, await this.cloud.download(path), expectedShopId);
  }
}

export function detectConflict(local: EntityMeta, remote: EntityMeta): boolean {
  if (local.id !== remote.id || local.shopId !== remote.shopId) return false;
  if (local.revision === remote.revision) return JSON.stringify(local) !== JSON.stringify(remote);
  return (
    local.revision > 1 &&
    remote.revision > 1 &&
    local.updatedByDeviceId !== remote.updatedByDeviceId
  );
}

export async function saveConflict(
  shopId: string,
  entityType: EntityType,
  local: EntityMeta,
  remote: EntityMeta,
  database = db,
): Promise<ConflictRecord> {
  const conflict: ConflictRecord = {
    ...createMeta(shopId, getDeviceId()),
    entityType,
    entityId: local.id,
    localRevision: local.revision,
    remoteRevision: remote.revision,
    localValue: local,
    remoteValue: remote,
    status: "open",
  };
  await database.conflicts.add(conflict);
  return conflict;
}

export class MemoryCloudAdapter implements CloudFileAdapter {
  readonly files = new Map<string, Uint8Array>();
  async upload(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data.slice());
  }
  async download(path: string): Promise<Uint8Array> {
    const value = this.files.get(path);
    if (!value) throw new Error("File not found");
    return value.slice();
  }
  async list(prefix: string) {
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix))
      .map((path) => ({ path }));
  }
  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }
}
