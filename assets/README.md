# assets

The generated icons in `public/icons/` and `src/app/icon.png` are committed, so
a clone and a deploy both get the real icon with no extra setup. Regenerating
them is a deliberate step, never something the build does behind your back —
otherwise a fork without the source artwork would silently overwrite the
committed icons with the fallback mark.

```bash
pnpm icons                    # uses assets/icon-source.* or ICON_SOURCE_URL
pnpm icons path/to/image.png  # or point it straight at a file
```

The script finds artwork in this order:

1. **A local file** — `icon-source.png`, `.jpg` or `.webp` in this folder.
   Gitignored, so the original never enters the repository even though the
   icons derived from it do.
2. **`ICON_SOURCE_URL`** — a URL the script downloads. Useful if you would
   rather keep the artwork off your machine. If the fetch fails it warns and
   falls back rather than breaking anything.
3. **Neither** — it draws the built-in mark: three ascending bars in the app's
   accent colour, rasterised by hand with nothing but `node:zlib`.

It crops a square around the subject of the image — on a portrait that is the
face — and writes every size the PWA needs. For the maskable variant it insets
the artwork and fills the margin with the image's own dominant colour, so the
icon still reads as one tile after a launcher crops it to a circle.

A note if you fork this: the icon shipped here is fan art of a television
character, kept for a personal deployment. Swap in your own before doing
anything public-facing with it.
