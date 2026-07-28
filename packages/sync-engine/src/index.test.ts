import { createMeta } from "@pocket/domain";
import { describe, expect, it } from "vitest";
import { buildChangeset, decodeGzip, detectConflict, encodeGzip, sha256 } from "./index";

describe("sync protocol", () => {
  it("serializes gzip changesets with stable checksum", async () => {
    const meta = createMeta("shop", "device");
    const event = {
      ...meta,
      deviceId: "device",
      entityType: "product" as const,
      entityId: "product",
      action: "create" as const,
      entityRevision: 1,
      payload: { name: "Áo" },
      occurredAt: meta.createdAt,
      retryCount: 0,
    };
    const changeset = await buildChangeset("shop", [event]);
    expect(decodeGzip<typeof changeset>(encodeGzip(changeset))).toEqual(changeset);
    expect(changeset.checksum).toHaveLength(64);
    expect(await sha256("SỔ TAY")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("detects edits from different devices", () => {
    const local = { ...createMeta("shop", "a", "entity"), revision: 2 };
    const remote = { ...local, updatedByDeviceId: "b", revision: 3 };
    expect(detectConflict(local, remote)).toBe(true);
  });
});
