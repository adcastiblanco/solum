"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-white/30 px-3 py-1 font-sans text-sm text-white transition-all duration-150 hover:bg-white/10 disabled:opacity-60"
    >
      {pending && <Spinner size={12} />}
      <span>{pending ? "Logging out…" : "Log out"}</span>
    </button>
  );
}
