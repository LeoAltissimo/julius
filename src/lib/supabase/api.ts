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
  if (message.includes("unknown_entry")) {
    return "Lançamento não encontrado. Chame list_recent_transactions para ver os ids válidos.";
  }
  if (message.includes("category_kind_mismatch")) {
    return "A categoria escolhida é de outro tipo: gasto vai em categoria de gasto, entrada em categoria de entrada.";
  }
  if (message.includes("amount_must_be_positive")) {
    return "O valor precisa ser um número inteiro de centavos maior que zero.";
  }
  if (message.includes("installment_needs_explicit_scope")) {
    return "Esse lançamento é uma parcela. Diga delete_series=false para apagar só essa parcela, ou delete_series=true para apagar a compra inteira.";
  }
  if (message.includes("unknown_account")) {
    return "Conta ou cartão não encontrado. Chame list_finances para ver os ids válidos.";
  }
  if (message.includes("credit_needs_card")) {
    return "Pagamento no crédito exige uma conta do tipo cartão (credit_card). Cadastre o cartão com create_account ou escolha outro método.";
  }
  if (message.includes("settlement_only_on_card")) {
    return "Só um cartão tem conta que paga a fatura.";
  }
  if (message.includes("settlement_cannot_be_card")) {
    return "A conta que paga a fatura de um cartão não pode ser outro cartão.";
  }
  if (message.includes("card_fields_on_non_card")) {
    return "Limite, dias de fatura e conta pagadora só existem em contas do tipo cartão (credit_card).";
  }
  if (message.includes("accounts_user_name_key")) {
    return "Já existe uma conta com esse nome.";
  }
  if (message.includes("unknown_investment")) {
    return "Posição de patrimônio não encontrada. Chame list_investments para ver os ids válidos.";
  }
  if (message.includes("investments_user_name_key")) {
    return "Já existe uma posição de patrimônio com esse nome.";
  }
  if (message.includes("investments_current_value_cents_check")) {
    return "O valor de uma posição de patrimônio não pode ser negativo.";
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
