"use client";

import { useActionState } from "react";
import Link from "next/link";

import { ColorPicker, ImageField } from "@/components/form-bits";
import {
  Button,
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { CategoryRow, SubcategoryRow } from "@/lib/queries";

import type { CategoryFormState } from "@/app/(app)/categories/actions";

const initialState: CategoryFormState = { error: null };

type Action = (
  state: CategoryFormState,
  formData: FormData,
) => Promise<CategoryFormState>;

function FormActions({
  cancelHref,
  submitLabel,
  pending,
}: {
  cancelHref: string;
  submitLabel: string;
  pending: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="flex gap-2">
      <Link
        href={cancelHref}
        className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border-strong text-sm font-medium text-text"
      >
        {t.common.cancel}
      </Link>
      <Button type="submit" className="flex-[2]" disabled={pending}>
        {pending ? t.common.saving : submitLabel}
      </Button>
    </div>
  );
}

export function CategoryForm({
  action,
  category,
  imageUrl,
  submitLabel,
  cancelHref,
  defaultKind = "expense",
}: {
  action: Action;
  category?: CategoryRow;
  imageUrl?: string | null;
  submitLabel: string;
  cancelHref: string;
  defaultKind?: "expense" | "income";
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <Field label={t.categoryForm.name}>
        <Input
          name="name"
          required
          maxLength={60}
          placeholder={t.categoryForm.namePlaceholder}
          defaultValue={category?.name ?? ""}
        />
      </Field>

      <Field label={t.categoryForm.kind} hint={t.categoryForm.kindHint}>
        <Select name="kind" defaultValue={category?.kind ?? defaultKind}>
          <option value="expense">{t.categoryForm.expense}</option>
          <option value="income">{t.categoryForm.income}</option>
        </Select>
      </Field>

      <Field label={t.categoryForm.description}>
        <Textarea
          name="description"
          rows={2}
          maxLength={500}
          placeholder={t.categoryForm.descriptionPlaceholder}
          defaultValue={category?.description ?? ""}
        />
      </Field>

      <ColorPicker name="color" defaultValue={category?.color ?? "#0ea5e9"} />

      <ImageField name="image" currentUrl={imageUrl} />

      <FormError message={state.error} />

      <FormActions
        cancelHref={cancelHref}
        submitLabel={submitLabel}
        pending={pending}
      />
    </form>
  );
}

export function SubcategoryForm({
  action,
  categories,
  categoryId,
  subcategory,
  imageUrl,
  submitLabel,
  cancelHref,
}: {
  action: Action;
  categories: CategoryRow[];
  categoryId: string;
  subcategory?: SubcategoryRow;
  imageUrl?: string | null;
  submitLabel: string;
  cancelHref: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      {subcategory ? (
        <input type="hidden" name="id" value={subcategory.id} />
      ) : null}

      <Field label={t.categoryForm.name}>
        <Input
          name="name"
          required
          maxLength={60}
          placeholder={t.subcategoryForm.namePlaceholder}
          defaultValue={subcategory?.name ?? ""}
        />
      </Field>

      <Field label={t.subcategoryForm.parent} hint={t.subcategoryForm.parentHint}>
        <Select name="categoryId" defaultValue={categoryId} required>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t.categoryForm.description}>
        <Textarea
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={subcategory?.description ?? ""}
        />
      </Field>

      <ImageField name="image" currentUrl={imageUrl} />

      <FormError message={state.error} />

      <FormActions
        cancelHref={cancelHref}
        submitLabel={submitLabel}
        pending={pending}
      />
    </form>
  );
}
