import type { Metadata } from "next";

import { CategoryForm } from "@/components/category-forms";
import { getI18n } from "@/i18n/server";

import { createCategory } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.categories.newTitle };
}

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const { t } = await getI18n();

  return (
    <div className="pt-4">
      <h1 className="mb-4 text-lg font-semibold text-text">
        {t.categories.newTitle}
      </h1>
      <CategoryForm
        action={createCategory}
        submitLabel={t.categories.createCta}
        cancelHref="/categories"
        defaultKind={kind === "income" ? "income" : "expense"}
      />
    </div>
  );
}
