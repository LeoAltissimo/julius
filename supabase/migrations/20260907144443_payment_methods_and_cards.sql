-- How a purchase was paid, and which bank stands behind a card.
--
-- The app already models a credit card as an account: type 'credit_card', with
-- a limit and statement days, listed under its own heading. That is the right
-- shape -- a card is a place money moves through, and a purchase on it is debt
-- on that card -- so this does not add a second table to register cards in.
-- What was genuinely missing is two things.
--
-- First, the *method*: an entry knew which account it moved through but not
-- whether that was debit, credit, pix or cash. "Quanto gastei no crédito" was
-- unanswerable.
--
-- Second, the link from a card to the account that settles it. Knowing a
-- purchase was on the Nubank card is only half the answer if nothing records
-- which account pays that card's bill.

-- ---------------------------------------------------------------------------
-- payment_method
-- ---------------------------------------------------------------------------

create type public.payment_method as enum (
  'debit', 'credit', 'pix', 'cash', 'boleto', 'transfer', 'other'
);

-- Nullable on purpose: every entry booked before today predates the concept,
-- and inventing a method for them would be inventing data.
alter table public.entries
  add column payment_method public.payment_method;

create index entries_user_method_idx
  on public.entries (user_id, payment_method, occurred_on desc)
  where payment_method is not null;

-- ---------------------------------------------------------------------------
-- which account pays a card's bill
-- ---------------------------------------------------------------------------

alter table public.accounts
  add column settlement_account_id uuid;

-- The composite foreign key is what makes it structurally impossible to point
-- a card at somebody else's bank account, the same guarantee entries already
-- carry. On delete set null rather than restrict: losing the bank account
-- should not lock the card.
alter table public.accounts
  add constraint accounts_settlement_account_id_user_id_fkey
  foreign key (settlement_account_id, user_id)
  references public.accounts (id, user_id) on delete set null;

alter table public.accounts
  add constraint accounts_settlement_not_self
  check (settlement_account_id is null or settlement_account_id <> id);

-- ---------------------------------------------------------------------------
-- The rules, in the database rather than in each writer
-- ---------------------------------------------------------------------------

-- There are two write paths into entries -- the app's form and the api_*
-- functions an agent calls -- and a rule enforced in both is a rule that will
-- eventually disagree with itself. So it lives here, once.

-- Two rules about the method, in one place because there are two writers.
create or replace function public.set_entry_payment_method()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Spending booked against a credit card is a credit purchase; there is no
  -- other thing it could be. Filling it in here rather than in each writer is
  -- what keeps the app's form and the agent's API call from drifting apart.
  if new.payment_method is null
     and new.kind = 'expense'::public.entry_kind
     and exists (
       select 1 from public.accounts a
       where a.id = new.account_id
         and a.type = 'credit_card'::public.account_type
     )
  then
    new.payment_method := 'credit'::public.payment_method;
  end if;

  -- And the converse: paying by credit means paying with a credit card.
  if new.payment_method = 'credit'::public.payment_method
     and not exists (
       select 1 from public.accounts a
       where a.id = new.account_id
         and a.type = 'credit_card'::public.account_type
     )
  then
    raise exception 'credit_needs_card' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.set_entry_payment_method() from public, anon, authenticated;

create trigger entries_set_payment_method
  before insert or update of payment_method, account_id, kind on public.entries
  for each row execute function public.set_entry_payment_method();

-- A settlement account belongs to a card, and is never itself a card: a card
-- cannot pay a card.
create or replace function public.check_account_settlement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type <> 'credit_card'::public.account_type then
    raise exception 'settlement_only_on_card' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.accounts a
    where a.id = new.settlement_account_id
      and a.type = 'credit_card'::public.account_type
  ) then
    raise exception 'settlement_cannot_be_card' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.check_account_settlement() from public, anon, authenticated;

