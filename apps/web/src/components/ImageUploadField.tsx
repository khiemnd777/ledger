import { IMAGE_ACCEPT, validateImageFile } from "@pocket/firebase";
import { Button } from "@pocket/ui";
import { Image as ImageIcon, ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { CloudImage } from "./CloudImage";

interface ImageUploadFieldProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  existingPaths?: string[];
  onExistingPathsChange?: (paths: string[]) => void;
  ownerUid?: string;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  progress?: number;
  multiple?: boolean;
  compact?: boolean;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function ImageUploadField({
  files,
  onFilesChange,
  existingPaths = [],
  onExistingPathsChange,
  ownerUid,
  disabled = false,
  label = "Thêm hình ảnh",
  helperText = "JPEG, PNG hoặc WebP · tối đa 8 MB mỗi ảnh",
  progress = 0,
  multiple = true,
  compact = false,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [previews, setPreviews] = useState<Array<{ key: string; url: string }>>([]);

  useEffect(() => {
    const next = files.map((file) => ({ key: fileKey(file), url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => {
      for (const preview of next) URL.revokeObjectURL(preview.url);
    };
  }, [files]);

  async function addFiles(selected: File[]) {
    if (disabled || selected.length === 0) return;
    const accepted: File[] = [];
    const errors: string[] = [];
    for (const file of multiple ? selected : selected.slice(0, 1)) {
      try {
        await validateImageFile(file);
        accepted.push(file);
      } catch (cause) {
        errors.push(cause instanceof Error ? cause.message : "Ảnh không hợp lệ.");
      }
    }
    setValidationError(errors.join(" "));
    if (accepted.length === 0) return;
    const next = multiple ? [...files, ...accepted] : accepted;
    onFilesChange([...new Map(next.map((file) => [fileKey(file), file])).values()]);
  }

  return (
    <div className={`image-upload${compact ? " image-upload--compact" : ""}`}>
      <fieldset
        aria-label="Tải hình ảnh"
        disabled={disabled}
        className={`image-upload__drop${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget;
          if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <UploadCloud />
        <strong>{label}</strong>
        <span>{helperText}</span>
        <label className="button button--secondary" htmlFor={inputId}>
          <ImagePlus /> Chọn ảnh
        </label>
        <input
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </fieldset>

      {validationError && (
        <p className="form-error image-upload__error" role="alert">
          {validationError}
        </p>
      )}

      {(existingPaths.length > 0 || files.length > 0) && (
        <ul className="image-upload__previews" aria-label="Ảnh đã chọn">
          {existingPaths.map((path) => (
            <li key={path}>
              <figure>
                <CloudImage
                  ownerUid={ownerUid}
                  path={path}
                  alt="Ảnh đã lưu"
                  fallback={<ImageIcon aria-hidden="true" />}
                />
                {onExistingPathsChange && (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={disabled}
                    aria-label="Bỏ ảnh đã lưu"
                    onClick={() =>
                      onExistingPathsChange(existingPaths.filter((item) => item !== path))
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </figure>
            </li>
          ))}
          {files.map((file) => {
            const preview = previews.find((item) => item.key === fileKey(file));
            return (
              <li key={fileKey(file)}>
                <figure>
                  {preview ? (
                    <img src={preview.url} alt={`Xem trước ${file.name}`} />
                  ) : (
                    <ImageIcon />
                  )}
                  <figcaption title={file.name}>{file.name}</figcaption>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={disabled}
                    aria-label={`Bỏ ảnh ${file.name}`}
                    onClick={() =>
                      onFilesChange(files.filter((item) => fileKey(item) !== fileKey(file)))
                    }
                  >
                    <Trash2 />
                  </Button>
                </figure>
              </li>
            );
          })}
        </ul>
      )}

      {progress > 0 && (
        <div className="image-upload__progress" role="status">
          <span>Đang tải ảnh… {progress}%</span>
          <progress max={100} value={progress} />
        </div>
      )}
    </div>
  );
}
