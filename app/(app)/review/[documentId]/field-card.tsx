"use client";

import { useEffect, useRef, useState } from "react";
import { FIELD_DEFS, type FieldDef, type FieldValue, type TableRow } from "@/lib/types";
import type { ReconciliationMeta } from "@/lib/reconciler";
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
  reconciliation,
  readOnly,
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
  reconciliation?: ReconciliationMeta;
  readOnly?: boolean;
}) {
  const def = FIELD_DEFS[name];
  if (!def) return null;
  const label = def.label;
  const isMissing = isValueMissing(def, value);

  // Highlight when the ensemble disagreed: warn (none) > info (single).
  // Approved fields take visual precedence — the reviewer already accepted.
  const disagreement = !isApproved && reconciliation?.agreement === "none";
  const singleBranch = !isApproved && reconciliation?.agreement === "single";

  const [reconcileOpen, setReconcileOpen] = useState(false);
  const reconcileChipVisible = !!(
    reconciliation &&
    !isApproved &&
    !readOnly &&
    reconciliation.agreement !== "all" &&
    reconciliation.agreement !== "majority" &&
    !(reconciliation.agreement === "single" && reconciliation.winner === "docai")
  );

  const cardClasses = [
    "rounded-[var(--r-md)] px-3 py-2 transition-colors",
    isApproved
      ? "border-2 border-[var(--green-700)] bg-[var(--green-50)]"
      : disagreement
        ? "border-2 border-[var(--amber-600,#d97706)] bg-[var(--amber-50,#fef3c7)]"
        : isHovered
          ? "border-2 border-navy bg-navy-light"
          : singleBranch
            ? "border-2 border-[var(--gray-300,#d1d5db)] bg-white"
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-sans text-xs text-[var(--gray-600)]">{label}</span>
            {reconcileChipVisible && reconciliation ? (
              <ReconciliationChip
                meta={reconciliation}
                open={reconcileOpen}
                onToggle={() => setReconcileOpen((v) => !v)}
              />
            ) : null}
          </div>
          <div className="-mt-0.5">
            <FieldEditor
              def={def}
              value={value}
              isMissing={isMissing}
              onChange={onChange}
              onBlur={onBlur}
              readOnly={readOnly}
            />
          </div>
        </div>
        {!readOnly && (
          <CheckButton
            isApproved={!!isApproved}
            isApproving={!!isApproving}
            disabled={isMissing && !isApproved}
            onClick={() => onApprove?.()}
          />
        )}
      </div>

      {/* Reconciliation popover: rendered INLINE below the card so it always
          fits the card width (no overflow off the panel edge regardless of
          how long the candidate values are). */}
      {reconcileOpen && reconciliation ? (
        <div className="mt-2 rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white p-2 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
              Pick a value
            </span>
            <button
              type="button"
              onClick={() => setReconcileOpen(false)}
              className="font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)] hover:text-navy"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <ReconciliationVotes
            meta={reconciliation}
            fieldType={def.type}
            currentValue={value}
            onPickVote={(v) => {
              onChange(v);
              setReconcileOpen(false);
            }}
          />
        </div>
      ) : null}
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
  readOnly,
}: {
  def: FieldDef;
  value: FieldValue;
  isMissing: boolean;
  onChange: (next: FieldValue) => void;
  onBlur?: () => void;
  readOnly?: boolean;
}) {
  const placeholder = def.extractable ? "Not detected" : "To be filled by reviewer";

  if (def.type === "longtext") {
    return (
      <AutoGrowTextarea
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        isMissing={isMissing}
        onChange={(v) => onChange(v.length === 0 ? null : v)}
        onBlur={onBlur}
        readOnly={readOnly}
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
        readOnly={readOnly}
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
        readOnly={readOnly}
      />
    );
  }

  // type === "text"
  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value.length === 0 ? null : e.target.value)}
      onBlur={onBlur}
      className={`w-full bg-transparent font-sans text-sm outline-none ${
        isMissing
          ? "text-[var(--gray-400)] placeholder:italic"
          : "text-[var(--gray-900)]"
      } ${readOnly ? "cursor-default" : ""}`}
    />
  );
}

