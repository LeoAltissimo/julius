import type { Entry } from "./queries";

// The display name is deliberately absent: it is a translated string, so the
// UI resolves it. This module only decides which bucket a row belongs to.
export const UNCATEGORIZED = {
  id: "__uncategorized__",
  color: "#6b7484",
} as const;

export type MonthTotals = {
  expenseCents: number;
  incomeCents: number;
  /** Income minus expense. Transfers never move this number. */
  netCents: number;
  entryCount: number;
};

/**
 * Transfers are deliberately absent from every total here: moving money from
 * the checking account to the savings account is not spending, and counting it
 * would make a good month look like a disaster.
 */
export function totalsFor(entries: Entry[]): MonthTotals {
  let expenseCents = 0;
  let incomeCents = 0;
  let entryCount = 0;

  for (const entry of entries) {
    if (entry.kind === "expense") {
      expenseCents += entry.amount_cents;
      entryCount += 1;
    } else if (entry.kind === "income") {
      incomeCents += entry.amount_cents;
      entryCount += 1;
    }
  }

  return {
    expenseCents,
    incomeCents,
    netCents: incomeCents - expenseCents,
    entryCount,
  };
}

export type SubcategoryTotal = {
  id: string;
  /** null means the catch-all bucket, whose label the UI translates. */
  name: string | null;
  cents: number;
  previousCents: number;
  deltaCents: number;
};

export type CategoryTotal = {
  id: string;
  /** null means the catch-all bucket, whose label the UI translates. */
  name: string | null;
  color: string;
  cents: number;
  previousCents: number;
  deltaCents: number;
  /** Share of the month's spending, 0 to 1. */
  share: number;
  subcategories: SubcategoryTotal[];
};

type Bucket = {
  id: string;
  name: string | null;
  color: string;
  cents: number;
  subs: Map<string, { id: string; name: string | null; cents: number }>;
};

function bucketize(entries: Entry[], kind: Entry["kind"]): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();

  for (const entry of entries) {
    if (entry.kind !== kind) continue;

    const id = entry.category?.id ?? UNCATEGORIZED.id;
    const bucket = buckets.get(id) ?? {
      id,
      name: entry.category?.name ?? null,
      color: entry.category?.color ?? UNCATEGORIZED.color,
      cents: 0,
      subs: new Map(),
    };

    bucket.cents += entry.amount_cents;

    const subId = entry.subcategory?.id ?? `${id}:__none__`;
    const sub = bucket.subs.get(subId) ?? {
      id: subId,
      name: entry.subcategory?.name ?? null,
      cents: 0,
    };
    sub.cents += entry.amount_cents;
    bucket.subs.set(subId, sub);

    buckets.set(id, bucket);
  }

  return buckets;
}

/**
 * Spending broken down by macro category for one month, each line carrying the
 * same category's figure from the month before. Categories that existed only
 * last month are kept with a zero, because "the R$ 800 of last month's travel
 * is gone" is exactly the kind of thing a comparison should show.
 */
export function categoryBreakdown(
  current: Entry[],
  previous: Entry[],
  { kind = "expense" as Entry["kind"], locale = "pt-BR" } = {},
): CategoryTotal[] {
  // The catch-all bucket has no name of its own, and accented names have to
  // sort the way the reader expects, so collation follows the locale.
  const collator = new Intl.Collator(locale);
  const byName = (a: string | null, b: string | null) =>
    a === null || b === null ? 0 : collator.compare(a, b);

  const currentBuckets = bucketize(current, kind);
  const previousBuckets = bucketize(previous, kind);

  const total = [...currentBuckets.values()].reduce(
    (sum, bucket) => sum + bucket.cents,
    0,
  );

  const ids = new Set([...currentBuckets.keys(), ...previousBuckets.keys()]);
  const rows: CategoryTotal[] = [];

  for (const id of ids) {
    const now = currentBuckets.get(id);
    const before = previousBuckets.get(id);
    const reference = now ?? before!;

    const cents = now?.cents ?? 0;
    const previousCents = before?.cents ?? 0;

    const subIds = new Set([
      ...(now?.subs.keys() ?? []),
      ...(before?.subs.keys() ?? []),
    ]);

    const subcategories: SubcategoryTotal[] = [...subIds]
      .map((subId) => {
        const subNow = now?.subs.get(subId);
        const subBefore = before?.subs.get(subId);
        const subReference = subNow ?? subBefore!;
        const subCents = subNow?.cents ?? 0;
        const subPrevious = subBefore?.cents ?? 0;

        return {
          id: subId,
          name: subReference.name,
          cents: subCents,
          previousCents: subPrevious,
          deltaCents: subCents - subPrevious,
        };
      })
      .sort((a, b) => b.cents - a.cents || byName(a.name, b.name));

    rows.push({
      id,
      name: reference.name,
      color: reference.color,
      cents,
      previousCents,
      deltaCents: cents - previousCents,
      share: total > 0 ? cents / total : 0,
      subcategories,
    });
  }

  return rows.sort(
    (a, b) => b.cents - a.cents || b.previousCents - a.previousCents,
  );
}

/** Running total per day of the month, for the "am I ahead of last month" line. */
export function cumulativeByDay(
  entries: Entry[],
  kind: Entry["kind"] = "expense",
): Map<number, number> {
  const perDay = new Map<number, number>();

  for (const entry of entries) {
    if (entry.kind !== kind) continue;
    const day = Number(entry.occurred_on.slice(8, 10));
    perDay.set(day, (perDay.get(day) ?? 0) + entry.amount_cents);
  }

  const cumulative = new Map<number, number>();
  let running = 0;
  for (let day = 1; day <= 31; day += 1) {
    running += perDay.get(day) ?? 0;
    cumulative.set(day, running);
  }

  return cumulative;
}

export function groupByDay(entries: Entry[]): Array<[string, Entry[]]> {
  const groups = new Map<string, Entry[]>();

  for (const entry of entries) {
    const list = groups.get(entry.occurred_on) ?? [];
    list.push(entry);
    groups.set(entry.occurred_on, list);
  }

  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
