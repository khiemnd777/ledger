import { Card } from "@pocket/ui";
import { ChevronLeft, Search, Shirt } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <p className={`powered-by ${className}`.trim()}>
      <a href="https://www.knasoftware.com" target="_blank" rel="noreferrer">
        POWERED BY <strong>KNASOFTWARE.COM</strong>
      </a>
    </p>
  );
}

export function PageHeader({
  title,
  eyebrow,
  action,
  back,
  onBack,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  back?: boolean;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <div className="page-header__left">
        {back && (
          <button
            type="button"
            className="icon-button"
            aria-label="Quay lại"
            onClick={() => (onBack ? onBack() : navigate(-1))}
          >
            <ChevronLeft />
          </button>
        )}
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="empty-state">
      <span className="empty-state__icon">
        <Shirt />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </Card>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "Tìm kiếm",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={19} />
      <span className="sr-only">{placeholder}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export function Skeleton({ height = 80 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} />;
}
