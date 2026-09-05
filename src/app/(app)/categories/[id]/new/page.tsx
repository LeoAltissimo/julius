import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SubcategoryForm } from "@/components/category-forms";
import { getI18n } from "@/i18n/server";
import { fetchCategories } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

import { createSubcategory } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.subcategoryForm.newTitle };
}

export default async function NewSubcategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { t } = await getI18n();

  const categories = await fetchCategories(supabase);
  const category = categories.find((item) => item.id === id);
  if (!category) notFound();

  const sameKind = categories.filter((item) => item.kind === category.kind);

  return (
    <div className="pt-4">
      <h1 className="mb-1 text-lg font-semibold text-text">
        {t.subcategoryForm.newTitle}
      </h1>
      <p className="mb-4 text-xs text-text-muted">
        {t.subcategoryForm.inside(category.name)}
      </p>

      <SubcategoryForm
        action={createSubcategory}
        categories={sameKind}
        categoryId={category.id}
        submitLabel={t.subcategoryForm.createCta}
        cancelHref={`/categories/${category.id}`}
      />
    </div>
  );
}
