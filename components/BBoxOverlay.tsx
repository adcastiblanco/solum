"use client";

import type { BBox } from "@/lib/types";

export function BBoxOverlay({
  bbox,
  confidence,
}: {
  bbox: BBox;
  confidence: number | null;
}) {
  const left = `${bbox.x * 100}%`;
  const top = `${bbox.y * 100}%`;
  const width = `${bbox.width * 100}%`;
  const height = `${bbox.height * 100}%`;

  const pct =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? `${Math.round(confidence * 100)}%`
      : null;

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{ left, top, width, height }}
    >
      <div
        className="h-full w-full rounded-[var(--r-sm)] border border-navy"
        style={{ backgroundColor: "rgba(30, 58, 95, 0.08)" }}
      />
      {pct != null && (
        <span
          className="absolute -top-5 right-0 rounded-[var(--r-sm)] bg-navy px-1.5 py-0.5 font-mono text-[10px] leading-none text-white"
        >
          {pct}
        </span>
      )}
    </div>
  );
}
