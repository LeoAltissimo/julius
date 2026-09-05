-- Julius core schema.
-- Money is stored as integer cents (bigint) so that no arithmetic ever touches
-- a floating point value, in the database or in the browser.

create extension if not exists "pgcrypto";

create type public.account_type as enum (
  'checking', 'savings', 'credit_card', 'cash', 'investment', 'other'
);

create type public.entry_kind as enum ('expense', 'income', 'transfer');

create type public.category_kind as enum ('expense', 'income');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  type public.account_type not null default 'checking',
  institution text check (institution is null or length(institution) <= 80),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text,
  opening_balance_cents bigint not null default 0,
  credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  statement_closing_day smallint check (statement_closing_day between 1 and 31),
  statement_due_day smallint check (statement_due_day between 1 and 31),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables carry a composite foreign key, which makes it structurally
  -- impossible to reference another user's account.
  unique (id, user_id)
);

create unique index accounts_user_name_key
  on public.accounts (user_id, lower(name))
  where archived_at is null;

create index accounts_user_sort_idx on public.accounts (user_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- categories / subcategories
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  description text check (description is null or length(description) <= 500),
  kind public.category_kind not null default 'expense',
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text,
  image_path text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index categories_user_name_key
  on public.categories (user_id, kind, lower(name))
  where archived_at is null;

create index categories_user_sort_idx on public.categories (user_id, sort_order, created_at);

create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  description text check (description is null or length(description) <= 500),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  icon text,
  image_path text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A subcategory can only ever hang off a macro category owned by the same user.
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict,
  unique (id, user_id),
  -- Lets entries prove that the chosen subcategory really lives inside the
  -- chosen macro category.
  unique (id, category_id)
);

create unique index subcategories_category_name_key
  on public.subcategories (category_id, lower(name))
  where archived_at is null;

create index subcategories_user_category_idx
  on public.subcategories (user_id, category_id, sort_order);

-- ---------------------------------------------------------------------------
-- entries (expenses, income, transfers)
-- ---------------------------------------------------------------------------

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.entry_kind not null,
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  description text not null default '' check (length(description) <= 200),
  notes text check (notes is null or length(notes) <= 2000),

  account_id uuid not null,
  counter_account_id uuid,

  category_id uuid,
  subcategory_id uuid,

  installment_group_id uuid,
  installment_number smallint check (installment_number >= 1),
  installment_total smallint check (installment_total >= 2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  foreign key (counter_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict,
  foreign key (subcategory_id, user_id)
    references public.subcategories (id, user_id) on delete restrict,
  foreign key (subcategory_id, category_id)
    references public.subcategories (id, category_id) on delete restrict,

  -- A transfer moves money between two of your own accounts, so it has a
  -- counterpart account and never a category: it is not spending.
  constraint entries_transfer_shape check (
    case kind
      when 'transfer' then
        counter_account_id is not null
        and counter_account_id <> account_id
        and category_id is null
        and subcategory_id is null
      else
        counter_account_id is null
    end
  ),
  constraint entries_subcategory_needs_category check (
    subcategory_id is null or category_id is not null
  ),
  constraint entries_installment_shape check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (installment_group_id is not null and installment_number is not null
        and installment_total is not null and installment_number <= installment_total)
  )
);

create index entries_user_date_idx on public.entries (user_id, occurred_on desc, created_at desc);
create index entries_user_kind_date_idx on public.entries (user_id, kind, occurred_on desc);
create index entries_category_idx on public.entries (user_id, category_id, occurred_on desc);
create index entries_subcategory_idx on public.entries (user_id, subcategory_id, occurred_on desc);
create index entries_account_idx on public.entries (user_id, account_id, occurred_on desc);
create index entries_installment_group_idx on public.entries (installment_group_id)
  where installment_group_id is not null;

-- ---------------------------------------------------------------------------
-- investments
-- ---------------------------------------------------------------------------

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  institution text check (institution is null or length(institution) <= 80),
  kind text check (kind is null or length(kind) <= 40),
  notes text check (notes is null or length(notes) <= 2000),
  color text not null default '#0f766e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  current_value_cents bigint not null default 0 check (current_value_cents >= 0),
  value_updated_at timestamptz not null default now(),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index investments_user_name_key
  on public.investments (user_id, lower(name))
  where archived_at is null;

create index investments_user_sort_idx on public.investments (user_id, sort_order, created_at);

-- Every value edit is appended here, which is what turns a list of balances you
-- update by hand into a net worth curve over time.
create table public.investment_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  investment_id uuid not null,
  value_cents bigint not null check (value_cents >= 0),
  recorded_at timestamptz not null default now(),
  foreign key (investment_id, user_id)
    references public.investments (id, user_id) on delete cascade
);

create index investment_snapshots_investment_idx
  on public.investment_snapshots (investment_id, recorded_at desc);

create index investment_snapshots_user_idx
  on public.investment_snapshots (user_id, recorded_at desc);
