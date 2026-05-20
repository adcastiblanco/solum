"use client";

import { Uploader } from "./uploader";
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
        <Uploader onChange={refresh} />
      </header>

      <DocumentList documents={documents} />
    </>
  );
}
