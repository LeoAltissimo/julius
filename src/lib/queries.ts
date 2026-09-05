import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./supabase/database.types";
import { monthRange, type MonthKey } from "./dates";

export type Client = SupabaseClient<Database>;

export type EntryKind = Database["public"]["Enums"]["entry_kind"];
export type CategoryKind = Database["public"]["Enums"]["category_kind"];
export type AccountType = Database["public"]["Enums"]["account_type"];

export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type SubcategoryRow =
  Database["public"]["Tables"]["subcategories"]["Row"];
export type InvestmentRow = Database["public"]["Tables"]["investments"]["Row"];

const ENTRY_SELECT = `
  id, kind, amount_cents, occurred_on, description, notes,
  account_id, counter_account_id, category_id, subcategory_id,
  installment_group_id, installment_number, installment_total,
  account:accounts!entries_account_id_user_id_fkey (id, name, color, type),
  category:categories!entries_category_id_user_id_fkey (id, name, color, kind),
  subcategory:subcategories!entries_subcategory_id_user_id_fkey (id, name)
` as const;

export type Entry = {
  id: string;
  kind: EntryKind;
  amount_cents: number;
  occurred_on: string;
  description: string;
  notes: string | null;
  account_id: string;
  counter_account_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  account: { id: string; name: string; color: string; type: AccountType } | null;
  category: {
    id: string;
    name: string;
    color: string;
    kind: CategoryKind;
  } | null;
  subcategory: { id: string; name: string } | null;
};

/** Every entry that falls inside a calendar month, newest first. */
export async function fetchMonthEntries(
  supabase: Client,
  month: MonthKey,
): Promise<Entry[]> {
  const { from, to } = monthRange(month);

  const { data, error } = await supabase
    .from("entries")
    .select(ENTRY_SELECT)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Entry[];
}

export async function fetchEntry(
  supabase: Client,
  id: string,
): Promise<Entry | null> {
  const { data, error } = await supabase
    .from("entries")
    .select(ENTRY_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as Entry) ?? null;
}

export async function fetchAccounts(
  supabase: Client,
  { includeArchived = false } = {},
): Promise<AccountRow[]> {
  let query = supabase
    .from("accounts")
    .select("*")
    .order("sort_order")
    .order("created_at");

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** account id to current balance in cents, computed by the database. */
export async function fetchAccountBalances(
  supabase: Client,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("account_balances")
    .select("account_id, balance_cents");

  if (error) throw error;

  const balances = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.account_id) balances.set(row.account_id, row.balance_cents ?? 0);
  }
  return balances;
}

export type CategoryWithSubcategories = CategoryRow & {
  subcategories: SubcategoryRow[];
};

export async function fetchCategories(
  supabase: Client,
  { includeArchived = false } = {},
): Promise<CategoryWithSubcategories[]> {
  let query = supabase
    .from("categories")
    .select("*, subcategories (*)")
    .order("sort_order")
    .order("created_at");

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw error;

  const categories = (data ?? []) as unknown as CategoryWithSubcategories[];

  for (const category of categories) {
    category.subcategories = (category.subcategories ?? [])
      .filter((sub) => includeArchived || sub.archived_at === null)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
  }

  return categories;
}

export async function fetchInvestments(
  supabase: Client,
  { includeArchived = false } = {},
): Promise<InvestmentRow[]> {
  let query = supabase
    .from("investments")
    .select("*")
    .order("sort_order")
    .order("created_at");

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export type NetWorthPoint = { recorded_at: string; value_cents: number };

/**
 * Total invested at each point where any position changed value. Positions are
 * carried forward, so a month where you only touched one of them still shows
 * the full patrimony rather than a dip.
 */
export async function fetchNetWorthSeries(
  supabase: Client,
  limit = 400,
): Promise<NetWorthPoint[]> {
  const { data, error } = await supabase
    .from("investment_snapshots")
    .select("investment_id, value_cents, recorded_at")
    .order("recorded_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const latestByInvestment = new Map<string, number>();
  const series: NetWorthPoint[] = [];

  for (const snapshot of data ?? []) {
    latestByInvestment.set(snapshot.investment_id, snapshot.value_cents);
    const total = [...latestByInvestment.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    series.push({ recorded_at: snapshot.recorded_at, value_cents: total });
  }

  return series;
}
