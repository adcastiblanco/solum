import { login } from "./actions";
import { signup } from "../signup/actions";
import { AuthForm } from "../auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthForm
      initialMode="login"
      loginAction={login}
      signupAction={signup}
      error={error}
    />
  );
}
