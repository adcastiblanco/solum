"use client";

import { useFormStatus } from "react-dom";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";

type Mode = "login" | "signup";

const COPY: Record<Mode, {
  title: string;
  subtitle: string;
  submit: string;
  togglePrompt: string;
  toggleCta: string;
  altPath: "/login" | "/signup";
}> = {
  login: {
    title: "Log in",
    subtitle: "Welcome back.",
    submit: "Log in",
    togglePrompt: "No account?",
    toggleCta: "Sign up",
    altPath: "/signup",
  },
  signup: {
    title: "Create an account",
    subtitle: "Get started with Solum.",
    submit: "Sign up",
    togglePrompt: "Already have an account?",
    toggleCta: "Log in",
    altPath: "/login",
  },
};

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

// One client component that handles both /login and /signup with an internal
// mode toggle. Switching modes is just setState — no server round-trip — so
// the form swaps instantly instead of hitting the previous ~300 ms RSC delay.
// We still sync the URL via router.replace so the page is bookmarkable and so
// the server actions (which redirect on error to /login?error= or
// /signup?error=) land on the right path.
export function AuthForm({
  initialMode,
  loginAction,
  signupAction,
  error,
}: {
  initialMode: Mode;
  loginAction: (formData: FormData) => void | Promise<void>;
  signupAction: (formData: FormData) => void | Promise<void>;
  error?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const copy = COPY[mode];
  const action = mode === "login" ? loginAction : signupAction;

  function toggle() {
    const next: Mode = mode === "login" ? "signup" : "login";
    setMode(next);
    // Non-blocking URL update so /signup and /login are still
    // directly addressable.
    startTransition(() => {
      router.replace(COPY[mode].altPath, { scroll: false });
    });
  }

  return (
    <div className="rounded-[var(--r-lg)] bg-white p-8 shadow-sm border border-[var(--gray-200)]">
      <h2 className="font-sans text-xl text-navy mb-1">{copy.title}</h2>
      <p className="font-sans text-sm text-[var(--gray-600)] mb-6">
        {copy.subtitle}
      </p>
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
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="rounded-[var(--r-sm)] border border-[var(--gray-200)] bg-white px-3 py-2 font-sans text-sm text-[var(--gray-900)] outline-none transition-colors focus:border-navy"
          />
        </label>
        {error ? (
          <p className="font-mono text-xs text-[var(--gray-900)] bg-[var(--gray-50)] border border-[var(--gray-200)] rounded-[var(--r-sm)] px-3 py-2">
            {error}
          </p>
        ) : null}
        <SubmitButton label={copy.submit} />
      </form>
      <p className="font-sans text-sm text-[var(--gray-600)] mt-6 text-center">
        {copy.togglePrompt}{" "}
        <button
          type="button"
          onClick={toggle}
          className="text-navy underline underline-offset-2 hover:no-underline"
        >
          {copy.toggleCta}
        </button>
      </p>
    </div>
  );
}
