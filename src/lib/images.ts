import type { Messages } from "@/i18n/messages";

import type { Client } from "./queries";

export const CATEGORY_IMAGE_BUCKET = "category-images";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export type ImageUploadResult =
  | { ok: true; path: string | null }
  | { ok: false; error: string };

/**
 * Stores an uploaded image under the owner's folder, which is what the storage
 * policies key off. Returns null when no file was chosen, so callers can tell
 * "leave the current image alone" apart from "here is a new one".
 */
export async function uploadCategoryImage(
  supabase: Client,
  userId: string,
  file: FormDataEntryValue | null,
  t: Messages,
): Promise<ImageUploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: true, path: null };
  }

  if (
    !ACCEPTED_IMAGE_TYPES.includes(file.type) ||
    file.size > MAX_IMAGE_BYTES
  ) {
    return { ok: false, error: t.categoryForm.imageHint };
  }

  const extension = EXTENSIONS[file.type] ?? "png";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(CATEGORY_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return { ok: false, error: t.categoryForm.saveCategoryFailed };
  }

  return { ok: true, path };
}

export async function removeCategoryImage(
  supabase: Client,
  path: string | null,
) {
  if (!path) return;
  await supabase.storage.from(CATEGORY_IMAGE_BUCKET).remove([path]);
}

/**
 * The bucket is private, so images are read through short lived signed URLs.
 * One batched call covers a whole screen of categories.
 */
export async function signImagePaths(
  supabase: Client,
  paths: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => !!path))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.storage
    .from(CATEGORY_IMAGE_BUCKET)
    .createSignedUrls(unique, 60 * 60);

  if (error || !data) return new Map();

  const signed = new Map<string, string>();
  for (const item of data) {
    if (item.signedUrl && item.path) signed.set(item.path, item.signedUrl);
  }
  return signed;
}
