"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FIELD_NAMES, FIELD_DEFS, FORM_SECTIONS } from "@/lib/types";
import type { ExtractedField, FieldValue } from "@/lib/types";
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
}: {
  documentId: string;
  extractionId: string | null;
  fileName: string;
  status: string;
  pdfUrl: string | null;
  fields: ExtractedField[];
  initialReviews: Record<string, InitialReview>;
}) {
  // Build a value map covering ALL form fields (including non-extractable ones).
  // Extractable fields get pre-filled from `fields`; the rest start null.
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

  const setFieldValue = (name: string, value: FieldValue) => {
    setValues((prev) =>
      prev.map((s) => (s.name === name ? { ...s, value } : s)),
    );
    // Editing a value un-marks approval until user re-confirms.
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
    if (!field || !field.bbox) return null;
    return { bbox: field.bbox, confidence: field.confidence };
  }, [hovered, fieldsByName]);

  const handleAutoApprove = (name: string) => {
    if (!extractionId || approved[name] || approving[name]) return;
    const current = values.find((s) => s.name === name);
    if (!current) return;
    if (isValueEmpty(current.value)) return;
    void handleApprove(name);
  };

  const isReady = status === "done";

  const unapprovedFields = useMemo(
    () =>
      values.filter((s) => {
        if (approved[s.name]) return false;
        return !isValueEmpty(s.value);
      }),
    [values, approved],
  );

  const totalFields = FIELD_NAMES.length;
  const [bulkApproving, setBulkApproving] = useState(false);

  const handleApproveAll = async () => {
    if (!extractionId || bulkApproving) return;
    setBulkApproving(true);
    try {
      for (const s of unapprovedFields) {
        // eslint-disable-next-line no-await-in-loop
        await handleApprove(s.name);
      }
    } finally {
      setBulkApproving(false);
    }
  };

  const valueByName = new Map(values.map((s) => [s.name, s.value]));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-6">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-wide text-[var(--gray-600)] hover:text-navy"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 font-serif text-3xl italic text-navy">
            {fileName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-wide text-[var(--gray-600)]">
            {Object.keys(approved).length} / {totalFields} approved
          </span>
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={
              !isReady ||
              !extractionId ||
              bulkApproving ||
              unapprovedFields.length === 0
            }
            className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-navy px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-white transition-all duration-150 hover:opacity-90 disabled:opacity-40"
          >
            {bulkApproving && <Spinner size={12} />}
            <span>
              {bulkApproving
                ? "Approving…"
                : unapprovedFields.length === 0
                  ? "All approved"
                  : `Approve all (${unapprovedFields.length})`}
            </span>
          </button>
        </div>
      </header>

      <div
        className="grid flex-1 gap-4 overflow-hidden rounded-[var(--r-lg)]"
        style={{ gridTemplateColumns: "55fr 45fr", minHeight: "70vh" }}
      >
        <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
          <PdfViewer url={pdfUrl} highlight={highlight} />
        </section>

        <section className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
          <div className="border-b border-[var(--gray-100)] px-4 py-3">
            <h2 className="font-sans text-sm font-medium text-[var(--gray-900)]">
              Service Request Form
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
              {isReady
                ? "Edit any value — approves when you leave the field"
                : "Extraction not complete yet"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-5">
              {FORM_SECTIONS.map((section) => (
                <div key={section.key} className="flex flex-col gap-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-navy">
                    {section.title}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {section.fields.map((def) => (
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
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <p className="hidden" data-document-id={documentId} />
    </div>
  );
}
