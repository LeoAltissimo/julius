"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { MoneyInput } from "@/components/money-input";
import {
  Button,
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { splitInstallments } from "@/lib/money";
import type {
  AccountRow,
  CategoryWithSubcategories,
  Entry,
  EntryKind,
} from "@/lib/queries";

import type { EntryFormState } from "@/app/(app)/transactions/actions";

const initialState: EntryFormState = { error: null };

export function EntryForm({
  action,
  accounts,
  categories,
  entry,
  submitLabel,
  defaultDate,
}: {
  action: (
    state: EntryFormState,
    formData: FormData,
  ) => Promise<EntryFormState>;
  accounts: AccountRow[];
  categories: CategoryWithSubcategories[];
  entry?: Entry;
  submitLabel: string;
  defaultDate: string;
}) {
  const { t, fmt } = useI18n();
  const [state, formAction, pending] = useActionState(action, initialState);

  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? "expense");
  const [categoryId, setCategoryId] = useState(entry?.category_id ?? "");
  const [installments, setInstallments] = useState(
    entry?.installment_total ?? 1,
  );
  const [amountCents, setAmountCents] = useState(entry?.amount_cents ?? 0);

  const kinds: Array<{ value: EntryKind; label: string }> = [
    { value: "expense", label: t.entryForm.expense },
    { value: "income", label: t.entryForm.income },
    { value: "transfer", label: t.entryForm.transfer },
  ];

  const categoryKind = kind === "income" ? "income" : "expense";
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.kind === categoryKind),
    [categories, categoryKind],
  );

  const subcategories = useMemo(
    () =>
      visibleCategories.find((category) => category.id === categoryId)
        ?.subcategories ?? [],
    [visibleCategories, categoryId],
  );

  // Editing an existing purchase touches only that instalment, so the split
  // control would be misleading. It belongs to the create flow.
  const canSplit = kind === "expense" && !entry;
  const parcels =
    canSplit && installments > 1
      ? splitInstallments(amountCents, installments)
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <input type="hidden" name="kind" value={kind} />

      <div
        role="group"
        aria-label={t.entryForm.kindGroup}
        className="grid grid-cols-3 gap-1 rounded-xl bg-surface-3 p-1"
      >
        {kinds.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setKind(option.value);
              setCategoryId("");
            }}
            aria-pressed={kind === option.value}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition-colors",
              kind === option.value
                ? "bg-surface-0 text-text shadow-sm"
                : "text-text-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <MoneyInput
        name="amountCents"
        defaultValueCents={entry?.amount_cents ?? 0}
        autoFocus={!entry}
        onValueChange={setAmountCents}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.entryForm.date}>
          <Input
            name="occurredOn"
            type="date"
            required
            defaultValue={entry?.occurred_on ?? defaultDate}
          />
        </Field>

        <Field
          label={
            kind === "transfer" ? t.entryForm.sourceAccount : t.entryForm.account
          }
        >
          <Select
            name="accountId"
            required
            defaultValue={entry?.account_id ?? accounts[0]?.id ?? ""}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t.entryForm.description}>
        <Input
          name="description"
          maxLength={200}
          placeholder={
            kind === "income"
              ? t.entryForm.incomePlaceholder
              : t.entryForm.expensePlaceholder
          }
          defaultValue={entry?.description ?? ""}
        />
      </Field>

      {kind === "transfer" ? (
        <Field
          label={t.entryForm.targetAccount}
          hint={t.entryForm.targetAccountHint}
        >
          <Select
            name="counterAccountId"
            required
            defaultValue={entry?.counter_account_id ?? ""}
          >
            <option value="">{t.common.select}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <>
          <Field label={t.entryForm.category}>
            <Select
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">{t.entryForm.noCategory}</option>
              {visibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.entryForm.subcategory}
            hint={
              categoryId && subcategories.length === 0
                ? t.entryForm.noSubcategoriesHint
                : undefined
            }
          >
            <Select
              name="subcategoryId"
              key={categoryId}
              defaultValue={entry?.subcategory_id ?? ""}
              disabled={!categoryId || subcategories.length === 0}
            >
              <option value="">{t.entryForm.noSubcategory}</option>
              {subcategories.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {canSplit ? (
        <Field
          label={t.entryForm.installments}
          hint={
            parcels
              ? t.entryForm.installmentHint(installments, fmt.money(parcels[0]))
              : t.entryForm.oneOffHint
          }
        >
          <Select
            name="installments"
            value={installments}
            onChange={(event) => setInstallments(Number(event.target.value))}
          >
            <option value={1}>{t.entryForm.oneOff}</option>
            {Array.from({ length: 23 }, (_, index) => index + 2).map((n) => (
              <option key={n} value={n}>
                {n}x
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="installments" value={1} />
      )}

      <Field label={t.entryForm.notes}>
        <Textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={entry?.notes ?? ""}
        />
      </Field>

      <FormError message={state.error} />

      <div className="flex gap-2">
        <Link
          href="/transactions"
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
