"use client";

import { useActionState } from "react";
import Link from "next/link";

import { ColorPicker } from "@/components/form-bits";
import { MoneyInput } from "@/components/money-input";
import { Button, Field, FormError, Input, Textarea } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { InvestmentRow } from "@/lib/queries";

import type { InvestmentFormState } from "@/app/(app)/investments/actions";

const initialState: InvestmentFormState = { error: null };

export function InvestmentForm({
  action,
  investment,
  submitLabel,
}: {
  action: (
    state: InvestmentFormState,
    formData: FormData,
  ) => Promise<InvestmentFormState>;
  investment?: InvestmentRow;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      {investment ? (
        <input type="hidden" name="id" value={investment.id} />
      ) : null}

      <Field label={t.investments.form.name}>
        <Input
          name="name"
          required
          maxLength={80}
          placeholder={t.investments.form.namePlaceholder}
          defaultValue={investment?.name ?? ""}
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-text-muted">
          {t.investments.form.currentValue}
        </span>
        <MoneyInput
          name="currentValueCents"
          defaultValueCents={investment?.current_value_cents ?? 0}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.investments.form.institution}>
          <Input
            name="institution"
            maxLength={80}
            placeholder={t.investments.form.institutionPlaceholder}
            defaultValue={investment?.institution ?? ""}
          />
        </Field>

        <Field label={t.investments.form.kind}>
          <Input
            name="kind"
            maxLength={40}
            placeholder={t.investments.form.kindPlaceholder}
            defaultValue={investment?.kind ?? ""}
          />
        </Field>
      </div>

      <ColorPicker name="color" defaultValue={investment?.color ?? "#0f766e"} />

      <Field label={t.investments.form.notes}>
        <Textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={investment?.notes ?? ""}
        />
      </Field>

      <FormError message={state.error} />

      <div className="flex gap-2">
        <Link
          href="/investments"
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border-strong text-sm font-medium text-text"
        >
          {t.common.cancel}
        </Link>
        <Button type="submit" className="flex-[2]" disabled={pending}>
          {pending ? t.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
