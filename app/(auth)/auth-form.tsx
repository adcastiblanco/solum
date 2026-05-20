export function AuthForm({
  action,
  submitLabel,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  error?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--gray-600)]">
          Email
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-3 py-2 font-sans text-sm text-[var(--gray-900)] outline-none focus:border-navy"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--gray-600)]">
          Password
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={6}
          autoComplete="current-password"
          className="rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-3 py-2 font-sans text-sm text-[var(--gray-900)] outline-none focus:border-navy"
        />
      </label>
      {error ? (
        <p className="font-mono text-xs text-[var(--gray-900)] bg-[var(--gray-50)] border border-[var(--gray-200)] rounded-[var(--r-sm)] px-3 py-2">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="mt-2 rounded-[var(--r-sm)] bg-navy px-4 py-2 font-sans text-sm text-white hover:bg-navy-mid transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  );
}
