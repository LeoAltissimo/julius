import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";

import { CategoryForm } from "@/components/category-forms";
import { Button, ButtonLink, Card, CardHeader } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { signImagePaths } from "@/lib/images";
import { fetchCategories } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import { archiveCategory, restoreCategory, updateCategory } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.categories.title };
}

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { t } = await getI18n();

  const categories = await fetchCategories(supabase, { includeArchived: true });
  const category = categories.find((item) => item.id === id);
  if (!category) notFound();

  const signed = await signImagePaths(supabase, [
    category.image_path,
    ...category.subcategories.map((sub) => sub.image_path),
  ]);

  const active = category.subcategories.filter((sub) => !sub.archived_at);
  const archived = category.subcategories.filter((sub) => sub.archived_at);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <h1 className="text-lg font-semibold text-text">{category.name}</h1>

      {category.archived_at ? (
        <Card className="flex items-center justify-between gap-3 p-4">
          <p className="text-xs text-text-muted">
            {t.categories.archivedNotice}
          </p>
          <form action={restoreCategory}>
            <input type="hidden" name="id" value={category.id} />
            <Button type="submit" variant="secondary" size="sm">
              {t.common.restore}
            </Button>
          </form>
        </Card>
      ) : null}

      <CategoryForm
        action={updateCategory}
        category={category}
        imageUrl={signed.get(category.image_path ?? "") ?? null}
        submitLabel={t.common.saveChanges}
        cancelHref="/categories"
      />

      <Card className="pb-3">
        <CardHeader
          title={t.categories.subcategoriesTitle}
          description={t.categories.subcategoriesSubtitle}
          action={
            <ButtonLink
              href={`/categories/${category.id}/new`}
              size="sm"
              variant="secondary"
            >
              <Plus className="size-4" aria-hidden />
              {t.common.new}
            </ButtonLink>
          }
        />

        {active.length === 0 ? (
          <p className="px-4 pb-1 pt-3 text-xs text-text-muted">
            {t.categories.noSubcategoriesYet}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {active.map((sub) => (
              <li key={sub.id}>
                <Link
                  href={`/categories/${category.id}/${sub.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3">
                    {signed.get(sub.image_path ?? "") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={signed.get(sub.image_path ?? "")}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {sub.name}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-text-faint"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 ? (
          <p className="px-4 pt-3 text-xs text-text-faint">
            {t.categories.archivedCount(
              archived.length,
              archived.map((sub) => sub.name).join(", "),
            )}
          </p>
        ) : null}
      </Card>

      {!category.archived_at ? (
        <form action={archiveCategory} className="pb-2">
          <input type="hidden" name="id" value={category.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t.categories.archiveCta}
          </Button>
          <p className="mt-2 text-center text-xs text-text-faint">
            {t.categories.archiveNote}
          </p>
        </form>
      ) : null}
    </div>
  );
}
