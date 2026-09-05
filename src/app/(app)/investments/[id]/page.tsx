import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InvestmentForm } from "@/components/investment-form";
import { Button, Card } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { fetchInvestments } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import {
  archiveInvestment,
  restoreInvestment,
  updateInvestment,
} from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.investments.title };
}

export default async function EditInvestmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { t } = await getI18n();

  const investments = await fetchInvestments(supabase, {
    includeArchived: true,
  });
  const investment = investments.find((item) => item.id === id);
  if (!investment) notFound();

  return (
    <div className="flex flex-col gap-4 pt-4">
      <h1 className="text-lg font-semibold text-text">{investment.name}</h1>

      {investment.archived_at ? (
        <Card className="flex items-center justify-between gap-3 p-4">
          <p className="text-xs text-text-muted">
            {t.investments.archivedNotice}
          </p>
          <form action={restoreInvestment}>
            <input type="hidden" name="id" value={investment.id} />
            <Button type="submit" variant="secondary" size="sm">
              {t.common.restore}
            </Button>
          </form>
        </Card>
      ) : null}

      <InvestmentForm
        action={updateInvestment}
        investment={investment}
        submitLabel={t.common.saveChanges}
      />

      {!investment.archived_at ? (
        <form action={archiveInvestment} className="pb-2">
          <input type="hidden" name="id" value={investment.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t.investments.archiveCta}
          </Button>
          <p className="mt-2 text-center text-xs text-text-faint">
            {t.investments.archiveNote}
          </p>
        </form>
      ) : null}
    </div>
  );
}
