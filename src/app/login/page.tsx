import type { Metadata } from "next";

import { Card } from "@/components/ui";
import { getI18n } from "@/i18n/server";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.login.title };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const { t } = await getI18n();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Julius
        </h1>
        <p className="mt-1 text-sm text-text-muted">{t.login.tagline}</p>
      </header>

      <Card className="w-full max-w-sm p-5">
        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-negative/40 bg-negative-soft px-3 py-2 text-sm text-negative"
          >
            {t.login.linkProblem}
          </p>
        ) : null}
        <LoginForm next={safeNext} />
      </Card>
    </main>
  );
}