create trigger accounts_check_settlement
  before insert or update of settlement_account_id, type on public.accounts
  for each row
  when (new.settlement_account_id is not null)
  execute function public.check_account_settlement();

-- ---------------------------------------------------------------------------
-- Registering banks and cards over the API
-- ---------------------------------------------------------------------------

-- Idempotent on the name, like its neighbours: an agent asking for "Nubank"
-- when "Nubank" is already there lands on the existing account instead of
-- opening a second one, which would split every balance in two.
create or replace function public.api_upsert_account(
  p_token text,
  p_name text,
  p_type text default 'checking',
  p_institution text default null,
  p_color text default null,
  p_opening_balance_cents bigint default null,
  p_credit_limit_cents bigint default null,
  p_statement_closing_day smallint default null,
  p_statement_due_day smallint default null,
  p_settlement_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_id uuid;
  v_name text;
  v_type public.account_type;
  v_was_archived boolean;
  v_created boolean := false;
  v_is_card boolean;
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'account name is required' using errcode = '22023';
  end if;

  v_type := p_type::public.account_type;
  v_is_card := v_type = 'credit_card'::public.account_type;

  -- A limit and statement days only mean something on a card; carrying them on
  -- a chequing account would be noise the forms then have to hide.
  if not v_is_card and (p_credit_limit_cents is not null
                        or p_statement_closing_day is not null
                        or p_statement_due_day is not null
                        or p_settlement_account_id is not null) then
    raise exception 'card_fields_on_non_card' using errcode = '22023';
  end if;

  select a.id, a.archived_at is not null into v_id, v_was_archived
  from public.accounts a
  where a.user_id = v_user and lower(a.name) = lower(btrim(p_name))
  order by a.archived_at nulls first
  limit 1;

  if v_id is null then
    insert into public.accounts (
      user_id, name, type, institution, color, opening_balance_cents,
      credit_limit_cents, statement_closing_day, statement_due_day,
      settlement_account_id, sort_order
    )
    values (
      v_user, btrim(p_name), v_type,
      nullif(btrim(coalesce(p_institution, '')), ''),
      coalesce(p_color, '#64748b'),
      coalesce(p_opening_balance_cents, 0),
      case when v_is_card then coalesce(p_credit_limit_cents, 0) end,
      case when v_is_card then p_statement_closing_day end,
      case when v_is_card then p_statement_due_day end,
      case when v_is_card then p_settlement_account_id end,
      coalesce((select max(sort_order) + 10 from public.accounts
                where user_id = v_user), 0)
    )
    returning id into v_id;
    v_created := true;
  else
    update public.accounts
    set archived_at = null,
        type = v_type,
        institution = case
          when p_institution is null then institution
          else nullif(btrim(p_institution), '')
        end,
        color = coalesce(p_color, color),
        opening_balance_cents = coalesce(p_opening_balance_cents,
                                         opening_balance_cents),
        credit_limit_cents = case when v_is_card
          then coalesce(p_credit_limit_cents, credit_limit_cents) end,
        statement_closing_day = case when v_is_card
          then coalesce(p_statement_closing_day, statement_closing_day) end,
        statement_due_day = case when v_is_card
          then coalesce(p_statement_due_day, statement_due_day) end,
        settlement_account_id = case when v_is_card
          then coalesce(p_settlement_account_id, settlement_account_id) end
    where id = v_id and user_id = v_user;
  end if;

  select name, type into v_name, v_type
  from public.accounts where id = v_id;

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'type', v_type,
    'created', v_created,
    'restored', coalesce(v_was_archived, false)
  );
end;
$$;

