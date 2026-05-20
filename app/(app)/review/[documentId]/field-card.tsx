"use client";

import { ARRAY_FIELDS, FIELD_LABELS } from "@/lib/types";
import { Spinner } from "@/components/spinner";

export type FieldValue = string | string[] | null;

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
  const label = FIELD_LABELS[name] ?? name;
  const isArray = ARRAY_FIELDS.has(name);
  const isMissing =
    value == null ||
    (Array.isArray(value) ? value.length === 0 : value.trim() === "");

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
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-xs text-[var(--gray-600)]">
          {label}
        </span>
        <CheckButton
          isApproved={!!isApproved}
          isApproving={!!isApproving}
          disabled={isMissing && !isApproved}
          onClick={() => onApprove?.()}
        />
      </div>

      {isArray ? (
        <ArrayInput
          values={Array.isArray(value) ? value : value ? [value] : []}
          isMissing={isMissing}
          onChange={(next) => onChange(next.length === 0 ? null : next)}
          onBlur={onBlur}
        />
      ) : (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder={isMissing ? "Not detected" : ""}
          onChange={(e) =>
            onChange(e.target.value.length === 0 ? null : e.target.value)
          }
          onBlur={onBlur}
          className={`-mt-0.5 w-full bg-transparent font-sans text-sm outline-none ${
            isMissing
              ? "text-[var(--gray-400)] placeholder:italic"
              : "text-[var(--gray-900)]"
          }`}
        />
      )}
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

function ArrayInput({
  values,
  isMissing,
  onChange,
  onBlur,
}: {
  values: string[];
  isMissing: boolean;
  onChange: (next: string[]) => void;
  onBlur?: () => void;
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
        onBlur={onBlur}
        className="-mt-0.5 w-full bg-transparent font-sans text-sm italic text-[var(--gray-400)] outline-none placeholder:italic"
      />
    );
  }

  return (
    <div className="-mt-0.5 flex flex-col gap-1">
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
          onBlur={onBlur}
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
