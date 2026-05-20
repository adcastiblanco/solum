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
  bbox: BBox;
  confidence: number | null;
};

export function PdfViewer({
  url,
  highlight,
}: {
  url: string | null;
  highlight: Highlight | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Only scroll to the highlighted page if the bbox isn't already visible
  // in the current scroll position. Otherwise hover on any field would yank
  // the viewport back to the top of the page.
  useEffect(() => {
    if (!highlight || !containerRef.current) return;
    const target = pageRefs.current.get(highlight.bbox.page);
    if (!target) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const bboxTopInPage = highlight.bbox.y * targetRect.height;
    const bboxBottomInPage = bboxTopInPage + highlight.bbox.height * targetRect.height;
    const bboxTopAbs = targetRect.top + bboxTopInPage;
    const bboxBottomAbs = targetRect.top + bboxBottomInPage;
    const isVisible =
      bboxTopAbs >= containerRect.top &&
      bboxBottomAbs <= containerRect.bottom;
    if (isVisible) return;
    // Scroll the bbox into view without slamming to the page top.
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

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-[var(--gray-100)] p-4"
    >
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
            Failed to load PDF.
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => {
          const pageNumber = i + 1;
          const isHighlighted = highlight?.bbox.page === pageNumber;
          return (
            <div
              key={pageNumber}
              ref={(el) => {
                pageRefs.current.set(pageNumber, el);
              }}
              className="mb-4 overflow-hidden rounded-[var(--r-md)] border border-[var(--gray-200)] bg-white shadow-sm"
            >
              <div className="border-b border-[var(--gray-100)] bg-[var(--gray-50)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--gray-600)]">
                Page {pageNumber} of {numPages}
              </div>
              <div className="relative">
                <Page
                  pageNumber={pageNumber}
                  width={width > 16 ? width - 32 : undefined}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
                {isHighlighted && highlight && (
                  <BBoxOverlay
                    bbox={highlight.bbox}
                    confidence={highlight.confidence}
                  />
                )}
              </div>
            </div>
          );
        })}
      </Document>
    </div>
  );
}
