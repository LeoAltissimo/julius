"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { ColorPicker } from "@/components/form-bits";
import { MoneyInput } from "@/components/money-input";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { AccountRow, AccountType } from "@/lib/queries";

import type { AccountFormState } from "@/app/(app)/accounts/actions";

const TYPE_ORDER: AccountType[] = [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "other",
];

const initialState: AccountFormState = { error: null };

export function AccountForm({
  action,
  account,
  accounts = [],
  submitLabel,
}: {
  action: (
    state: AccountFormState,
    formData: FormData,
  ) => Promise<AccountFormState>;
  account?: AccountRow;
  /** Everything that could settle a card's bill: the user's non-card accounts. */
  accounts?: AccountRow[];
  submitLabel: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(action, initialState);
  const [type, setType] = useState<AccountType>(account?.type ?? "checking");

  const isCard = type === "credit_card";

  // A card cannot settle a card, and nothing settles itself.
  const settlementOptions = accounts.filter(
    (option) => option.type !== "credit_card" && option.id !== account?.id,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}

      <Field label={t.accounts.form.name}>
        <Input
          name="name"
          required
          maxLength={80}
          placeholder={t.accounts.form.namePlaceholder}
          defaultValue={account?.name ?? ""}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.accounts.form.kind}>
          <Select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as AccountType)}
          >
            {TYPE_ORDER.map((option) => (
              <option key={option} value={option}>
                {t.accounts.types[option]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.accounts.form.institution}>
          <Input
            name="institution"
            maxLength={80}
            placeholder={t.accounts.form.institutionPlaceholder}
            defaultValue={account?.institution ?? ""}
          />
        </Field>
      </div>

      {isCard ? (
        <>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-text-muted">
              {t.accounts.form.creditLimit}
            </span>
            <MoneyInput
              name="creditLimitCents"
              defaultValueCents={account?.credit_limit_cents ?? 0}
            />
          </div>

          <Field
            label={t.accounts.form.settlement}
            hint={t.accounts.form.settlementHint}
          >
            <Select
              name="settlementAccountId"
              defaultValue={account?.settlement_account_id ?? ""}
            >
              <option value="">{t.accounts.form.noSettlement}</option>
              {settlementOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.accounts.form.closingDay}>
              <Input
                name="statementClosingDay"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                defaultValue={account?.statement_closing_day ?? ""}
              />
            </Field>
            <Field label={t.accounts.form.dueDay}>
              <Input
                name="statementDueDay"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                defaultValue={account?.statement_due_day ?? ""}
              />
            </Field>
          </div>
        </>
      ) : (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-text-muted">
            {t.accounts.form.openingBalance}
          </span>
          <MoneyInput
            name="openingBalanceCents"
            defaultValueCents={account?.opening_balance_cents ?? 0}
          />
        </div>
      )}

      <ColorPicker name="color" defaultValue={account?.color ?? "#64748b"} />

      <FormError message={state.error} />

      <div className="flex gap-2">
        <Link
          href="/accounts"
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
