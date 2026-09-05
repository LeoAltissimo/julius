import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { signImagePaths } from "@/lib/images";
import { fetchCategories, type CategoryWithSubcategories } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import { seedDefaultCategories } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.categories.title };
}

export default async function CategoriesPage() {
  const { supabase } = await requireUser();
  const { t } = await getI18n();

  const categories = await fetchCategories(supabase);
  const signed = await signImagePaths(
    supabase,
    categories.map((category) => category.image_path),
  );

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text">{t.categories.title}</h1>
        <ButtonLink href="/categories/new" size="sm">
          <Plus className="size-4" aria-hidden />
          {t.common.new}
        </ButtonLink>
      </div>

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            title={t.categories.emptyTitle}
            description={t.categories.emptyBody}
            action={
              <form action={seedDefaultCategories}>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-accent px-4 text-sm font-medium text-accent-contrast"
                >
                  {t.categories.emptyCta}
                </button>
              </form>
            }
          />
        </Card>
      ) : null}

      {expense.length > 0 ? (
        <Card className="pb-2">
          <CardHeader title={t.categories.expenses} />
          <ul className="mt-2 divide-y divide-border">
            {expense.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                imageUrl={signed.get(category.image_path ?? "") ?? null}
                t={t}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {income.length > 0 ? (
        <Card className="pb-2">
          <CardHeader title={t.categories.income} />
          <ul className="mt-2 divide-y divide-border">
            {income.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                imageUrl={signed.get(category.image_path ?? "") ?? null}
                t={t}
              />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function CategoryRow({
  category,
  imageUrl,
  t,
}: {
  category: CategoryWithSubcategories;
  imageUrl: string | null;
  t: Messages;
}) {
  const count = category.subcategories.length;

  return (
    <li>
      <Link
        href={`/categories/${category.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-3"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
          style={{ backgroundColor: `${category.color}22` }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="size-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">
            {category.name}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {count === 0
              ? t.categories.noSubcategories
              : t.categories.subcategoryCount(count)}
            {category.description ? ` · ${category.description}` : ""}
          </span>
        </span>

        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-faint" />
      </Link>
    </li>
  );
}
