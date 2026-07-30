import { afterEach, describe, expect, it, vi } from "vitest";
import { alertVariantNote, getVariantNoteMessage } from "./variantNote";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("variant note notification", () => {
  it("keeps the note content and adds the requested prefix", () => {
    expect(getVariantNoteMessage("  Áo bán cho khách A  ")).toBe("Ghi chú: Áo bán cho khách A");
  });

  it("alerts only when a variant has a note", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    expect(alertVariantNote("Áo cần in")).toBe(true);
    expect(alert).toHaveBeenCalledWith("Ghi chú: Áo cần in");
    expect(alertVariantNote(" ")).toBe(false);
    expect(alert).toHaveBeenCalledOnce();
  });
});
