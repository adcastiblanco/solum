// Shown automatically by Next.js while /accuracy's server component
// aggregates field_reviews from Supabase.

export default function AccuracyLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-8">
        <Skeleton className="h-9 w-40 rounded-[var(--r-sm)] mb-2" />
        <Skeleton className="h-4 w-80 rounded-[var(--r-sm)]" />
      </header>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--r-md)] border border-[var(--gray-200)] bg-white p-5"
          >
            <Skeleton className="h-3 w-24 rounded-[var(--r-sm)] mb-3" />
            <Skeleton className="h-8 w-20 rounded-[var(--r-sm)]" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--gray-200)] bg-white">
        <div className="h-10 border-b border-[var(--gray-100)] bg-[var(--gray-50)]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-[var(--gray-100)] px-4 py-3"
          >
            <Skeleton className="h-4 flex-1 rounded-[var(--r-sm)]" />
            <Skeleton className="h-4 w-12 rounded-[var(--r-sm)]" />
            <Skeleton className="h-4 w-12 rounded-[var(--r-sm)]" />
            <Skeleton className="h-4 w-16 rounded-[var(--r-sm)]" />
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
