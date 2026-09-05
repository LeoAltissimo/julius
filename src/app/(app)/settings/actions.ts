"use server";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  // The language shows up in every rendered page, so the whole tree is stale.
  revalidatePath("/", "layout");
}

export type TokenState = {
  error: string | null;
  /** The plaintext token, returned exactly once and never stored. */
  token?: string | null;
};

/**
 * Mints a token for the MCP server.
 *
 * Only the SHA-256 of the token is written down, so the row is useless to
 * anyone who reads the database, and the plaintext exists only in the response
 * that goes back to the person who asked for it.
 */
export async function createApiToken(
  _prev: TokenState,
  formData: FormData,
): Promise<TokenState> {
  const { t } = await getI18n();

  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 1 || name.length > 60) {
    return { error: t.settings.tokenNameRequired };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t.common.sessionExpired };

  const token = `julius_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await supabase.from("api_tokens").insert({
    user_id: user.id,
    name,
    token_hash: tokenHash,
    prefix: token.slice(0, 14),
  });

  if (error) return { error: t.settings.tokenFailed };

  revalidatePath("/settings");
  return { error: null, token };
}

export async function revokeApiToken(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/settings");
}

export async function deleteApiToken(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("api_tokens").delete().eq("id", id);

  revalidatePath("/settings");
}
