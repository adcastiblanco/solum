import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { LogoutButton } from "./nav-logout-button";

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
            className="font-sans text-sm text-white/90 transition-colors hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/accuracy"
            className="font-sans text-sm text-white/90 transition-colors hover:text-white"
          >
            Accuracy
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
