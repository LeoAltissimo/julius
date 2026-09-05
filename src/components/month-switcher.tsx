"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useI18n } from "@/i18n/client";
import { currentMonthKey, shiftMonth } from "@/lib/dates";

export function MonthSwitcher({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, fmt } = useI18n();

  function goTo(target: string) {
    const params = new URLSearchParams(searchParams);
    if (target === currentMonthKey()) {
      params.delete("month");
    } else {
      params.set("month", target);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const isCurrent = month === currentMonthKey();

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => goTo(shiftMonth(month, -1))}
        aria-label={t.month.previous}
        className="flex size-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-3 hover:text-text"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => goTo(currentMonthKey())}
        disabled={isCurrent}
        // first-letter rather than `capitalize`: in Portuguese "setembro de
        // 2026" takes a capital S and nothing else.
        className="flex-1 text-center text-sm font-semibold text-text first-letter:uppercase disabled:cursor-default"
        title={isCurrent ? undefined : t.month.backToCurrent}
      >
        {fmt.monthLabel(month)}
      </button>

      <button
        type="button"
        onClick={() => goTo(shiftMonth(month, 1))}
        aria-label={t.month.next}
        className="flex size-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-3 hover:text-text"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
