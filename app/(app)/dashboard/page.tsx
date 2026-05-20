import { createClient } from "@/lib/supabase/server";
import { Uploader } from "./uploader";
import { DocumentList, type DocumentRow } from "./document-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, file_name, status, error_message, created_at")
    .order("created_at", { ascending: false });

  const documents = (data ?? []) as DocumentRow[];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-serif italic text-4xl text-navy">Dashboard</h1>
          <p className="font-sans text-sm text-[var(--gray-600)] mt-1">
            Upload a clinical document to begin.
          </p>
        </div>
        <Uploader />
      </header>

      <DocumentList documents={documents} />
    </div>
  );
}
