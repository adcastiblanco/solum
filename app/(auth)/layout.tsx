export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="font-serif italic text-5xl text-navy">Solum Health</h1>
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--gray-400)] mt-2">
            Document AI
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
