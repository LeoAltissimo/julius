import type { Metadata } from "next";

import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.offline.title };
}

export default async function OfflinePage() {
  const { t } = await getI18n();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
      <h1 className="text-lg font-semibold text-text">{t.offline.title}</h1>
      <p className="max-w-xs text-sm text-text-muted">{t.offline.body}</p>
    </main>
  );
}
