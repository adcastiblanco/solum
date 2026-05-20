import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";
import type { DocumentRow } from "./document-list";

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
      <DashboardClient initial={documents} />
    </div>
  );
}
