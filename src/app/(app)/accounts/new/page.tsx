import type { Metadata } from "next";

import { AccountForm } from "@/components/account-form";
import { getI18n } from "@/i18n/server";

import { createAccount } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.accounts.newTitle };
}

export default async function NewAccountPage() {
  const { t } = await getI18n();

  return (
    <div className="pt-4">
      <h1 className="mb-4 text-lg font-semibold text-text">
        {t.accounts.newTitle}
      </h1>
      <AccountForm action={createAccount} submitLabel={t.accounts.createCta} />
    </div>
  );
}
