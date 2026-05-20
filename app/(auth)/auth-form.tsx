"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] bg-navy px-4 py-2 font-sans text-sm text-white transition-all duration-150 hover:bg-navy-mid disabled:opacity-60"
    >
      {pending && <Spinner size={14} />}
      <span>{pending ? `${label}…` : label}</span>
    </button>
  );
}

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
          className="rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-3 py-2 font-sans text-sm text-[var(--gray-900)] outline-none transition-colors focus:border-navy"
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
          className="rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-3 py-2 font-sans text-sm text-[var(--gray-900)] outline-none transition-colors focus:border-navy"
        />
      </label>
      {error ? (
        <p className="font-mono text-xs text-[var(--gray-900)] bg-[var(--gray-50)] border border-[var(--gray-200)] rounded-[var(--r-sm)] px-3 py-2">
          {error}
        </p>
      ) : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
