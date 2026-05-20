import Link from "next/link";
import { login } from "./actions";
import { AuthForm } from "../auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="rounded-[var(--r-lg)] bg-white p-8 shadow-sm border border-[var(--gray-200)]">
      <h2 className="font-sans text-xl text-navy mb-1">Log in</h2>
      <p className="font-sans text-sm text-[var(--gray-600)] mb-6">
        Welcome back.
      </p>
      <AuthForm action={login} submitLabel="Log in" error={error} />
      <p className="font-sans text-sm text-[var(--gray-600)] mt-6 text-center">
        No account?{" "}
        <Link href="/signup" className="text-navy underline underline-offset-2">
          Sign up
        </Link>
      </p>
    </div>
  );
}
