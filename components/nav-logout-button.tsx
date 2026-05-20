"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Log out"
      aria-label="Log out"
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] border border-white/20 text-white/80 transition-all duration-150 hover:border-white/40 hover:bg-white/10 hover:text-white disabled:opacity-60"
    >
      {pending ? <Spinner size={14} /> : <LogoutIcon />}
    </button>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
