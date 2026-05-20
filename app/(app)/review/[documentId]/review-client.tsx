"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExtractedField } from "@/lib/types";
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

  const isReady = status === "done";

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
        <span className="font-mono text-xs uppercase tracking-wide text-[var(--gray-600)]">
          {status}
        </span>
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
                ? "Edit any value inline, then approve"
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
