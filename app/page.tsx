export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-canvas px-6 py-24">
      <div className="max-w-2xl text-center">
        <h1 className="font-serif italic text-6xl text-navy mb-6">
          Solum Health
        </h1>
        <p className="font-sans text-lg text-[var(--gray-600)]">
          Document AI — clinical extraction & review.
        </p>
        <p className="font-mono text-xs text-[var(--gray-400)] mt-8">
          bootstrap · ready
        </p>
      </div>
    </main>
  );
}
