import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SubcategoryForm } from "@/components/category-forms";
import { Button, Card } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { signImagePaths } from "@/lib/images";
import { fetchCategories } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import {
  archiveSubcategory,
  restoreSubcategory,
  updateSubcategory,
} from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.categories.subcategoriesTitle };
}

export default async function EditSubcategoryPage({
  params,
}: {
  params: Promise<{ id: string; subId: string }>;
}) {
  const { id, subId } = await params;
  const { supabase } = await requireUser();
  const { t } = await getI18n();

  const categories = await fetchCategories(supabase, { includeArchived: true });
  const category = categories.find((item) => item.id === id);
  const subcategory = category?.subcategories.find((item) => item.id === subId);

  if (!category || !subcategory) notFound();

  const signed = await signImagePaths(supabase, [subcategory.image_path]);
  const sameKind = categories.filter((item) => item.kind === category.kind);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <h1 className="text-lg font-semibold text-text">{subcategory.name}</h1>
        <p className="text-xs text-text-muted">
          {t.subcategoryForm.editIn(category.name)}
        </p>
      </div>

      {subcategory.archived_at ? (
        <Card className="flex items-center justify-between gap-3 p-4">
          <p className="text-xs text-text-muted">
            {t.subcategoryForm.archivedNotice}
          </p>
          <form action={restoreSubcategory}>
            <input type="hidden" name="id" value={subcategory.id} />
            <input type="hidden" name="categoryId" value={category.id} />
            <Button type="submit" variant="secondary" size="sm">
              {t.common.restore}
            </Button>
          </form>
        </Card>
      ) : null}

      <SubcategoryForm
        action={updateSubcategory}
        categories={sameKind}
        categoryId={category.id}
        subcategory={subcategory}
        imageUrl={signed.get(subcategory.image_path ?? "") ?? null}
        submitLabel={t.common.saveChanges}
        cancelHref={`/categories/${category.id}`}
      />

      {!subcategory.archived_at ? (
        <form action={archiveSubcategory} className="pb-2">
          <input type="hidden" name="id" value={subcategory.id} />
          <input type="hidden" name="categoryId" value={category.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t.subcategoryForm.archiveCta}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
