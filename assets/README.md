# assets

The app icons are generated, never committed. `pnpm icons` runs as part of both
`pnpm dev` and `pnpm build`, so they always exist by the time anything needs
them, and the repository never redistributes artwork.

There are three ways it finds artwork, in order:

1. **A local file.** Drop `icon-source.png`, `icon-source.jpg` or
   `icon-source.webp` in this folder. Gitignored.
2. **`ICON_SOURCE_URL`.** Set it to a URL holding the image and the build
   downloads it. This is how a personal deployment gets its own icon without
   the image living in a public repository — put the file anywhere you can
   serve it from, such as a public bucket in your own Supabase Storage.
3. **Neither.** It draws the built-in mark: three ascending bars, in the app's
   accent colour. No image dependency, no rights to worry about. This is what a
   fresh clone or a fork gets.

```bash
pnpm icons                    # uses whichever of the above applies
pnpm icons path/to/image.png  # or point it straight at a file
```

The script crops a square around the subject of the image — on a portrait that
is the face — and writes every size the PWA needs into `public/icons/`, plus
the favicon at `src/app/icon.png`. For the maskable variant it insets the
artwork and fills the margin with the image's own dominant colour, so the icon
still reads as one tile after a launcher crops it to a circle.
