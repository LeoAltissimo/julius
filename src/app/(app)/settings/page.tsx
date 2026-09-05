import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Bot, ChevronRight, Languages, LogOut, Shapes, Wallet } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { ApiTokens, type ApiTokenRow } from "@/components/api-tokens";
import { Button, Card, CardHeader } from "@/components/ui";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/supabase/server";

import { setLocale } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const { t, locale } = await getI18n();

  const [{ data: tokens }, headerList] = await Promise.all([
    supabase
      .from("api_tokens")
      .select("id, name, prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false }),
    headers(),
  ]);

  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const mcpEndpoint = `${proto}://${host}/api/mcp`;

  const links = [
    {
      href: "/categories",
      label: t.settings.categories,
      description: t.settings.categoriesDescription,
      icon: Shapes,
    },
    {
      href: "/accounts",
      label: t.settings.accounts,
      description: t.settings.accountsDescription,
      icon: Wallet,
    },
  ];

  return (
    <div className="flex flex-col gap-4 pt-4">
      <h1 className="text-lg font-semibold text-text">{t.settings.title}</h1>

      <Card className="divide-y divide-border overflow-hidden">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-3"
            >
              <Icon aria-hidden className="size-5 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text">
                  {link.label}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {link.description}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-text-faint"
              />
            </Link>
          );
        })}
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-text">
          <Languages aria-hidden className="size-4 text-text-muted" />
          {t.settings.language}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {t.settings.languageDescription}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {LOCALES.map((option) => (
            <form key={option} action={setLocale}>
              <input type="hidden" name="locale" value={option} />
              <Button
                type="submit"
                variant={option === locale ? "primary" : "secondary"}
                className="w-full"
                aria-pressed={option === locale}
              >
                {LOCALE_LABELS[option]}
              </Button>
            </form>
          ))}
        </div>
      </Card>

      <Card className="pb-4">
        <CardHeader
          title={
            <span className="flex items-center gap-1.5">
              <Bot aria-hidden className="size-4 text-text-muted" />
              {t.settings.agentAccess}
            </span>
          }
          description={t.settings.agentAccessDescription}
        />
        <div className="px-4 pt-3">
          <ApiTokens
            tokens={(tokens ?? []) as ApiTokenRow[]}
            endpoint={mcpEndpoint}
          />
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-xs text-text-muted">{t.settings.signedInAs}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-text">
          {user.email}
        </p>
        <form action={signOut} className="mt-3">
          <Button type="submit" variant="secondary" className="w-full">
            <LogOut className="size-4" aria-hidden />
            {t.settings.signOut}
          </Button>
        </form>
      </Card>

      <p className="px-1 text-center text-xs text-text-faint">
        {t.settings.footer}
      </p>
    </div>
  );
}
