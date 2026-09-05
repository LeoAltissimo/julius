"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error: string | null;
  notice?: string | null;
  /** Set when the account exists but its address was never confirmed, so the
   *  form can offer to send the email again instead of leaving a dead end. */
  needsConfirmation?: boolean;
};

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

/** Only ever redirect back to a path inside this app, never to another host. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/**
 * Taken from the request rather than an environment variable, so the same code
 * works on localhost, on a Vercel preview and in production without any of
 * them needing to be told what they are called.
 */
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  return `${proto}://${host}`;
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
    // Reporting every failure as "wrong password" sends people hunting for a
    // password that was never wrong. An unconfirmed address and a rate limit
    // are different problems and each has a different way out.
    if (error.code === "email_not_confirmed") {
      return { error: t.login.emailNotConfirmed, needsConfirmation: true };
    }
    if (error.code === "over_request_rate_limit") {
      return { error: t.login.tooManyAttempts };
    }
    // Genuinely wrong credentials stay vague on purpose: saying which half was
    // wrong tells a stranger whether an address has an account here.
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
  const origin = await requestOrigin();
  const next = safeNext(formData.get("next"));

  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      // The confirmation link comes back with a PKCE code, which only the
      // callback route knows how to trade for a session.
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: t.login.accountExists };
    }
    if (error.code === "over_email_send_rate_limit") {
      return { error: t.login.tooManyEmails };
    }
    return { error: t.login.signUpFailed };
  }

  // With e-mail confirmation switched on, Supabase returns a user but no
  // session: the account exists but cannot be used until the link is clicked.
  if (!data.session) {
    return { error: null, notice: t.login.confirmEmail };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

/** Sends the confirmation email again, to the address the form already has. */
export async function resendConfirmation(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { t } = await getI18n();

  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim() : "";
  if (!z.string().email().safeParse(email).success) {
    return { error: t.login.invalidEmail };
  }

  const supabase = await createClient();
  const origin = await requestOrigin();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return {
      error:
        error.code === "over_email_send_rate_limit"
          ? t.login.tooManyEmails
          : t.login.resendFailed,
    };
  }

  return { error: null, notice: t.login.confirmationResent };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
