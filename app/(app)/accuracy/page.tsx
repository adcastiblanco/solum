import { createClient } from "@/lib/supabase/server";
import { FIELD_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

type ReviewRow = {
  field_name: string;
  approved: boolean;
  was_edited: boolean;
};

type FieldStat = {
  fieldName: string;
  label: string;
  total: number;
  approved: number;
  corrected: number;
  correctionRatePct: number;
};

export default async function AccuracyPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("field_reviews")
    .select("field_name, approved, was_edited");

  const rows = (data ?? []) as ReviewRow[];

  const byField = new Map<string, { total: number; approved: number; corrected: number }>();
  for (const r of rows) {
    const agg = byField.get(r.field_name) ?? { total: 0, approved: 0, corrected: 0 };
    agg.total += 1;
    if (r.approved) agg.approved += 1;
    if (r.approved && r.was_edited) agg.corrected += 1;
    byField.set(r.field_name, agg);
  }

  const stats: FieldStat[] = Array.from(byField.entries())
    .map(([fieldName, agg]) => ({
      fieldName,
      label: FIELD_LABELS[fieldName] ?? fieldName,
      total: agg.total,
      approved: agg.approved,
      corrected: agg.corrected,
      correctionRatePct:
        agg.total === 0 ? 0 : Math.round((agg.corrected / agg.total) * 1000) / 10,
    }))
    .sort((a, b) => b.correctionRatePct - a.correctionRatePct);

  const totalReviewed = rows.length;
  const totalApproved = rows.filter((r) => r.approved).length;
  const totalCorrected = rows.filter((r) => r.approved && r.was_edited).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <h1 className="font-serif italic text-4xl text-navy mb-8">Accuracy</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard label="Fields reviewed" value={totalReviewed} />
        <StatCard label="Approved" value={totalApproved} />
        <StatCard label="Corrected" value={totalCorrected} />
      </div>

      {stats.length === 0 ? (
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--gray-200)] bg-white px-6 py-16 text-center font-sans text-sm text-[var(--gray-600)]">
          No fields reviewed yet
        </div>
      ) : (
        <div className="rounded-[var(--r-md)] bg-white border border-[var(--gray-200)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--gray-200)] bg-[var(--gray-50)]">
                <th className="text-left px-5 py-3 font-sans text-xs font-medium uppercase tracking-wider text-[var(--gray-600)]">
                  Field
                </th>
                <th className="text-right px-5 py-3 font-sans text-xs font-medium uppercase tracking-wider text-[var(--gray-600)]">
                  Reviewed
                </th>
                <th className="text-right px-5 py-3 font-sans text-xs font-medium uppercase tracking-wider text-[var(--gray-600)]">
                  Approved
                </th>
                <th className="text-right px-5 py-3 font-sans text-xs font-medium uppercase tracking-wider text-[var(--gray-600)]">
                  Corrected
                </th>
                <th className="text-left px-5 py-3 font-sans text-xs font-medium uppercase tracking-wider text-[var(--gray-600)] w-[40%]">
                  Correction rate
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr
                  key={s.fieldName}
                  className="border-b border-[var(--gray-100)] last:border-b-0"
                >
                  <td className="px-5 py-4">
                    <div className="font-sans text-sm text-[var(--gray-900)]">
                      {s.label}
                    </div>
                    <div className="font-mono text-xs text-[var(--gray-600)] mt-0.5">
                      {s.fieldName}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm text-[var(--gray-900)]">
                    {s.total}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm text-[var(--gray-900)]">
                    {s.approved}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm text-[var(--gray-900)]">
                    {s.corrected}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-[var(--gray-100)] overflow-hidden">
                        <div
                          className="h-full bg-navy"
                          style={{ width: `${s.correctionRatePct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-[var(--gray-600)] tabular-nums w-12 text-right">
                        {s.correctionRatePct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--r-md)] bg-white border border-[var(--gray-200)] px-5 py-5">
      <div className="font-sans text-xs uppercase tracking-wider text-[var(--gray-600)]">
        {label}
      </div>
      <div className="font-serif italic text-4xl text-navy mt-2 tabular-nums">
        {value}
      </div>
    </div>
  );
}
