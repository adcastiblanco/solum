"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { BBoxOverlay } from "@/components/BBoxOverlay";
import type { BBox } from "@/lib/types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const DOCUMENT_OPTIONS = {
  cMapUrl: "https://unpkg.com/pdfjs-dist@5.4.296/cmaps/",
  cMapPacked: true,
};

export type Highlight = {
  bboxes: BBox[];
  confidence: number | null;
};

// Zoom levels for the global PDF scale (applied to Page width). Loupe zoom
// is a separate, larger multiplier so reviewers can flick between "overview"
// (scale) and "inspect a region" (loupe).
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
const DEFAULT_ZOOM_INDEX = 1; // = 1.0

const LOUPE_SIZE = 200; // diameter in px
const LOUPE_ZOOM = 2.5; // magnification factor of the loupe lens

export function PdfViewer({
  url,
  mimeType,
  highlight,
  fileName,
}: {
  url: string | null;
  mimeType?: string;
  highlight: Highlight | null;
  fileName?: string;
}) {
  const isImage = (mimeType ?? "").startsWith("image/");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState<number>(0);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [loupeOn, setLoupeOn] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!highlight || highlight.bboxes.length === 0 || !containerRef.current) return;
    // Scroll to the first highlight bbox if it isn't already in view.
    const first = highlight.bboxes[0];
    const target = pageRefs.current.get(first.page);
    if (!target) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const bboxTopInPage = first.y * targetRect.height;
    const bboxBottomInPage = bboxTopInPage + first.height * targetRect.height;
    const bboxTopAbs = targetRect.top + bboxTopInPage;
    const bboxBottomAbs = targetRect.top + bboxBottomInPage;
    const isVisible =
      bboxTopAbs >= containerRect.top &&
      bboxBottomAbs <= containerRect.bottom;
    if (isVisible) return;
    const containerScrollTop = containerRef.current.scrollTop;
    const desiredOffsetFromTop = containerRect.height * 0.25;
    const delta = bboxTopAbs - containerRect.top - desiredOffsetFromTop;
    containerRef.current.scrollTo({
      top: containerScrollTop + delta,
      behavior: "smooth",
    });
  }, [highlight]);

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center font-sans text-sm text-[var(--gray-600)]">
        PDF unavailable. The file may still be uploading or could not be loaded.
      </div>
    );
  }

  const zoom = ZOOM_STEPS[zoomIndex];
  const baseWidth = width > 16 ? width - 32 : 0;
  const pageWidth = baseWidth > 0 ? baseWidth * zoom : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--gray-100)] bg-[var(--gray-50)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
        <span className="truncate font-sans text-[11px] normal-case tracking-normal text-[var(--gray-900)]">
          {fileName ?? ""}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setLoupeOn((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-[var(--r-sm)] border px-1.5 py-0.5 transition-colors ${
              loupeOn
                ? "border-navy bg-navy text-white"
                : "border-[var(--gray-200)] bg-white text-[var(--gray-600)] hover:border-navy hover:text-navy"
            }`}
            aria-pressed={loupeOn}
            title="Toggle hover magnifier"
          >
            <LoupeIcon />
            <span>Loupe</span>
          </button>
          <div className="flex items-center overflow-hidden rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white">
            <button
              type="button"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              className="px-1.5 py-0.5 text-[var(--gray-600)] hover:bg-[var(--gray-50)] hover:text-navy disabled:opacity-40"
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="px-1.5 py-0.5 text-[var(--gray-600)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() =>
                setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))
              }
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              className="px-1.5 py-0.5 text-[var(--gray-600)] hover:bg-[var(--gray-50)] hover:text-navy disabled:opacity-40"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto bg-[var(--gray-100)] p-4"
      >
        {isImage ? (
          <ImagePage
            url={url}
            width={pageWidth}
            highlight={highlight}
            loupeOn={loupeOn}
            registerRef={(el) => pageRefs.current.set(1, el)}
          />
        ) : (
        <Document
          file={url}
          options={DOCUMENT_OPTIONS}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div className="py-16 text-center font-sans text-sm text-[var(--gray-600)]">
              Loading PDF…
            </div>
          }
          error={
            <div className="py-16 text-center font-sans text-sm text-[var(--gray-600)]">
              <p className="mb-2">Could not render the PDF.</p>
              <p className="text-xs text-[var(--gray-400)] mb-3">
                The pdf.js worker may have been blocked, or the signed URL
                expired (30 min). Try reloading.
              </p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-3 py-1 text-xs text-navy hover:bg-navy-light"
                >
                  Open PDF in new tab
                </a>
              )}
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, i) => {
            const pageNumber = i + 1;
            const pageBoxes =
              highlight?.bboxes.filter((b) => b.page === pageNumber) ?? [];
            return (
              <div
                key={pageNumber}
                ref={(el) => {
                  pageRefs.current.set(pageNumber, el);
                }}
                className="mb-4 overflow-hidden rounded-[var(--r-md)] border border-[var(--gray-200)] bg-white shadow-sm"
              >
                <div className="border-b border-[var(--gray-100)] bg-[var(--gray-50)] px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
                  Page {pageNumber} of {numPages}
                </div>
                <div className="relative">
                  <Page
                    pageNumber={pageNumber}
                    width={pageWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                  {pageBoxes.map((bbox, idx) => (
                    <BBoxOverlay
                      key={idx}
                      bbox={bbox}
                      // Only show the confidence tag on the first bbox to
                      // avoid stamping the same percentage over every box.
                      confidence={idx === 0 ? highlight?.confidence ?? null : null}
                    />
                  ))}
                  {loupeOn ? <LoupeLens /> : null}
                </div>
              </div>
            );
          })}
        </Document>
        )}
      </div>
    </div>
  );
}

// Single-image render path: same chrome (filename / zoom / loupe) and same
// bbox overlay as the PDF path, just a raster <img> instead of react-pdf.
// bbox grounding still uses Doc AI page=1 coordinates so the existing
// overlay math works unchanged.
function ImagePage({
  url,
  width,
  highlight,
  loupeOn,
  registerRef,
}: {
  url: string;
  width: number | undefined;
  highlight: Highlight | null;
  loupeOn: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const pageBoxes = highlight?.bboxes.filter((b) => b.page === 1) ?? [];
  return (
    <div
      ref={registerRef}
      className="mb-4 overflow-hidden rounded-[var(--r-md)] border border-[var(--gray-200)] bg-white shadow-sm"
    >
      <div className="border-b border-[var(--gray-100)] bg-[var(--gray-50)] px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
        Image
      </div>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="document"
          style={width ? { width: `${width}px`, height: "auto" } : { width: "100%", height: "auto" }}
          draggable={false}
        />
        {pageBoxes.map((bbox, idx) => (
          <BBoxOverlay
            key={idx}
            bbox={bbox}
            confidence={idx === 0 ? highlight?.confidence ?? null : null}
          />
        ))}
        {loupeOn ? <ImageLoupeLens /> : null}
      </div>
    </div>
  );
}

// Loupe variant that pulls its source pixels from an <img> instead of a
// canvas. Uses a hidden offscreen canvas to sample the image at full
// resolution, then drawImage()s the magnified region onto the lens.
function ImageLoupeLens() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lensRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pageContainer = wrap.parentElement;
    if (!pageContainer) return;
    const onMove = (e: MouseEvent) => {
      const rect = pageContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        setPos(null);
        return;
      }
      setPos({ x, y });
    };
    const onLeave = () => setPos(null);
    pageContainer.addEventListener("mousemove", onMove);
    pageContainer.addEventListener("mouseleave", onLeave);
    return () => {
      pageContainer.removeEventListener("mousemove", onMove);
      pageContainer.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  useEffect(() => {
    if (!pos) return;
    const lens = lensRef.current;
    if (!lens) return;
    const ctx = lens.getContext("2d");
    if (!ctx) return;
    const wrap = wrapRef.current;
    const pageContainer = wrap?.parentElement;
    if (!pageContainer) return;
    const img = pageContainer.querySelector("img") as HTMLImageElement | null;
    if (!img || !img.complete || img.naturalWidth === 0) return;

    // Cache the source on an offscreen canvas so we can drawImage with
    // pixel-precise sx/sy from the natural-size space.
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement("canvas");
    }
    const off = offscreenRef.current;
    if (off.width !== img.naturalWidth || off.height !== img.naturalHeight) {
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      const offCtx = off.getContext("2d");
      offCtx?.drawImage(img, 0, 0);
    }

    const rect = pageContainer.getBoundingClientRect();
    const sxRatio = img.naturalWidth / rect.width;
    const syRatio = img.naturalHeight / rect.height;
    const srcW = (LOUPE_SIZE / LOUPE_ZOOM) * sxRatio;
    const srcH = (LOUPE_SIZE / LOUPE_ZOOM) * syRatio;
    const sx = pos.x * sxRatio - srcW / 2;
    const sy = pos.y * syRatio - srcH / 2;

    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.drawImage(off, sx, sy, srcW, srcH, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
  }, [pos]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-30">
      {pos ? (
        <canvas
          ref={lensRef}
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
          style={{
            position: "absolute",
            left: pos.x - LOUPE_SIZE / 2,
            top: pos.y - LOUPE_SIZE / 2,
            borderRadius: "50%",
            border: "2px solid var(--navy, #1e3a8a)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            background: "white",
          }}
        />
      ) : null}
    </div>
  );
}

// Hover loupe: a circular canvas that follows the cursor and shows a
// magnified portion of the underlying PDF.js canvas. Implementation:
//   - finds the sibling <canvas> rendered by react-pdf
//   - on mousemove, computes the source rect on that canvas around the cursor
//   - drawImage()s that rect onto its own lens canvas
//
// We bind to the parent <div> via a ref, so each page has its own lens.
function LoupeLens() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lensRef = useRef<HTMLCanvasElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Track the latest position via ref so we can redraw without restarting the
  // event listener every render. setPos drives lens visibility; the ref drives
  // what to draw.
  const latestPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pageContainer = wrap.parentElement;
    if (!pageContainer) return;

    const onMove = (e: MouseEvent) => {
      const rect = pageContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        latestPos.current = null;
        setPos(null);
        return;
      }
      latestPos.current = { x, y };
      setPos({ x, y });
    };
    const onLeave = () => {
      latestPos.current = null;
      setPos(null);
    };

    pageContainer.addEventListener("mousemove", onMove);
    pageContainer.addEventListener("mouseleave", onLeave);
    return () => {
      pageContainer.removeEventListener("mousemove", onMove);
      pageContainer.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // Draw on every pos update once the lens canvas is mounted. Splitting this
  // from the move handler avoids the chicken-and-egg where draw() bailed
  // because the lens canvas didn't exist yet.
  useEffect(() => {
    if (!pos) return;
    const lens = lensRef.current;
    if (!lens) return;
    const ctx = lens.getContext("2d");
    if (!ctx) return;
    const wrap = wrapRef.current;
    const pageContainer = wrap?.parentElement;
    if (!pageContainer) return;
    const source = pageContainer.querySelector("canvas") as HTMLCanvasElement | null;
    if (!source) return;

    const rect = pageContainer.getBoundingClientRect();
    const sxRatio = source.width / rect.width;
    const syRatio = source.height / rect.height;
    const srcW = (LOUPE_SIZE / LOUPE_ZOOM) * sxRatio;
    const srcH = (LOUPE_SIZE / LOUPE_ZOOM) * syRatio;
    const sx = pos.x * sxRatio - srcW / 2;
    const sy = pos.y * syRatio - srcH / 2;

    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.drawImage(source, sx, sy, srcW, srcH, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
  }, [pos]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-30">
      {pos ? (
        <canvas
          ref={lensRef}
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
          style={{
            // Center the loupe on the cursor — matches the "magnifier follows
            // pointer" pattern (Mistral demos, image viewers). The lens shows
            // the region directly under the cursor at LOUPE_ZOOM×.
            position: "absolute",
            left: pos.x - LOUPE_SIZE / 2,
            top: pos.y - LOUPE_SIZE / 2,
            borderRadius: "50%",
            border: "2px solid var(--navy, #1e3a8a)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            background: "white",
            cursor: "none",
          }}
        />
      ) : null}
    </div>
  );
}

function LoupeIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16" y2="16" />
    </svg>
  );
}
