import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * A sessionless client for the MCP route.
 *
 * It carries nothing but the publishable key. Authorisation happens inside the
 * database: every `api_*` function takes the caller's token and resolves the
 * owner from it, so this client on its own can read and write exactly nothing.
 */
export function createApiClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Turns a Postgres error from an `api_*` function into something readable. */
export function describeApiError(message: string): string {
  if (message.includes("invalid_token")) {
    return "Token inválido ou revogado. Gere um novo em Ajustes → Acesso para agentes.";
  }
  if (message.includes("unknown_category")) {
    return "Categoria não encontrada. Chame list_finances para ver os ids válidos.";
  }
  if (message.includes("unknown_subcategory")) {
    return "Subcategoria não encontrada. Chame list_finances para ver os ids válidos.";
  }
  if (message.includes("entries_transfer_shape")) {
    return "Transferência precisa de duas contas diferentes e sem categoria.";
  }
  if (message.includes("subcategory_id_category_id")) {
    return "Essa subcategoria não pertence à categoria informada.";
  }
  if (message.includes("entries_account_id_user_id_fkey")) {
    return "Conta não encontrada. Chame list_finances para ver os ids válidos.";
  }
  return message;
}
