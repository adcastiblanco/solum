"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FIELD_NAMES, FORM_SECTIONS, type SectionDef } from "@/lib/types";
import type { ExtractedField, FieldValue } from "@/lib/types";
import type { ReconciliationMeta } from "@/lib/reconciler";
import { Spinner } from "@/components/spinner";
import { FieldCard } from "./field-card";
import type { Highlight } from "./pdf-viewer";

const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-sans text-sm text-[var(--gray-600)]">
      Loading viewer…
    </div>
  ),
});

export type InitialReview = {
  finalValue: FieldValue;
  approved: boolean;
};

type FieldState = {
  name: string;
  value: FieldValue;
};

function isValueEmpty(value: FieldValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    if (typeof value[0] === "string") {
      return !(value as string[]).some((s) => s.trim().length > 0);
    }
    return !(value as Array<Record<string, string>>).some((row) =>
      Object.values(row).some((s) => (s ?? "").trim().length > 0),
    );
  }
  return true;
}

export function ReviewClient({
  documentId,
  extractionId,
  fileName,
  status,
  pdfUrl,
  fields,
  initialReviews,
  reconciliation,
}: {
  documentId: string;
  extractionId: string | null;
  fileName: string;
  status: string;
  pdfUrl: string | null;
  fields: ExtractedField[];
  initialReviews: Record<string, InitialReview>;
  reconciliation: Record<string, ReconciliationMeta>;
}) {
  const fieldsByName = useMemo(
    () => new Map(fields.map((f) => [f.name, f])),
    [fields],
  );

  const [values, setValues] = useState<FieldState[]>(() =>
    FIELD_NAMES.map((name) => {
      const review = initialReviews[name];
      const extracted = fieldsByName.get(name);
      const initial = review?.approved ? review.finalValue : (extracted?.value ?? null);
      return { name, value: initial };
    }),
  );

  const [approved, setApproved] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const [name, r] of Object.entries(initialReviews)) {
      if (r.approved) init[name] = true;
    }
    return init;
  });
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [bulkApproving, setBulkApproving] = useState(false);

  const currentSection: SectionDef = FORM_SECTIONS[sectionIndex];

  const setFieldValue = (name: string, value: FieldValue) => {
    setValues((prev) =>
      prev.map((s) => (s.name === name ? { ...s, value } : s)),
    );
    setApproved((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleApprove = async (name: string) => {
    if (!extractionId) return;
    const current = values.find((s) => s.name === name);
    if (!current) return;
    const extracted = fieldsByName.get(name);

    setApproving((prev) => ({ ...prev, [name]: true }));
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          extractionId,
          fieldName: name,
          originalValue: extracted?.value ?? null,
          finalValue: current.value,
          confidence: extracted?.confidence ?? null,
          bbox: extracted?.bbox ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Approve failed:", body);
        return;
      }
      setApproved((prev) => ({ ...prev, [name]: true }));
    } catch (err) {
      console.error("Approve failed:", err);
    } finally {
      setApproving((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const highlight: Highlight | null = useMemo(() => {
    if (!hovered) return null;
    const field = fieldsByName.get(hovered);
    if (!field) return null;
    // Prefer the multi-bbox list (longtext / list / table grounding). Fall
    // back to the single union bbox for fields extracted before bboxes was
    // populated.
    const bboxes =
      field.bboxes && field.bboxes.length > 0
        ? field.bboxes
        : field.bbox
          ? [field.bbox]
          : [];
    if (bboxes.length === 0) return null;
    return { bboxes, confidence: field.confidence };
  }, [hovered, fieldsByName]);

  const handleAutoApprove = (name: string) => {
    if (!extractionId || approved[name] || approving[name]) return;
    const current = values.find((s) => s.name === name);
    if (!current) return;
    if (isValueEmpty(current.value)) return;
    void handleApprove(name);
  };

  const isReady = status === "done";
  const valueByName = useMemo(() => new Map(values.map((s) => [s.name, s.value])), [values]);

  // Per-section progress: approved / total — used in the chip nav and in
  // the "Approve section" button label.
  const sectionStats = useMemo(() => {
    return FORM_SECTIONS.map((section) => {
      const fieldNames = section.fields.map((f) => f.name);
      const approvedCount = fieldNames.filter((n) => approved[n]).length;
      const unapprovedNonEmpty = fieldNames.filter((n) => {
        if (approved[n]) return false;
        return !isValueEmpty(valueByName.get(n) ?? null);
      });
      return {
        total: fieldNames.length,
        approved: approvedCount,
        pendingNames: unapprovedNonEmpty,
      };
    });
  }, [approved, valueByName]);

  const totalApproved = sectionStats.reduce((s, x) => s + x.approved, 0);
  const totalFields = FIELD_NAMES.length;
  const currentStats = sectionStats[sectionIndex];

  const handleApproveSection = async () => {
    if (!extractionId || bulkApproving) return;
    const names = currentStats.pendingNames;
    if (names.length === 0) return;
    setBulkApproving(true);
    try {
      // Fire all section approvals in parallel — the /api/review endpoint
      // handles each field independently, so there's no need to serialize.
      await Promise.all(names.map((n) => handleApprove(n)));
    } finally {
      setBulkApproving(false);
    }
  };

  const goPrev = () => setSectionIndex((i) => Math.max(0, i - 1));
  const goNext = () => setSectionIndex((i) => Math.min(FORM_SECTIONS.length - 1, i + 1));
  const isFirst = sectionIndex === 0;
  const isLast = sectionIndex === FORM_SECTIONS.length - 1;

  return (
    // h-[calc(100vh-3.25rem)] = viewport minus the nav bar (py-3 ≈ 52px).
    // Outer panel does NOT scroll — only the form's section body does, so the
    // PDF column stays anchored.
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 pt-3 pb-4"
      style={{ height: "calc(100vh - 3.25rem)" }}
    >
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="font-mono text-xs uppercase tracking-wide text-[var(--gray-600)] hover:text-navy"
        >
          ← Dashboard
        </Link>
      </div>

      <div
        className="grid min-h-0 flex-1 gap-4 overflow-hidden rounded-[var(--r-lg)]"
        style={{ gridTemplateColumns: "55fr 45fr" }}
      >
        <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
          <PdfViewer url={pdfUrl} highlight={highlight} fileName={fileName} />
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
          {/* Top: counter + per-section approve button */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--gray-100)] px-4 py-3">
            <div>
              <h2 className="font-sans text-sm font-medium text-[var(--gray-900)]">
                Service Request Form
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
                {totalApproved} / {totalFields} approved
              </p>
            </div>
            <button
              type="button"
              onClick={handleApproveSection}
              disabled={
                !isReady ||
                !extractionId ||
                bulkApproving ||
                currentStats.pendingNames.length === 0
              }
              className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-navy px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-white transition-all duration-150 hover:opacity-90 disabled:opacity-40"
            >
              {bulkApproving && <Spinner size={12} />}
              <span>
                {bulkApproving
                  ? "Approving…"
                  : currentStats.pendingNames.length === 0
                    ? "Section approved"
                    : `Approve section (${currentStats.pendingNames.length})`}
              </span>
            </button>
          </div>

          {/* Section nav chips */}
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--gray-100)] px-4 py-2.5">
            {FORM_SECTIONS.map((section, i) => {
              const st = sectionStats[i];
              const isActive = i === sectionIndex;
              const complete = st.total > 0 && st.approved === st.total;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setSectionIndex(i)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                    isActive
                      ? "border-navy bg-navy text-white"
                      : complete
                        ? "border-[var(--green-700)] bg-[var(--green-50)] text-[var(--green-700)]"
                        : "border-[var(--gray-200)] bg-white text-[var(--gray-600)] hover:border-navy hover:text-navy"
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span>{shortSectionLabel(section)}</span>
                  <span className="ml-1.5 opacity-70">
                    {st.approved}/{st.total}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Current section title */}
          <div className="shrink-0 px-4 pt-3 pb-1">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-navy">
              {currentSection.title}
            </h3>
          </div>

          {/* Scrolling body for this section's fields */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            <div className="flex flex-col gap-2">
              {currentSection.fields.map((def) => (
                <FieldCard
                  key={def.name}
                  name={def.name}
                  value={valueByName.get(def.name) ?? null}
                  onChange={(next) => setFieldValue(def.name, next)}
                  onBlur={() => handleAutoApprove(def.name)}
                  isHovered={hovered === def.name}
                  onHoverChange={(h) => setHovered(h ? def.name : null)}
                  isApproved={!!approved[def.name]}
                  isApproving={!!approving[def.name]}
                  onApprove={() => handleApprove(def.name)}
                  reconciliation={reconciliation[def.name]}
                />
              ))}
            </div>
          </div>

          {/* Prev / Next pagination */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--gray-100)] px-4 py-2.5">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-[var(--gray-600)] hover:text-navy disabled:opacity-30 disabled:hover:text-[var(--gray-600)]"
            >
              ← Prev
            </button>
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--gray-400)]">
              {sectionIndex + 1} / {FORM_SECTIONS.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={isLast}
              className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-[var(--gray-600)] hover:text-navy disabled:opacity-30 disabled:hover:text-[var(--gray-600)]"
            >
              Next →
            </button>
          </div>
        </section>
      </div>

      <p className="hidden" data-document-id={documentId} />
    </div>
  );
}

// Derive a short label for the section chip. The full title is "Section A —
// Member Information" — we display just "A" (or the header label "Header").
function shortSectionLabel(section: SectionDef): string {
  const m = section.title.match(/Section\s+([A-Z])/);
  if (m) return m[1];
  if (section.key === "header") return "Header";
  return section.title;
}
