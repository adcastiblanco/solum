export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-10">
        <h1 className="font-serif italic text-4xl text-navy">Dashboard</h1>
        <p className="font-sans text-sm text-[var(--gray-600)] mt-1">
          Upload a clinical document or run the sample batch to begin.
        </p>
      </header>

      <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--gray-200)] bg-white px-8 py-16 text-center">
        <p className="font-serif italic text-2xl text-navy mb-2">
          No documents yet
        </p>
        <p className="font-sans text-sm text-[var(--gray-600)] max-w-md mx-auto">
          Uploads and the sample batch trigger will appear here in a later
          slice. For now, the auth shell is in place.
        </p>
      </div>
    </div>
  );
}