function ListInput({
  items,
  placeholder,
  isMissing,
  onChange,
  onBlur,
  readOnly,
}: {
  items: string[];
  placeholder: string;
  isMissing: boolean;
  onChange: (next: string[]) => void;
  onBlur?: () => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    if (items.length === 0) {
      return (
        <span className="font-sans text-sm italic text-[var(--gray-400)]">—</span>
      );
    }
    return (
      <ul className="list-disc pl-4 font-sans text-sm text-[var(--gray-900)]">
        {items.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
    );
  }
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
  readOnly,
}: {
  def: FieldDef;
  rows: TableRow[];
  onChange: (next: TableRow[]) => void;
  onBlur?: () => void;
  readOnly?: boolean;
}) {
  const cols = def.columns ?? [];
  const emptyRow = (): TableRow => Object.fromEntries(cols.map((c) => [c.key, ""]));
  const displayRows = rows.length === 0 ? [emptyRow()] : rows;

  if (readOnly) {
    if (rows.length === 0) {
      return (
        <span className="font-sans text-sm italic text-[var(--gray-400)]">—</span>
      );
    }
    const gridColsRo = `repeat(${cols.length}, minmax(0, 1fr))`;
    return (
      <div className="mt-1 flex w-full flex-col gap-1">
        <div
          className="grid gap-1 px-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--gray-400)]"
          style={{ gridTemplateColumns: gridColsRo }}
        >
          {cols.map((c) => (
            <span key={c.key} className="truncate">{c.label}</span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid w-full gap-1 px-1.5 font-sans text-xs text-[var(--gray-900)]"
            style={{ gridTemplateColumns: gridColsRo }}
          >
            {cols.map((c) => (
              <span key={c.key} className="truncate">
                {row[c.key] || "—"}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // minmax(0, 1fr) (instead of plain 1fr) lets each column shrink below its
  // intrinsic content width — without it the input's text content forces the
  // column to grow, pushing the last column off-screen.
  const gridCols = `repeat(${cols.length}, minmax(0, 1fr))`;

  return (
    <div className="mt-1 flex w-full flex-col gap-1.5">
      <div
        className="grid gap-1 px-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--gray-400)]"
        style={{ gridTemplateColumns: gridCols }}
      >
        {cols.map((c) => (
          <span key={c.key} className="truncate">{c.label}</span>
        ))}
      </div>
      {displayRows.map((row, i) => (
        <div
          key={i}
          className="grid w-full gap-1"
          style={{ gridTemplateColumns: gridCols }}
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
                onChange(next.filter((r) => Object.values(r).some((v) => v.trim() !== "")));
              }}
              onBlur={onBlur}
              className="w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--gray-100)] bg-white px-1.5 py-1 font-sans text-xs text-[var(--gray-900)] outline-none focus:border-navy"
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

// Chip-only: the small badge next to the label. The popover is rendered
// at the FieldCard level (inline, below the card) so it can use the full
// card width without overflowing the panel — see the FieldCard JSX.
function ReconciliationChip({
  meta,
  open,
  onToggle,
}: {
  meta: ReconciliationMeta;
  open: boolean;
  onToggle: () => void;
}) {
  const isWarn = meta.agreement === "none";
  const label = isWarn ? "Models disagree" : "Suggested";
  const chipClasses = isWarn
    ? "border-[var(--amber-600,#d97706)] bg-[var(--amber-50,#fef3c7)] text-[var(--amber-700,#b45309)]"
    : "border-[var(--gray-300,#d1d5db)] bg-white text-[var(--gray-600)]";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide transition-colors ${chipClasses}`}
      aria-expanded={open}
    >
      <span aria-hidden="true">{isWarn ? "⚠" : "·"}</span>
      <span>{label}</span>
    </button>
  );
}

function ReconciliationVotes({
  meta,
  fieldType,
  currentValue,
  onPickVote,
}: {
  meta: ReconciliationMeta;
  fieldType: FieldDef["type"];
  currentValue: FieldValue;
  onPickVote: (next: FieldValue) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {meta.votes.map((v) => {
        const empty = v.value === null || v.value === undefined;
        const isActive = !empty && valuesEqualForPick(v.value, currentValue, fieldType);

        const rowClasses = empty
          ? "border border-transparent bg-[var(--gray-50)] opacity-60"
          : isActive
            ? "border border-[var(--green-700)] bg-[var(--green-50)] cursor-pointer"
            : "border border-[var(--gray-200)] bg-white hover:border-navy hover:bg-navy-light cursor-pointer";

        return (
          <button
            key={v.branch}
            type="button"
            onClick={() => {
              if (empty) return;
              onPickVote(v.value as FieldValue);
            }}
            disabled={empty}
            className={`flex w-full flex-col items-stretch gap-0.5 rounded-[var(--r-sm)] px-1.5 py-1 text-left text-[11px] transition-colors ${rowClasses}`}
            aria-pressed={isActive}
          >
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-wide text-[var(--gray-600)]">
              <span>{v.branch}</span>
              <span>
                {isActive
                  ? "selected"
                  : empty
                    ? "no value"
                    : "use this"}
                {v.confidence != null
                  ? ` · ${(v.confidence * 100).toFixed(0)}%`
                  : ""}
              </span>
            </div>
            <div className="break-words whitespace-pre-wrap font-sans text-[var(--gray-900)]">
              {formatVoteValue(v.value, fieldType)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function valuesEqualForPick(
  a: unknown,
  b: FieldValue,
  fieldType: FieldDef["type"],
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (fieldType === "text" || fieldType === "longtext") {
    return String(a).trim() === String(b).trim();
  }
  // Lists & tables: compare via JSON. Reasonable for short structures.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function formatVoteValue(value: unknown, fieldType: FieldDef["type"]): string {
  if (value === null || value === undefined) return "—";
  if (fieldType === "table" && Array.isArray(value)) {
    return `${value.length} row${value.length === 1 ? "" : "s"}`;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// Textarea that resizes itself to fit content on every value change. Lets
// long extracted narratives (clinical history, plan, etc.) render in full
// without forcing the reviewer to drag a resize handle.
function AutoGrowTextarea({
  value,
  placeholder,
  isMissing,
  onChange,
  onBlur,
  readOnly,
}: {
  value: string;
  placeholder: string;
  isMissing: boolean;
  onChange: (v: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  if (readOnly) {
    if (!value || value.trim().length === 0) {
      return (
        <span className="font-sans text-sm italic text-[var(--gray-400)]">—</span>
      );
    }
    return (
      <p className="whitespace-pre-wrap font-sans text-sm text-[var(--gray-900)]">
        {value}
      </p>
    );
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={`w-full resize-none overflow-hidden bg-transparent font-sans text-sm outline-none ${
        isMissing
          ? "text-[var(--gray-400)] placeholder:italic"
          : "text-[var(--gray-900)]"
      }`}
    />
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
