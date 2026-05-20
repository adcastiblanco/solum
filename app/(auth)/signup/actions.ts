"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    redirect(`/signup?error=${encodeURIComponent(signUpError.message)}`);
  }

  // Local Supabase has email confirmations off by default; sign the user in
  // directly so the redirect lands on the dashboard with a live session.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
