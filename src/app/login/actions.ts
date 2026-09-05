"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null; notice?: string | null };

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

/** Only ever redirect back to a path inside this app, never to another host. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function parse(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { t } = await getI18n();
  const parsed = parse(formData);

  if (!parsed.success) {
    const badEmail = parsed.error.issues.some((issue) =>
      issue.path.includes("email"),
    );
    return {
      error: badEmail ? t.login.invalidEmail : t.login.shortPassword,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: t.login.badCredentials };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { t } = await getI18n();
  const parsed = parse(formData);

  if (!parsed.success) {
    const badEmail = parsed.error.issues.some((issue) =>
      issue.path.includes("email"),
    );
    return {
      error: badEmail ? t.login.invalidEmail : t.login.shortPassword,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return { error: t.login.signUpFailed };
  }

  // With e-mail confirmation switched on, Supabase returns a user but no
  // session: the account exists but cannot be used until the link is clicked.
  if (!data.session) {
    return { error: null, notice: t.login.confirmEmail };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
