import Link from "next/link";
import { signup } from "./actions";
import { AuthForm } from "../auth-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="rounded-[var(--r-lg)] bg-white p-8 shadow-sm border border-[var(--gray-200)]">
      <h2 className="font-sans text-xl text-navy mb-1">Create account</h2>
      <p className="font-sans text-sm text-[var(--gray-600)] mb-6">
        Use your work email.
      </p>
      <AuthForm action={signup} submitLabel="Sign up" error={error} />
      <p className="font-sans text-sm text-[var(--gray-600)] mt-6 text-center">
        Already have one?{" "}
        <Link href="/login" className="text-navy underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  );
}
