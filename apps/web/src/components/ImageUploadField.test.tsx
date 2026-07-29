import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImageUploadField } from "./ImageUploadField";

function TestField() {
  const [files, setFiles] = useState<File[]>([]);
  return <ImageUploadField files={files} onFilesChange={setFiles} />;
}

describe("ImageUploadField", () => {
  it("rejects an invalid file without adding it to the upload queue", async () => {
    render(<TestField />);
    const input = screen.getByLabelText(/Chọn ảnh/);
    fireEvent.change(input, {
      target: { files: [new File(["not-an-image"], "invoice.txt", { type: "text/plain" })] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP",
    );
    expect(screen.queryByLabelText("Ảnh đã chọn")).toBeNull();
  });

  it("shows a removable preview for a valid selected image", async () => {
    const createObjectURL = vi.fn(() => "blob:preview");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    render(<TestField />);
    const input = screen.getByLabelText(/Chọn ảnh/);
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "shirt.jpg", {
            type: "image/jpeg",
          }),
        ],
      },
    });

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(screen.getByAltText("Xem trước shirt.jpg")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh shirt.jpg" }));
    await waitFor(() => expect(screen.queryByAltText("Xem trước shirt.jpg")).toBeNull());
  });
});
