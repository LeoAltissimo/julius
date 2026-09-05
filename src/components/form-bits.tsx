"use client";

import { useState } from "react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/images";

/**
 * A fixed palette keeps the dashboard readable: every colour here holds up
 * against both the light and the dark background, and none of them collide.
 */
export const PALETTE = [
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0f766e",
  "#64748b",
] as const;

export function ColorPicker({
  name,
  defaultValue = PALETTE[0],
}: {
  name: string;
  defaultValue?: string;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(defaultValue);

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-text-muted">
        {t.categoryForm.color}
      </span>
      <div
        role="radiogroup"
        aria-label={t.categoryForm.color}
        className="flex flex-wrap gap-2"
      >
        {PALETTE.map((color) => {
          const selected = value.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.categoryForm.colorOption(color)}
              onClick={() => setValue(color)}
              className={cn(
                "size-8 rounded-full transition-transform",
                selected
                  ? "ring-2 ring-text ring-offset-2 ring-offset-surface-2"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function ImageField({
  name,
  currentUrl,
}: {
  name: string;
  currentUrl?: string | null;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);

  const shown = preview ?? (remove ? null : (currentUrl ?? null));

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-text-muted">
        {t.categoryForm.image}
      </span>

      <div className="flex items-center gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-3">
          {shown ? (
            /* A signed storage URL or a local blob: preview — neither is a
               candidate for the image optimiser, so this stays a plain img. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-[10px] text-text-faint">
              {t.categoryForm.noImage}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <input
            type="file"
            name={name}
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
              if (file) setRemove(false);
            }}
            className="max-w-full text-xs text-text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-xs file:text-text"
          />
          <span className="text-[11px] text-text-faint">
            {t.categoryForm.imageHint}
          </span>

          {currentUrl ? (
            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              <input
                type="checkbox"
                name="removeImage"
                checked={remove}
                onChange={(event) => {
                  setRemove(event.target.checked);
                  if (event.target.checked) setPreview(null);
                }}
              />
              {t.categoryForm.removeImage}
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
