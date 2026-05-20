import { signup } from "./actions";
import { login } from "../login/actions";
import { AuthForm } from "../auth-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthForm
      initialMode="signup"
      loginAction={login}
      signupAction={signup}
      error={error}
    />
  );
}
