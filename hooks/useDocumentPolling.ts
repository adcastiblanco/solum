"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentRow } from "@/app/(app)/dashboard/document-list";

const POLL_INTERVAL_MS = 2500;

async function fetchDocuments(): Promise<DocumentRow[]> {
  const res = await fetch("/api/documents", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/documents failed: ${res.status}`);
  const json = (await res.json()) as { documents: DocumentRow[] };
  return json.documents;
}

function anyProcessing(docs: DocumentRow[]): boolean {
  return docs.some((d) => d.status === "pending" || d.status === "processing");
}

export function useDocumentPolling(initial: DocumentRow[]) {
  const [documents, setDocuments] = useState<DocumentRow[]>(initial);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);


  useEffect(() => {
    stoppedRef.current = false;

    async function tick() {
      if (stoppedRef.current) return;
      try {
        setIsLoading(true);
        const next = await fetchDocuments();
        if (stoppedRef.current) return;
        setDocuments(next);
        if (anyProcessing(next)) {
          timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch {
        // Transient errors — try again next tick if still processing.
        if (!stoppedRef.current && anyProcessing(documents)) {
          timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } finally {
        setIsLoading(false);
      }
    }

    if (anyProcessing(documents)) {
      timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    }

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.map((d) => `${d.id}:${d.status}`).join("|")]);

  async function refresh() {
    try {
      setIsLoading(true);
      const next = await fetchDocuments();
      setDocuments(next);
    } finally {
      setIsLoading(false);
    }
  }

  return { documents, isLoading, refresh };
}
