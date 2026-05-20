"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Spinner } from "@/components/spinner";

export type DocumentRow = {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "done" | "error" | "approved";
  phase: number | null;
  error_message: string | null;
  created_at: string;
};

const PHASE_LABELS = ["Queued", "OCR", "Extracting", "Reconciling"] as const;
const PHASE_COUNT = 3;

function PhaseRing({ phase }: { phase: number }) {
  // SVG ring split into 3 wedges (120° each). Wedge i corresponds to phase i+1.
  //   completed (i+1 < phase) → solid navy
  //   active    (i+1 === phase) → navy + soft pulse (the phase running now)
  //   pending   (i+1 > phase) → gray
  // The fill transition on every wedge gives a smooth gray→navy fade when
  // the next phase begins on the next polling tick. Phase=4 isn't used here —
  // the row flips to status='done' and renders the green DONE badge instead.
  const p = Math.max(0, Math.min(PHASE_COUNT, phase));
  const cx = 9;
  const cy = 9;
  const r = 6.5;
  const FILL = "var(--navy)";
  const EMPTY = "var(--gray-200)";
  // Three 120° wedges starting at the top (−90°). Pre-computed endpoints.
  const wedges = Array.from({ length: PHASE_COUNT }, (_, i) => {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / PHASE_COUNT;
    const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / PHASE_COUNT;
    return {
      x1: cx + r * Math.cos(a0),
      y1: cy + r * Math.sin(a0),
      x2: cx + r * Math.cos(a1),
      y2: cy + r * Math.sin(a1),
    };
  });
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      aria-hidden
      className="shrink-0"
    >
      {wedges.map((s, i) => {
        const phaseIdx = i + 1;
        const isActive = phaseIdx === p;
        const isFilled = phaseIdx <= p;
        return (
          <path
            key={i}
            className={`phase-quadrant${isActive ? " is-active" : ""}`}
            d={`M ${cx} ${cy} L ${s.x1} ${s.y1} A ${r} ${r} 0 0 1 ${s.x2} ${s.y2} Z`}
            fill={isFilled ? FILL : EMPTY}
            stroke="white"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}

function StatusBadge({
  status,
  phase,
  errorMessage,
}: {
  status: DocumentRow["status"];
  phase: number | null;
  errorMessage: string | null;
}) {
  const base =
    "inline-flex items-center rounded-[var(--r-sm)] px-2 py-0.5 font-mono text-xs uppercase tracking-wide";

  if (status === "error") {
    return (
      <span
        className={`${base} border border-[var(--gray-200)] bg-white text-navy cursor-help`}
        title={errorMessage ?? "Extraction failed"}
      >
        Error
      </span>
    );
  }

  if (status === "approved") {
    return (
      <span
        className={`${base} bg-[var(--green-50)] text-[var(--green-700)] border border-[var(--green-700)]/30`}
      >
        Approved
      </span>
    );
  }

  if (status === "processing" || status === "pending") {
    const p = Math.max(0, Math.min(PHASE_COUNT, phase ?? 0));
    const label = PHASE_LABELS[p];
    return (
      <span
        className={`${base} bg-navy-light text-navy gap-1.5`}
        title={`Phase ${p}/${PHASE_COUNT} — ${label}`}
      >
        <PhaseRing phase={p} />
        <span>{p}/{PHASE_COUNT} {label}</span>
      </span>
    );
  }

  return (
    <span className={`${base} bg-navy-light text-navy`}>{status}</span>
  );
}

function RetryButton({
  documentId,
  onRetry,
}: {
  documentId: string;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
    } catch {
      // surfaces back through the documents row on next poll
    } finally {
      onRetry();
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-navy transition-all duration-150 hover:bg-navy-light disabled:opacity-50"
    >
      {busy && <Spinner size={11} />}
      <span>{busy ? "Retrying" : "Retry"}</span>
    </button>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  // Fixed locale + UTC to keep server and client output identical and avoid
  // React hydration mismatches (error #418). The previous undefined locale
  // produced different strings between Node SSR and the user's browser.
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

export function DocumentList({
  documents,
  onRetry,
}: {
  documents: DocumentRow[];
  onRetry: () => void;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (documents.length === 0) {
    return (
      <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--gray-200)] bg-white px-8 py-16 text-center">
        <p className="font-serif italic text-2xl text-navy mb-2">
          No documents yet
        </p>
        <p className="font-sans text-sm text-[var(--gray-600)] max-w-md mx-auto">
          Upload a PDF using the button above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
      <table className="w-full text-left">
        <thead className="bg-[var(--gray-50)] text-[var(--gray-600)]">
          <tr>
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide">
              File
            </th>
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide w-[220px]">
              Status
            </th>
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide">
              Uploaded
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const clickable = doc.status === "done" || doc.status === "approved";
            const isPending = pendingId === doc.id;
            const navigate = () => {
              if (!clickable || isPending) return;
              setPendingId(doc.id);
              startTransition(() => {
                router.push(`/review/${doc.id}`);
              });
            };
            return (
              <tr
                key={doc.id}
                onClick={navigate}
                role={clickable ? "link" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (!clickable) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate();
                  }
                }}
                className={`border-t border-[var(--gray-100)] transition-colors ${
                  clickable
                    ? "cursor-pointer hover:bg-navy-light"
                    : "hover:bg-[var(--gray-50)]"
                } ${isPending ? "bg-navy-light" : ""}`}
              >
                <td className="px-4 py-3 font-sans text-sm text-navy">
                  {clickable ? (
                    <Link
                      href={`/review/${doc.id}`}
                      prefetch
                      onClick={(e) => {
                        // Let cmd/ctrl/middle-click open in a new tab. For a
                        // plain click we use the row-level transition above.
                        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                        e.preventDefault();
                        navigate();
                      }}
                      className="inline-flex items-center gap-2 text-navy hover:underline"
                    >
                      {isPending && <Spinner size={12} />}
                      {doc.file_name}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {isPending && <Spinner size={12} />}
                      {doc.file_name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 w-[220px]">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={doc.status}
                      phase={doc.phase}
                      errorMessage={doc.error_message}
                    />
                    {doc.status === "error" && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <RetryButton documentId={doc.id} onRetry={onRetry} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--gray-600)]">
                  {formatTimestamp(doc.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
