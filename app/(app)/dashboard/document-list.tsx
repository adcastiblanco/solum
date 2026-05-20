import Link from "next/link";

export type DocumentRow = {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "done" | "error";
  error_message: string | null;
  created_at: string;
};

function StatusBadge({
  status,
  errorMessage,
}: {
  status: DocumentRow["status"];
  errorMessage: string | null;
}) {
  const base =
    "inline-flex items-center rounded-[var(--r-sm)] px-2 py-0.5 font-mono text-xs uppercase tracking-wide";

  if (status === "error") {
    return (
      <span
        className={`${base} border border-[var(--gray-200)] bg-white text-[var(--gray-900)]`}
        title={errorMessage ?? "Extraction failed"}
      >
        Error
      </span>
    );
  }

  return (
    <span className={`${base} bg-navy-light text-navy`}>{status}</span>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
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
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide">
              Status
            </th>
            <th className="px-4 py-3 font-mono text-xs uppercase tracking-wide">
              Uploaded
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              className="border-t border-[var(--gray-100)] hover:bg-[var(--gray-50)]"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/review/${doc.id}`}
                  className="font-sans text-sm text-navy hover:underline"
                >
                  {doc.file_name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={doc.status}
                  errorMessage={doc.error_message}
                />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--gray-600)]">
                {formatTimestamp(doc.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
