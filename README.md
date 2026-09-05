# Julius

Personal finance tracking: where every real went this month, next to where it
went last month. It is a PWA — install it to the home screen on iOS or Android
and it opens like an app, no store involved.

Built to be self-hosted: you run it against **your** Supabase project, and the
data stays yours.

> The interface is in Brazilian Portuguese, because it is built around
> Brazilian habits — instalments on a credit card, `R$ 1.234,56` number
> formatting. The code, comments and docs are in English.

## What it does

- **Expenses and income** filed under two levels: a macro category (Housing,
  Food, Health…) and a subcategory inside it (Rent, iFood, Therapist…). Both
  levels take a title, a description, a colour and an image.
- **Comparison dashboard**: this month's total against last month's, categories
  ranked by spend with each one's change, drill-down into subcategories, and a
  pace chart of the running total day by day against the previous month — so
  you can notice a month going wrong while there is still time to act.
- **Instalments**: a purchase in 12x becomes twelve dated entries, one per
  month. The month you happened to buy in does not absorb the whole amount, so
  the dashboard does not lie.
- **Accounts and credit cards** with balances computed in the database. Moving
  money between your own accounts is a transfer, and never counts as spending.
- **Net worth**: positions you update by hand every so often (`Nubank savings`,
  `Crypto`, …), summed into a total. Every value change is appended to a
  history, which draws the net worth curve without you recording anything else.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 ·
Supabase (Postgres + Auth + Storage + RLS) · Recharts.

Frontend on Vercel, database on Supabase — both on free tiers.

## Running locally

You need Node 20+, pnpm and Docker (for the local Supabase stack).

```bash
pnpm install
pnpm db:start
```

`db:start` boots Postgres, applies the migrations and prints the local keys.
Copy `.env.example` to `.env.local` and fill in the `API_URL` and `ANON_KEY` it
printed. Then:

```bash
pnpm dev
```

The app comes up on <http://localhost:3100>. Create an account on the login
screen — a first sign-in ships with a "Carteira" cash account and a starter set
of categories, all editable.

| Command | What it does |
| --- | --- |
| `pnpm check` | lint + typecheck + build (run before committing) |
| `pnpm db:reset` | rebuilds the local database from scratch |
| `pnpm db:types` | regenerates the TypeScript types from the schema |
| `pnpm icons` | regenerates the PWA icons (also runs on `dev` and `build`) |

## Language

The interface ships in Brazilian Portuguese and English, switchable under
Settings. Portuguese is the default, and the choice is kept in a cookie.

Strings live in [`src/i18n/messages`](src/i18n/messages). `pt-BR.ts` is the
source catalogue and `en.ts` is typed against it, so adding a key without
translating it is a compile error rather than a string that quietly appears in
the wrong language. Messages that take a value are functions instead of
templates with placeholders, which gets the arguments type-checked too.

Amounts stay in reais in both languages — this is a Brazilian app, and
translating the currency would be translating the money. Only the separators
and the date wording follow the locale.

## Icons

App icons are generated rather than committed, so the repository never
redistributes artwork. A clone gets a built-in mark drawn by the script; a
personal deployment can point `ICON_SOURCE_URL` at its own image. See
[`assets/README.md`](assets/README.md).

## About the keys

Two variables, both public by nature:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

These ship to the browser **by design** — that is how Supabase works. They are
not secrets and they protect nothing on their own.

What protects the data is **row level security**: every table has RLS enabled
with policies tying each row to its owner's `auth.uid()`, and table privileges
are granted explicitly in
[`20260905162146_table_grants.sql`](supabase/migrations/20260905162146_table_grants.sql)
— only what the app needs, and never `TRUNCATE`, which RLS does not filter.

The one thing that must never leak is the **service role key**: it bypasses RLS
entirely. It is not used anywhere in this app and should not appear in any
`.env` here. Every `.env*` file is gitignored except `.env.example`.

## Decisions worth knowing about

**Money is an integer number of cents.** No amount ever passes through a
floating point value, in the database or in the browser. `R$ 0,10 + R$ 0,20` is
exactly `R$ 0,30`, and a R$ 1,000 purchase split three ways becomes
333.34 + 333.33 + 333.33 — no cent lost.

**The guarantees live in the database, not only in the form.** Composite
foreign keys make it structurally impossible to point at another user's account
or category, and a constraint enforces that a subcategory is only ever used
inside the macro category it belongs to. A frontend bug cannot write
inconsistent data.

**Categories are archived, not deleted.** Old entries keep pointing at them, so
last year's reports do not quietly change shape.

**The service worker never caches HTML.** It caches build assets and the
offline page, nothing else. Pages here are rendered per user behind a session,
and a cached page on a borrowed or stolen phone would be a way to read
someone's finances without signing in.

## License

[MIT](LICENSE).