create or replace function public.api_update_account(
  p_token text,
  p_id uuid,
  p_name text default null,
  p_type text default null,
  p_institution text default null,
  p_color text default null,
  p_credit_limit_cents bigint default null,
  p_statement_closing_day smallint default null,
  p_statement_due_day smallint default null,
  p_settlement_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_type public.account_type;
  v_is_card boolean;
begin
  select coalesce(p_type::public.account_type, a.type) into v_type
  from public.accounts a
  where a.id = p_id and a.user_id = v_user;

  if v_type is null then
    raise exception 'unknown_account' using errcode = '23503';
  end if;

  v_is_card := v_type = 'credit_card'::public.account_type;

  update public.accounts
  set name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
      type = v_type,
      institution = case
        when p_institution is null then institution
        else nullif(btrim(p_institution), '')
      end,
      color = coalesce(p_color, color),
      -- Turning a card into a chequing account drops the card-only fields
      -- rather than leaving a limit hanging off something with no bill.
      credit_limit_cents = case when v_is_card
        then coalesce(p_credit_limit_cents, credit_limit_cents) end,
      statement_closing_day = case when v_is_card
        then coalesce(p_statement_closing_day, statement_closing_day) end,
      statement_due_day = case when v_is_card
        then coalesce(p_statement_due_day, statement_due_day) end,
      settlement_account_id = case when v_is_card
        then coalesce(p_settlement_account_id, settlement_account_id) end
  where id = p_id and user_id = v_user;

  return jsonb_build_object('id', p_id, 'updated', true, 'type', v_type);
end;
$$;

create or replace function public.api_archive_account(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_name text;
begin
  update public.accounts set archived_at = now()
  where id = p_id and user_id = v_user and archived_at is null
  returning name into v_name;

  if v_name is null then
    if not exists (select 1 from public.accounts
                   where id = p_id and user_id = v_user) then
      raise exception 'unknown_account' using errcode = '23503';
    end if;
    select name into v_name from public.accounts where id = p_id;
  end if;

  return jsonb_build_object('id', p_id, 'name', v_name, 'archived', true);
end;
$$;

create or replace function public.api_restore_account(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_name text;
begin
  update public.accounts set archived_at = null
  where id = p_id and user_id = v_user
  returning name into v_name;

  if v_name is null then
    raise exception 'unknown_account' using errcode = '23503';
  end if;

  return jsonb_build_object('id', p_id, 'name', v_name, 'archived', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking with a method
-- ---------------------------------------------------------------------------

create or replace function public.api_create_entries(p_token text, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_entry jsonb;
  v_created jsonb := '[]'::jsonb;
  v_duplicates jsonb := '[]'::jsonb;
  v_installments integer;
  v_amount bigint;
  v_base bigint;
  v_remainder bigint;
  v_cents bigint;
  v_ref text;
  v_row_ref text;
  v_date date;
  v_id uuid;
  v_account uuid;
  v_method public.payment_method;
  i integer;
begin
  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries must be an array' using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_amount := (v_entry ->> 'amount_cents')::bigint;
    v_installments := greatest(coalesce((v_entry ->> 'installments')::integer, 1), 1);
    v_date := (v_entry ->> 'occurred_on')::date;
    v_ref := nullif(btrim(coalesce(v_entry ->> 'external_ref', '')), '');
    v_account := (v_entry ->> 'account_id')::uuid;
    v_method := nullif(btrim(coalesce(v_entry ->> 'payment_method', '')), '')
                  ::public.payment_method;

    -- Instalments are only meaningful on spending.
    if (v_entry ->> 'kind') <> 'expense' then
      v_installments := 1;
    end if;

    v_base := v_amount / v_installments;
    v_remainder := v_amount - v_base * v_installments;

    for i in 1..v_installments loop
      v_cents := v_base + case when i <= v_remainder then 1 else 0 end;
      v_row_ref := case
        when v_ref is null then null
        when v_installments = 1 then v_ref
        else v_ref || '#' || i
      end;

      begin
        insert into public.entries (
          user_id, kind, amount_cents, occurred_on, description, notes,
          account_id, counter_account_id, category_id, subcategory_id,
          installment_group_id, installment_number, installment_total,
          payment_method, source, external_ref
        )
        values (
          v_user,
          (v_entry ->> 'kind')::public.entry_kind,
          v_cents,
          (v_date + ((i - 1) || ' month')::interval)::date,
          coalesce(v_entry ->> 'description', ''),
          nullif(btrim(coalesce(v_entry ->> 'notes', '')), ''),
          v_account,
          nullif(v_entry ->> 'counter_account_id', '')::uuid,
          nullif(v_entry ->> 'category_id', '')::uuid,
          nullif(v_entry ->> 'subcategory_id', '')::uuid,
          case when v_installments > 1 then
            coalesce(nullif(v_entry ->> 'installment_group_id', '')::uuid, gen_random_uuid())
          end,
          case when v_installments > 1 then i end,
          case when v_installments > 1 then v_installments end,
          v_method,
          'api',
          v_row_ref
        )
        returning id into v_id;

        v_created := v_created || to_jsonb(v_id);
      exception
        when unique_violation then
          v_duplicates := v_duplicates || to_jsonb(v_row_ref);
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'created', jsonb_array_length(v_created),
    'ids', v_created,
    'duplicates_ignored', v_duplicates
  );
end;
$$;

create or replace function public.api_recent_entries(p_token text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'kind', e.kind,
      'amount_cents', e.amount_cents,
      'occurred_on', to_char(e.occurred_on, 'YYYY-MM-DD'),
      'description', e.description,
      'category', c.name,
      'subcategory', s.name,
      'account', a.name,
      'account_type', a.type,
      'payment_method', e.payment_method,
      'source', e.source,
      'external_ref', e.external_ref
    ) order by e.occurred_on desc, e.created_at desc)
    from (
      select * from public.entries
      where user_id = v_user
      order by occurred_on desc, created_at desc
      limit least(greatest(coalesce(p_limit, 20), 1), 200)
    ) e
    left join public.categories c on c.id = e.category_id
    left join public.subcategories s on s.id = e.subcategory_id
    left join public.accounts a on a.id = e.account_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- The snapshot learns about cards
-- ---------------------------------------------------------------------------

-- Accounts now carry enough for an agent to tell a card from a bank without a
-- second call: the type, the limit, the statement days, and which account
-- settles the bill. The list of methods rides along so it never has to guess
-- at the spelling of an enum it cannot see.
create or replace function public.api_snapshot(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
begin
  return jsonb_build_object(
    'today', to_char(current_date, 'YYYY-MM-DD'),
    'currency', 'BRL',
    'payment_methods', to_jsonb(enum_range(null::public.payment_method)),
    'account_types', to_jsonb(enum_range(null::public.account_type)),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'type', a.type,
        'institution', a.institution,
        'is_card', a.type = 'credit_card'::public.account_type,
        'credit_limit_cents', a.credit_limit_cents,
        'statement_closing_day', a.statement_closing_day,
        'statement_due_day', a.statement_due_day,
        'settlement_account_id', a.settlement_account_id
      ) order by a.sort_order, a.name)
      from public.accounts a
      where a.user_id = v_user and a.archived_at is null
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'kind', c.kind,
        'description', c.description,
        'subcategories', coalesce((
          select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name)
                           order by s.sort_order, s.name)
          from public.subcategories s
          where s.category_id = c.id and s.archived_at is null
        ), '[]'::jsonb)
      ) order by c.kind, c.sort_order, c.name)
      from public.categories c
      where c.user_id = v_user and c.archived_at is null
    ), '[]'::jsonb),
    'investments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name,
        'current_value_cents', i.current_value_cents
      ) order by i.sort_order, i.name)
      from public.investments i
      where i.user_id = v_user and i.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.api_upsert_account(text, text, text, text, text, bigint, bigint, smallint, smallint, uuid)',
    'public.api_update_account(text, uuid, text, text, text, text, bigint, smallint, smallint, uuid)',
    'public.api_archive_account(text, uuid)',
    'public.api_restore_account(text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('grant execute on function %s to anon, authenticated', v_fn);
  end loop;
end;
$$;
