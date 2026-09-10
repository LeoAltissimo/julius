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
| `pnpm icons` | regenerates the PWA icons from `assets/icon-source.*` |

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

## Recording from a photo (MCP)

The app ships an [MCP](https://modelcontextprotocol.io) server at `/api/mcp`, so
an assistant can file a receipt for you: you photograph the till slip or the
card statement, the assistant reads it, and it books the entries.

The split of labour is deliberate. The model is the thing with eyes, so it does
the reading; the server does nothing but validate and write. There is no OCR
here and no guessing at categories — a tool call has to carry real ids fetched
from `list_finances` first.

Generate a token under **Settings → Agent access**, then point any MCP client at
the endpoint with the token as a bearer credential:

```json
{
  "mcpServers": {
    "julius": {
      "url": "https://your-deployment.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer julius_..." }
    }
  }
}
```

Phone and web connectors are configured through a form that offers OAuth fields
and nowhere to put a header, so there is a second route that carries the token
in the path — paste `https://your-deployment.vercel.app/api/mcp/julius_...` as
the URL and leave the OAuth fields empty. It is the fallback rather than the
default: URLs turn up in server logs in a way that `Authorization` values do
not. Anything that can send a header should use `/api/mcp`.

Tools: `list_finances`, `list_recent_transactions`, `record_transactions`,
`create_category`, `create_subcategory`, `update_category`, `move_subcategory`,
`merge_subcategories`, `archive_subcategory`, `archive_category`,
`create_account`, `update_account`, `archive_account`, `restore_account`,
`update_transaction`, `delete_transaction`,
`list_investments`, `add_investment`, `update_investment`,
`update_investment_values`, `archive_investment`, `restore_investment`,
`delete_investment`.

**Booking is not the whole job.** A receipt filed under the wrong category
needs a way back out, so `update_transaction` takes only the fields that
change — an absent field stays, an explicit `null` clears, which is why the
patch reaches the database as jsonb rather than as a column of nullable
arguments. `delete_transaction` is the irreversible one. On an instalment
purchase both are deliberately awkward: an edit touches only the instalment
you point at unless you pass `apply_to_series`, and a delete refuses outright
until you say whether you meant the instalment or the whole purchase. Guessing
there quietly destroys eleven rows nobody asked about.

**`list_recent_transactions` sums for you.** It narrows by date range,
category, subcategory and account, and returns the totals of everything
matching rather than of the page it returns — so "quanto gastei com jogos esse
mês" is one call instead of fetching every row and adding them up outside the
database. Spending and income are totalled apart.

An entry carries **how it was paid** — debit, credit, pix, cash, boleto,
transfer — alongside which account it moved through. A card is an account of
type `credit_card`, which is what makes a purchase on it bookable as credit and
what carries the limit, the statement days and the account that settles the
bill; so registering a card and registering a bank are the same call. Two rules
about the method live in the database rather than in each writer, because the
form and the API are two writers and a rule stated twice eventually disagrees
with itself: spending on a card is filled in as `credit` when nothing was said,
and `credit` on anything that is not a card is refused.

The patrimony is reachable the same way, which is what turns the periodic
ritual — open the app, retype what each position is worth today — into a
sentence: *"o Tesouro Selic está em R$ 12.480,30 e a carteira de ações em
R$ 8.115,00"*. Values written by an agent go through the same column update the
form uses, so the snapshot trigger appends to the history and the net worth
curve cannot tell the two apart. Removing a position means `archive_investment`
— it stops counting and leaves the app while its history stays, so the past
shape of the curve does not change under you; `delete_investment` is the
irreversible one, for a position opened by mistake.

Three things about it are worth knowing:

**No key in the deployment can cross accounts.** Every tool call passes the
token to a `security definer` database function that resolves the owner from
it, so the user id is never a parameter a caller controls. That is why the
deployment still holds nothing but the publishable key — there is no service
role key anywhere, and the route on its own can read and write exactly nothing.
Only the SHA-256 of a token is stored, so the row is useless to anyone reading
the database.

**Sending the same receipt twice is safe.** Entries take an `external_ref`; a
repeat is reported as a duplicate and ignored rather than booked again.

**Amounts come back formatted.** `record_transactions` echoes
`R$ 154,99` alongside what it wrote, because the one mistake that really hurts
is sending reais where cents were expected and booking a hundred times the
real value.

## Tests

The guarantees this app makes live in the database, so that is where the tests
are. `supabase/tests/api_entries.test.sql` runs the whole entry API against a
real Postgres — editing, deleting, instalment scope, the filters, the refusals,
and the isolation between two accounts — inside one transaction that is rolled
back at the end, so it leaves nothing behind and is safe to run twice.

```
pnpm db:start   # once
pnpm test:db
```

It uses plain `psql` and no extension, deliberately: the suite has to run
anywhere psql does, and pgTAP would be the heaviest thing in it. A failing
assertion aborts with `FAIL` and the name of what broke.

## Icons

The icons are committed, but the artwork they came from is not. `pnpm icons`
regenerates them from a local image or from `ICON_SOURCE_URL`, and falls back
to drawing a built-in mark — three ascending bars, rasterised with nothing but
`node:zlib` — when there is no artwork at all. See
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
