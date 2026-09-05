import type { Metadata } from "next";

import { InvestmentForm } from "@/components/investment-form";
import { getI18n } from "@/i18n/server";

import { createInvestment } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.investments.newTitle };
}

export default async function NewInvestmentPage() {
  const { t } = await getI18n();

  return (
    <div className="pt-4">
      <h1 className="mb-4 text-lg font-semibold text-text">
        {t.investments.newTitle}
      </h1>
      <InvestmentForm
        action={createInvestment}
        submitLabel={t.investments.createCta}
      />
    </div>
  );
}
