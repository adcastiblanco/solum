"use client";

import { ARRAY_FIELDS, FIELD_LABELS } from "@/lib/types";

export type FieldValue = string | string[] | null;

export function FieldCard({
  name,
  value,
  onChange,
  onHoverChange,
  isHovered,
}: {
  name: string;
  value: FieldValue;
  onChange: (next: FieldValue) => void;
  onHoverChange?: (hovered: boolean) => void;
  isHovered?: boolean;
}) {
  const label = FIELD_LABELS[name] ?? name;
  const isArray = ARRAY_FIELDS.has(name);
  const isMissing =
    value == null ||
    (Array.isArray(value) ? value.length === 0 : value.trim() === "");

  const cardClasses = [
    "rounded-[var(--r-md)] border px-4 py-3 transition-colors",
    isHovered
      ? "border-navy bg-navy-light"
      : isMissing
        ? "border-[var(--gray-200)] bg-[var(--gray-50)]"
        : "border-[var(--gray-200)] bg-white",
  ].join(" ");

  return (
    <div
      className={cardClasses}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-sans text-xs text-[var(--gray-600)]">
          {label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--gray-400)]">
          {name}
        </span>
      </div>

      {isArray ? (
        <ArrayInput
          values={Array.isArray(value) ? value : value ? [value] : []}
          isMissing={isMissing}
          onChange={(next) => onChange(next.length === 0 ? null : next)}
        />
      ) : (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder={isMissing ? "Not detected" : ""}
          onChange={(e) =>
            onChange(e.target.value.length === 0 ? null : e.target.value)
          }
          className={`w-full bg-transparent font-sans text-sm outline-none ${
            isMissing
              ? "text-[var(--gray-400)] placeholder:italic"
              : "text-[var(--gray-900)]"
          }`}
        />
      )}
    </div>
  );
}

function ArrayInput({
  values,
  isMissing,
  onChange,
}: {
  values: string[];
  isMissing: boolean;
  onChange: (next: string[]) => void;
}) {
  if (isMissing) {
    return (
      <input
        type="text"
        value=""
        placeholder="Not detected"
        onChange={(e) =>
          onChange(e.target.value.length === 0 ? [] : [e.target.value])
        }
        className="w-full bg-transparent font-sans text-sm italic text-[var(--gray-400)] outline-none placeholder:italic"
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {values.map((v, i) => (
        <input
          key={i}
          type="text"
          value={v}
          onChange={(e) => {
            const next = [...values];
            next[i] = e.target.value;
            onChange(next.filter((s) => s.length > 0));
          }}
          className="w-full bg-transparent font-sans text-sm text-[var(--gray-900)] outline-none"
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ""])}
        className="self-start font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)] hover:text-navy"
      >
        + add
      </button>
    </div>
  );
}
