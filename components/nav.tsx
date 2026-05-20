"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { signOut } from "@/app/auth/actions";
import { LogoutButton } from "./nav-logout-button";
import { Spinner } from "./spinner";

// Inline spinner that turns on while Next.js is server-rendering the target
// route segment after a click on the surrounding <Link>. Lives as a child of
// Link so useLinkStatus() picks up that link's pending state.
function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner size={12} />;
}

export function Nav({ userEmail }: { userEmail: string }) {
  return (
    <nav className="bg-navy text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href="/dashboard"
          className="font-serif italic text-2xl transition-opacity hover:opacity-80"
        >
          Solum Health
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 font-sans text-sm text-white/90 transition-colors hover:text-white"
          >
            <LinkPending />
            <span>Dashboard</span>
          </Link>
          <Link
            href="/accuracy"
            className="inline-flex items-center gap-1.5 font-sans text-sm text-white/90 transition-colors hover:text-white"
          >
            <LinkPending />
            <span>Accuracy</span>
          </Link>
          <span className="font-mono text-xs text-white/60 hidden sm:inline">
            {userEmail}
          </span>
          <form action={signOut}>
            <LogoutButton />
          </form>
        </div>
      </div>
    </nav>
  );
}
