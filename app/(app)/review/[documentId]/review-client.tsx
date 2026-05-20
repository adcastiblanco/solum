"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExtractedField } from "@/lib/types";
import { Spinner } from "@/components/spinner";
import { FieldCard, type FieldValue } from "./field-card";
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
  const [values, setValues] = useState<FieldState[]>(
    fields.map((f) => {
      const review = initialReviews[f.name];
      return {
        name: f.name,
        value: review?.approved ? review.finalValue : f.value,
      };
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
    const field = fields.find((f) => f.name === name);
    if (!field) return;
    const current = values.find((s) => s.name === name);
    if (!current) return;

    setApproving((prev) => ({ ...prev, [name]: true }));
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          extractionId,
          fieldName: name,
          originalValue: field.value,
          finalValue: current.value,
          confidence: field.confidence,
          bbox: field.bbox,
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
    const field = fields.find((f) => f.name === hovered);
    if (!field || !field.bbox) return null;
    return { bbox: field.bbox, confidence: field.confidence };
  }, [hovered, fields]);

  // Auto-approve when the user leaves a field. No-op when the field is empty
  // or already approved — so plain tab-through of approved fields doesn't
  // re-fire the API call.
  const handleAutoApprove = (name: string) => {
    if (!extractionId || approved[name] || approving[name]) return;
    const current = values.find((s) => s.name === name);
    if (!current) return;
    const v = current.value;
    const hasValue = Array.isArray(v)
      ? v.some((x) => x.trim().length > 0)
      : typeof v === "string" && v.trim().length > 0;
    if (!hasValue) return;
    void handleApprove(name);
  };

  const isReady = status === "done";

  const unapprovedFields = useMemo(
    () =>
      values.filter((s) => {
        if (approved[s.name]) return false;
        const v = s.value;
        if (v == null) return false;
        if (Array.isArray(v)) return v.some((x) => x.trim().length > 0);
        return v.trim().length > 0;
      }),
    [values, approved],
  );

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
            {Object.keys(approved).length} / {fields.length} approved
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
        style={{ gridTemplateColumns: "60fr 40fr", minHeight: "70vh" }}
      >
        <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
          <PdfViewer url={pdfUrl} highlight={highlight} />
        </section>

        <section className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
          <div className="border-b border-[var(--gray-100)] px-4 py-3">
            <h2 className="font-sans text-sm font-medium text-[var(--gray-900)]">
              Extracted fields
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
              {isReady
                ? "Edit any value — approves when you leave the field"
                : "Extraction not complete yet"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-2">
              {values.map((s) => (
                <FieldCard
                  key={s.name}
                  name={s.name}
                  value={s.value}
                  onChange={(next) => setFieldValue(s.name, next)}
                  onBlur={() => handleAutoApprove(s.name)}
                  isHovered={hovered === s.name}
                  onHoverChange={(h) => setHovered(h ? s.name : null)}
                  isApproved={!!approved[s.name]}
                  isApproving={!!approving[s.name]}
                  onApprove={() => handleApprove(s.name)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <p className="hidden" data-document-id={documentId} />
    </div>
  );
}
