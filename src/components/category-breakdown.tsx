"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import type { CategoryTotal } from "@/lib/aggregate";

import { Delta } from "./delta";

/**
 * The two-level view: macro categories ranked by spend, each opening into the
 * subcategories underneath it. Both levels carry last month's figure, so the
 * answer to "why was this month worse" is one tap away.
 */
export function CategoryBreakdown({
  categories,
  month,
}: {
  categories: CategoryTotal[];
  month: string;
}) {
  const { t, fmt } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border">
      {categories.map((category) => {
        const open = openId === category.id;
        const hasDetail = category.subcategories.length > 0;
        const name = category.name ?? t.categories.uncategorized;

        return (
          <li key={category.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : category.id)}
              aria-expanded={open}
              disabled={!hasDetail}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-3 disabled:hover:bg-transparent"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text">
                    {name}
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold text-text">
                    {fmt.money(category.cents)}
                  </span>
                </span>

                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(category.share * 100, category.cents > 0 ? 2 : 0)}%`,
                      backgroundColor: category.color,
                    }}
                  />
                </span>

                <span className="mt-1.5 flex items-center justify-between gap-2">
                  <Delta
                    current={category.cents}
                    previous={category.previousCents}
                  />
                  <span className="tabular text-xs text-text-faint">
                    {(category.share * 100).toFixed(0)}%
                  </span>
                </span>
              </span>

              {hasDetail ? (
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 text-text-faint transition-transform",
                    open && "rotate-180",
                  )}
                />
              ) : (
                <span className="size-4 shrink-0" />
              )}
            </button>

            {open ? (
              <ul className="bg-surface-1/60 pb-2">
                {category.subcategories.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between gap-3 py-1.5 pl-10 pr-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-muted">
                        {sub.name ?? t.categories.noSubcategoryBucket}
                      </span>
                      <Delta
                        current={sub.cents}
                        previous={sub.previousCents}
                        showAmount={false}
                      />
                    </span>
                    <span className="tabular shrink-0 text-sm text-text">
                      {fmt.money(sub.cents)}
                    </span>
                  </li>
                ))}

                <li className="px-4 pt-2 pl-10">
                  <Link
                    href={`/transactions?month=${month}&category=${category.id}`}
                    className="text-xs font-medium text-accent underline underline-offset-4"
                  >
                    {t.categories.viewEntries(name)}
                  </Link>
                </li>
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
