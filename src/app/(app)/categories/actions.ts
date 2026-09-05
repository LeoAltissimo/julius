"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { removeCategoryImage, uploadCategoryImage } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";

export type CategoryFormState = { error: string | null };

const HEX = /^#[0-9a-fA-F]{6}$/;

function categorySchema(t: Messages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t.categoryForm.nameRequired)
      .max(60, t.categoryForm.nameTooLong),
    description: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    kind: z.enum(["expense", "income"]),
    color: z.string().regex(HEX, t.categoryForm.invalidColor),
  });
}

function subcategorySchema(t: Messages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t.subcategoryForm.nameRequired)
      .max(60, t.categoryForm.nameTooLong),
    description: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    categoryId: z.string().uuid(t.categoryForm.invalidCategory),
  });
}

function revalidateCategoryPages() {
  revalidatePath("/");
  revalidatePath("/categories");
  revalidatePath("/transactions");
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function describeCategory(t: Messages, message: string): string {
  return message.includes("_name_key")
    ? t.categoryForm.duplicateCategory
    : t.categoryForm.saveCategoryFailed;
}

function describeSubcategory(t: Messages, message: string): string {
  return message.includes("_name_key")
    ? t.subcategoryForm.duplicateSubcategory
    : t.subcategoryForm.saveSubcategoryFailed;
}

/* -------------------------------------------------------------------------- */
/* Macro categories                                                           */
/* -------------------------------------------------------------------------- */

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const { t } = await getI18n();

  const parsed = categorySchema(t).safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    kind: formData.get("kind"),
    color: formData.get("color"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await session();
  if (!user) return { error: t.common.sessionExpired };

  const image = await uploadCategoryImage(
    supabase,
    user.id,
    formData.get("image"),
    t,
  );
  if (!image.ok) return { error: image.error };

  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description,
    kind: parsed.data.kind,
    color: parsed.data.color,
    image_path: image.path,
  });

  if (error) {
    await removeCategoryImage(supabase, image.path);
    return { error: describeCategory(t, error.message) };
  }

  revalidateCategoryPages();
  redirect("/categories");
}

export async function updateCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const { t } = await getI18n();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.categoryForm.invalidCategory };

  const parsed = categorySchema(t).safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    kind: formData.get("kind"),
    color: formData.get("color"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await session();
  if (!user) return { error: t.common.sessionExpired };

  const { data: existing } = await supabase
    .from("categories")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();

  const image = await uploadCategoryImage(
    supabase,
    user.id,
    formData.get("image"),
    t,
  );
  if (!image.ok) return { error: image.error };

  const clearImage = formData.get("removeImage") === "on";

  const { error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      kind: parsed.data.kind,
      color: parsed.data.color,
      ...(image.path
        ? { image_path: image.path }
        : clearImage
          ? { image_path: null }
          : {}),
    })
    .eq("id", id);

  if (error) {
    await removeCategoryImage(supabase, image.path);
    return { error: describeCategory(t, error.message) };
  }

  // Only drop the old file once the row that pointed at it is safely updated.
  if (image.path || clearImage) {
    await removeCategoryImage(supabase, existing?.image_path ?? null);
  }

  revalidateCategoryPages();
  redirect("/categories");
}

export async function archiveCategory(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const { supabase } = await session();

  // Archiving rather than deleting: entries keep pointing at the category, so
  // last year's reports do not quietly change shape.
  await supabase
    .from("categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  await supabase
    .from("subcategories")
    .update({ archived_at: new Date().toISOString() })
    .eq("category_id", id)
    .is("archived_at", null);

  revalidateCategoryPages();
  redirect("/categories");
}

export async function restoreCategory(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const { supabase } = await session();
  await supabase.from("categories").update({ archived_at: null }).eq("id", id);

  revalidateCategoryPages();
  redirect("/categories");
}

/* -------------------------------------------------------------------------- */
/* Subcategories                                                              */
/* -------------------------------------------------------------------------- */

export async function createSubcategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const { t } = await getI18n();

  const parsed = subcategorySchema(t).safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await session();
  if (!user) return { error: t.common.sessionExpired };

  const image = await uploadCategoryImage(
    supabase,
    user.id,
    formData.get("image"),
    t,
  );
  if (!image.ok) return { error: image.error };

  const { error } = await supabase.from("subcategories").insert({
    user_id: user.id,
    category_id: parsed.data.categoryId,
    name: parsed.data.name,
    description: parsed.data.description,
    image_path: image.path,
  });

  if (error) {
    await removeCategoryImage(supabase, image.path);
    return { error: describeSubcategory(t, error.message) };
  }

  revalidateCategoryPages();
  redirect(`/categories/${parsed.data.categoryId}`);
}

export async function updateSubcategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const { t } = await getI18n();

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { error: t.subcategoryForm.invalidSubcategory };
  }

  const parsed = subcategorySchema(t).safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await session();
  if (!user) return { error: t.common.sessionExpired };

  const { data: existing } = await supabase
    .from("subcategories")
    .select("image_path, category_id")
    .eq("id", id)
    .maybeSingle();

  const image = await uploadCategoryImage(
    supabase,
    user.id,
    formData.get("image"),
    t,
  );
  if (!image.ok) return { error: image.error };

  const clearImage = formData.get("removeImage") === "on";

  // Moving to another macro category cannot be a plain update: entries carry
  // (subcategory_id, category_id) together, so the subcategory and every entry
  // pointing at it have to change in one go. The database function defers that
  // foreign key and moves both; doing it here would fail on any subcategory
  // that has ever been used.
  if (existing && existing.category_id !== parsed.data.categoryId) {
    const { error: moveError } = await supabase.rpc("move_subcategory", {
      p_subcategory_id: id,
      p_target_category_id: parsed.data.categoryId,
    });

    if (moveError) {
      await removeCategoryImage(supabase, image.path);
      return { error: describeSubcategory(t, moveError.message) };
    }
  }

  const { error } = await supabase
    .from("subcategories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      ...(image.path
        ? { image_path: image.path }
        : clearImage
          ? { image_path: null }
          : {}),
    })
    .eq("id", id);

  if (error) {
    await removeCategoryImage(supabase, image.path);
    return { error: describeSubcategory(t, error.message) };
  }

  if (image.path || clearImage) {
    await removeCategoryImage(supabase, existing?.image_path ?? null);
  }

  revalidateCategoryPages();
  redirect(`/categories/${parsed.data.categoryId}`);
}

export async function archiveSubcategory(formData: FormData) {
  const id = formData.get("id");
  const categoryId = formData.get("categoryId");
  if (typeof id !== "string" || typeof categoryId !== "string") return;

  const { supabase } = await session();
  await supabase
    .from("subcategories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  revalidateCategoryPages();
  redirect(`/categories/${categoryId}`);
}

export async function restoreSubcategory(formData: FormData) {
  const id = formData.get("id");
  const categoryId = formData.get("categoryId");
  if (typeof id !== "string" || typeof categoryId !== "string") return;

  const { supabase } = await session();
  await supabase
    .from("subcategories")
    .update({ archived_at: null })
    .eq("id", id);

  revalidateCategoryPages();
  redirect(`/categories/${categoryId}`);
}

/**
 * Re-runs the starter set. Useful after archiving things by mistake, and the
 * one-tap way for a fresh self-hosted install to get a usable tree.
 */
export async function seedDefaultCategories() {
  const { supabase, user } = await session();
  if (!user) return;

  // Acts on the caller only: the id comes from auth.uid() inside the function,
  // never from anything the browser can set.
  await supabase.rpc("restore_default_categories");

  revalidateCategoryPages();
  redirect("/categories");
}
