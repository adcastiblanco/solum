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

type FieldState = {
  name: string;
  value: FieldValue;
};

export function ReviewClient({
  documentId,
  fileName,
  status,
  pdfUrl,
  fields,
}: {
  documentId: string;
  fileName: string;
  status: string;
  pdfUrl: string | null;
  fields: ExtractedField[];
}) {
  const [values, setValues] = useState<FieldState[]>(
    fields.map((f) => ({ name: f.name, value: f.value })),
  );
  const [hovered, setHovered] = useState<string | null>(null);

  const setFieldValue = (name: string, value: FieldValue) => {
    setValues((prev) =>
      prev.map((s) => (s.name === name ? { ...s, value } : s)),
    );
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
                ? "Edit any value inline"
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
