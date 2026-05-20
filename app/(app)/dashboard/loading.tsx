// Shown automatically by Next.js while /dashboard's server component runs
// its Supabase query. Without this the user clicks "Dashboard" and sees
// nothing for ~300 ms while the RSC payload streams in.

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40 rounded-[var(--r-sm)]" />
          <Skeleton className="h-4 w-64 rounded-[var(--r-sm)]" />
        </div>
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-28 rounded-[var(--r-sm)]" />
          <Skeleton className="h-9 w-24 rounded-[var(--r-sm)]" />
        </div>
      </header>
      <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
        <div className="h-10 border-b border-[var(--gray-100)] bg-[var(--gray-50)]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-[var(--gray-100)] px-4 py-3"
          >
            <Skeleton className="h-4 flex-1 rounded-[var(--r-sm)]" />
            <Skeleton className="h-5 w-16 rounded-[var(--r-sm)]" />
            <Skeleton className="h-4 w-32 rounded-[var(--r-sm)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-[var(--gray-100)] ${className}`}
      aria-hidden
    />
  );
}
