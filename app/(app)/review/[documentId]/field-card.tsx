"use client";

import { FIELD_DEFS, type FieldDef, type FieldValue, type TableRow } from "@/lib/types";
import { Spinner } from "@/components/spinner";

export type { FieldValue } from "@/lib/types";

export function FieldCard({
  name,
  value,
  onChange,
  onBlur,
  onHoverChange,
  isHovered,
  isApproved,
  onApprove,
  isApproving,
}: {
  name: string;
  value: FieldValue;
  onChange: (next: FieldValue) => void;
  onBlur?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  isHovered?: boolean;
  isApproved?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
}) {
  const def = FIELD_DEFS[name];
  if (!def) return null;
  const label = def.label;
  const isMissing = isValueMissing(def, value);

  const cardClasses = [
    "rounded-[var(--r-md)] px-3 py-2 transition-colors",
    isApproved
      ? "border-2 border-[var(--green-700)] bg-[var(--green-50)]"
      : isHovered
        ? "border-2 border-navy bg-navy-light"
        : isMissing
          ? "border-2 border-[var(--gray-200)] bg-[var(--gray-50)]"
          : "border-2 border-[var(--gray-200)] bg-white",
  ].join(" ");

  return (
    <div
      className={cardClasses}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-sans text-xs text-[var(--gray-600)]">{label}</span>
        <CheckButton
          isApproved={!!isApproved}
          isApproving={!!isApproving}
          disabled={isMissing && !isApproved}
          onClick={() => onApprove?.()}
        />
      </div>

      <div className="-mt-0.5">
        <FieldEditor
          def={def}
          value={value}
          isMissing={isMissing}
          onChange={onChange}
          onBlur={onBlur}
        />
      </div>
    </div>
  );
}

function isValueMissing(def: FieldDef, value: FieldValue): boolean {
  if (value === null || value === undefined) return true;
  if (def.type === "text" || def.type === "longtext") {
    return typeof value !== "string" || value.trim() === "";
  }
  if (def.type === "list") {
    return !Array.isArray(value) || value.length === 0;
  }
  if (def.type === "table") {
    return !Array.isArray(value) || value.length === 0;
  }
  return true;
}

function FieldEditor({
  def,
  value,
  isMissing,
  onChange,
  onBlur,
}: {
  def: FieldDef;
  value: FieldValue;
  isMissing: boolean;
  onChange: (next: FieldValue) => void;
  onBlur?: () => void;
}) {
  const placeholder = def.extractable ? "Not detected" : "To be filled by reviewer";

  if (def.type === "longtext") {
    return (
      <textarea
        rows={3}
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.length === 0 ? null : e.target.value)}
        onBlur={onBlur}
        className={`w-full resize-y bg-transparent font-sans text-sm outline-none ${
          isMissing
            ? "text-[var(--gray-400)] placeholder:italic"
            : "text-[var(--gray-900)]"
        }`}
      />
    );
  }

  if (def.type === "list") {
    const items = Array.isArray(value) && typeof value[0] !== "object"
      ? (value as string[])
      : [];
    return (
      <ListInput
        items={items}
        placeholder={placeholder}
        isMissing={isMissing}
        onChange={(next) => onChange(next.length === 0 ? null : next)}
        onBlur={onBlur}
      />
    );
  }

  if (def.type === "table") {
    const rows = Array.isArray(value) && typeof value[0] === "object"
      ? (value as TableRow[])
      : [];
    return (
      <TableInput
        def={def}
        rows={rows}
        onChange={(next) => onChange(next.length === 0 ? null : next)}
        onBlur={onBlur}
      />
    );
  }

  // type === "text"
  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.length === 0 ? null : e.target.value)}
      onBlur={onBlur}
      className={`w-full bg-transparent font-sans text-sm outline-none ${
        isMissing
          ? "text-[var(--gray-400)] placeholder:italic"
          : "text-[var(--gray-900)]"
      }`}
    />
  );
}

function ListInput({
  items,
  placeholder,
  isMissing,
  onChange,
  onBlur,
}: {
  items: string[];
  placeholder: string;
  isMissing: boolean;
  onChange: (next: string[]) => void;
  onBlur?: () => void;
}) {
  if (isMissing) {
    return (
      <input
        type="text"
        value=""
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.length === 0 ? [] : [e.target.value])}
        onBlur={onBlur}
        className="w-full bg-transparent font-sans text-sm italic text-[var(--gray-400)] outline-none placeholder:italic"
      />
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map((v, i) => (
        <input
          key={i}
          type="text"
          value={v}
          onChange={(e) => {
            const next = [...items];
            next[i] = e.target.value;
            onChange(next.filter((s) => s.length > 0));
          }}
          onBlur={onBlur}
          className="w-full bg-transparent font-sans text-sm text-[var(--gray-900)] outline-none"
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="self-start font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)] hover:text-navy"
      >
        + add
      </button>
    </div>
  );
}

function TableInput({
  def,
  rows,
  onChange,
  onBlur,
}: {
  def: FieldDef;
  rows: TableRow[];
  onChange: (next: TableRow[]) => void;
  onBlur?: () => void;
}) {
  const cols = def.columns ?? [];
  const emptyRow = (): TableRow => Object.fromEntries(cols.map((c) => [c.key, ""]));
  const displayRows = rows.length === 0 ? [emptyRow()] : rows;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <div
        className="grid gap-1 font-mono text-[10px] uppercase tracking-wide text-[var(--gray-400)]"
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
      >
        {cols.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
      </div>
      {displayRows.map((row, i) => (
        <div
          key={i}
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
        >
          {cols.map((c) => (
            <input
              key={c.key}
              type="text"
              value={row[c.key] ?? ""}
              placeholder={c.label}
              onChange={(e) => {
                const next = displayRows.map((r, j) =>
                  j === i ? { ...r, [c.key]: e.target.value } : r,
                );
                // Drop fully-empty rows on blur via the next handler
                onChange(next.filter((r) => Object.values(r).some((v) => v.trim() !== "")));
              }}
              onBlur={onBlur}
              className="rounded-[var(--r-sm)] border border-[var(--gray-100)] bg-white px-1.5 py-1 font-sans text-xs text-[var(--gray-900)] outline-none focus:border-navy"
            />
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyRow()])}
        className="self-start font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)] hover:text-navy"
      >
        + add row
      </button>
    </div>
  );
}

function CheckButton({
  isApproved,
  isApproving,
  disabled,
  onClick,
}: {
  isApproved: boolean;
  isApproving: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const base =
    "group inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-150 disabled:opacity-50";

  if (isApproving) {
    return (
      <button
        type="button"
        aria-label="Approving"
        disabled
        className={`${base} border-[var(--green-700)] bg-white text-[var(--green-700)]`}
      >
        <Spinner size={12} />
      </button>
    );
  }
  if (isApproved) {
    return (
      <button
        type="button"
        aria-label="Approved"
        onClick={onClick}
        className={`${base} border-[var(--green-700)] bg-[var(--green-700)] text-white`}
      >
        <CheckIcon />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label="Approve"
      onClick={onClick}
      disabled={disabled}
      className={`${base} border-[var(--gray-200)] bg-white text-[var(--gray-400)] hover:border-[var(--green-700)] hover:text-[var(--green-700)]`}
    >
      <CheckIcon />
    </button>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
