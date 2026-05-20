"use client";

import { Uploader } from "./uploader";
import { SampleBatchButton } from "./sample-batch-button";
import { DocumentList, type DocumentRow } from "./document-list";
import { useDocumentPolling } from "@/hooks/useDocumentPolling";

export function DashboardClient({ initial }: { initial: DocumentRow[] }) {
  const { documents, refresh } = useDocumentPolling(initial);

  return (
    <>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-serif italic text-4xl text-navy">Dashboard</h1>
          <p className="font-sans text-sm text-[var(--gray-600)] mt-1">
            Upload a clinical document to begin.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <SampleBatchButton onChange={refresh} />
          <Uploader onChange={refresh} />
        </div>
      </header>

      <DocumentList documents={documents} onRetry={refresh} />
    </>
  );
}
