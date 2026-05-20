// Shown automatically by Next.js during the server-side render of /review/[id].
// Without this, clicking a row on the dashboard appears to do nothing for the
// 200–800 ms the route segment takes to RSC-render.

export default function ReviewLoading() {
  return (
    <div className="flex h-[calc(100vh-64px)] w-full">
      <div className="flex w-1/2 items-center justify-center border-r border-[var(--gray-200)] bg-white">
        <Skeleton className="h-[80%] w-[80%] rounded-[var(--r-md)]" />
      </div>
      <div className="flex w-1/2 flex-col gap-4 p-6">
        <Skeleton className="h-7 w-48 rounded-[var(--r-sm)]" />
        <Skeleton className="h-10 w-full rounded-[var(--r-sm)]" />
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-12 rounded-[var(--r-sm)]" />
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[var(--r-sm)]" />
          ))}
        </div>
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
