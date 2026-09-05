"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartPie,
  Plus,
  ReceiptText,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

type Tab = { href: string; label: string; icon: LucideIcon };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  const tabs: Tab[] = [
    { href: "/", label: t.nav.summary, icon: ChartPie },
    { href: "/transactions", label: t.nav.transactions, icon: ReceiptText },
    { href: "/investments", label: t.nav.netWorth, icon: TrendingUp },
    { href: "/settings", label: t.nav.settings, icon: Settings },
  ];

  return (
    <nav
      aria-label={t.nav.main}
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-2/95 backdrop-blur"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5">
        {tabs.slice(0, 2).map((tab) => (
          <NavTab key={tab.href} tab={tab} pathname={pathname} />
        ))}

        <div className="flex justify-center">
          <Link
            href="/transactions/new"
            aria-label={t.nav.newEntry}
            className="-mt-5 flex size-12 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-lg transition-transform active:scale-95"
          >
            <Plus className="size-6" aria-hidden />
          </Link>
        </div>

        {tabs.slice(2).map((tab) => (
          <NavTab key={tab.href} tab={tab} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ tab, pathname }: { tab: Tab; pathname: string }) {
  const active = isActive(pathname, tab.href);
  const Icon = tab.icon;

  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors",
        active ? "text-accent" : "text-text-faint hover:text-text-muted",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {tab.label}
    </Link>
  );
}
