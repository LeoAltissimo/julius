-- Correcting what was already booked.
--
-- The API could create entries and read them back, and that was the whole of
-- it: a receipt filed under the wrong category, at the wrong amount or against
-- the wrong account had no way back out. This adds the editing half, plus the
-- filters that turn "quanto gastei com jogos esse mês" from "fetch everything
-- and add it up by hand" into one call.

-- ---------------------------------------------------------------------------
-- A rule the form knew and the database did not
-- ---------------------------------------------------------------------------

-- The entry form only ever offers categories matching the kind being booked,
-- so income never lands in a spending category. That was a property of one
-- screen, not of the data: api_create_entries never checked it, and neither
-- could an edit. Raising it into a trigger is what makes it true of every
-- writer, which is the same argument the payment method rules already make.
create or replace function public.check_entry_category_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_category_kind public.category_kind;
begin
  select c.kind into v_category_kind
  from public.categories c
  where c.id = new.category_id;

  if v_category_kind is not null
     and v_category_kind::text <> new.kind::text then
    raise exception 'category_kind_mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.check_entry_category_kind() from public, anon, authenticated;

create trigger entries_check_category_kind
  before insert or update of category_id, kind on public.entries
  for each row
  when (new.category_id is not null)
  execute function public.check_entry_category_kind();

-- ---------------------------------------------------------------------------
-- A card purchase is a credit purchase, now without exception
-- ---------------------------------------------------------------------------

-- Redefined: the old version only filled the method in when none was given,
-- which left 'debit' on a credit card standing if someone said so outright.
-- A credit_card account has no other way to be spent from, so the method is
-- now settled by the account rather than merely defaulted from it.
create or replace function public.set_entry_payment_method()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_card boolean;
begin
  select a.type = 'credit_card'::public.account_type into v_is_card
  from public.accounts a
  where a.id = new.account_id;

  -- Spending against a card is credit, whatever was said. Reporting the
  -- coercion is the caller's job; refusing it would only make an agent guess
  -- twice at something the account already answers.
  if coalesce(v_is_card, false)
     and new.kind = 'expense'::public.entry_kind then
    new.payment_method := 'credit'::public.payment_method;
  end if;

  -- And the converse: paying by credit means paying with a credit card.
  if new.payment_method = 'credit'::public.payment_method
     and not coalesce(v_is_card, false) then
    raise exception 'credit_needs_card' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.set_entry_payment_method() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One entry, resolved
-- ---------------------------------------------------------------------------

-- Ids are what a tool call needs and names are what a person reads, so every
-- entry that comes back out carries both. Shared so that the list and the edit
-- cannot drift into describing the same row differently.
create or replace function public.entry_as_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'kind', e.kind,
    'amount_cents', e.amount_cents,
    'occurred_on', to_char(e.occurred_on, 'YYYY-MM-DD'),
    'description', e.description,
    'notes', e.notes,
    'account_id', e.account_id,
    'account', a.name,
    'account_type', a.type,
    'counter_account_id', e.counter_account_id,
    'counter_account', ca.name,
    'category_id', e.category_id,
    'category', c.name,
    'subcategory_id', e.subcategory_id,
    'subcategory', s.name,
    'payment_method', e.payment_method,
    'installment_group_id', e.installment_group_id,
    'installment_number', e.installment_number,
    'installment_total', e.installment_total,
    'source', e.source,
    'external_ref', e.external_ref
  )
  from public.entries e
  left join public.accounts a on a.id = e.account_id
  left join public.accounts ca on ca.id = e.counter_account_id
  left join public.categories c on c.id = e.category_id
  left join public.subcategories s on s.id = e.subcategory_id
  where e.id = p_id;
$$;

revoke all on function public.entry_as_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- An instalment plan that was never a plan
-- ---------------------------------------------------------------------------

-- api_create_entries has always computed the group id *inside* the per-row
-- loop, so gen_random_uuid() ran once per instalment and every row of a twelve
-- month purchase got a group of its own. Nothing noticed, because nothing had
-- ever asked a series a question -- until apply_to_series and delete_series,
-- which are about exactly that group. Booked through the app the id is drawn
-- once in TypeScript, so only the API path was ever affected.
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
  v_group uuid;
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

    -- Drawn once per purchase, which is the whole fix: it is the thing that
    -- makes twelve rows one thing.
    v_group := case when v_installments > 1 then
      coalesce(nullif(v_entry ->> 'installment_group_id', '')::uuid, gen_random_uuid())
    end;

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
          v_group,
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

-- Repairing what the old version scattered. A purchase is recognisable by the
-- rows sharing an owner, a description, an account, an instalment total and a
-- creation timestamp -- they were written by one statement, so now() gave them
-- all the same instant. Only groups holding a single row of a multi-instalment
-- purchase are touched, which is precisely the broken shape and nothing else.
--
-- A function rather than a bare statement so the suite can scatter a series on
-- purpose and watch it come back together; on a database that never booked
-- instalments through the API it changes no rows.
create or replace function public.repair_installment_groups()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_repaired integer;
begin
  with scattered as (
    select e.id,
           first_value(e.installment_group_id) over (
             partition by e.user_id, e.description, e.account_id,
                          e.installment_total, e.created_at
             order by e.installment_number
           ) as repaired
    from public.entries e
    where e.installment_group_id is not null
      and e.installment_total > 1
      and 1 = (select count(*) from public.entries o
               where o.installment_group_id = e.installment_group_id)
  )
  update public.entries e
  set installment_group_id = s.repaired
  from scattered s
  where e.id = s.id and e.installment_group_id is distinct from s.repaired;

  get diagnostics v_repaired = row_count;
  return v_repaired;
end;
$$;

revoke all on function public.repair_installment_groups() from public, anon, authenticated;

do $$
declare
  v_repaired integer := public.repair_installment_groups();
begin
  if v_repaired > 0 then
    raise notice 'reunidas % parcelas em suas séries', v_repaired;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Editing
-- ---------------------------------------------------------------------------

-- The patch arrives as jsonb rather than as a column of arguments for one
-- reason: a key that is absent and a key explicitly set to null have to mean
-- different things. "Leave the category alone" and "this purchase has no
-- category" are both ordinary requests, and a nullable argument cannot tell
-- them apart. `p_patch ? 'category_id'` can.
create or replace function public.api_update_entry(
  p_token text,
  p_id uuid,
  p_patch jsonb,
  p_apply_to_series boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_group uuid;
  v_from_date date;
  v_ids uuid[];
  v_series boolean;
  v_count integer;
  v_amount bigint;
  v_base bigint;
  v_remainder bigint;
  v_date date;
  v_shift integer;
  v_asked text;
  v_got text;
  i integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be an object' using errcode = '22023';
  end if;

  select e.installment_group_id, e.occurred_on into v_group, v_from_date
  from public.entries e
  where e.id = p_id and e.user_id = v_user;

  if v_from_date is null then
    raise exception 'unknown_entry' using errcode = '23503';
  end if;

  v_series := coalesce(p_apply_to_series, false) and v_group is not null;

  -- Ordered, because splitting an amount and shifting dates both depend on
  -- which instalment is which.
  if v_series then
    select array_agg(e.id order by e.installment_number, e.occurred_on, e.id)
      into v_ids
    from public.entries e
    where e.installment_group_id = v_group and e.user_id = v_user;
  else
    v_ids := array[p_id];
  end if;

  v_count := coalesce(array_length(v_ids, 1), 0);

  -- Everything except the amount and the date means the same thing on one row
  -- as on twelve, so it is one statement. Naming every column in the SET list
  -- is deliberate: that is what arms the triggers that own the payment method
  -- and category rules.
  update public.entries e
  set kind = case when p_patch ? 'kind'
        then (p_patch ->> 'kind')::public.entry_kind else e.kind end,
      description = case when p_patch ? 'description'
        then coalesce(p_patch ->> 'description', '') else e.description end,
      notes = case when p_patch ? 'notes'
        then nullif(btrim(coalesce(p_patch ->> 'notes', '')), '') else e.notes end,
      account_id = case when p_patch ? 'account_id'
        then (p_patch ->> 'account_id')::uuid else e.account_id end,
      counter_account_id = case when p_patch ? 'counter_account_id'
        then nullif(p_patch ->> 'counter_account_id', '')::uuid
        else e.counter_account_id end,
      category_id = case when p_patch ? 'category_id'
        then nullif(p_patch ->> 'category_id', '')::uuid else e.category_id end,
      subcategory_id = case when p_patch ? 'subcategory_id'
        then nullif(p_patch ->> 'subcategory_id', '')::uuid
        else e.subcategory_id end,
      payment_method = case when p_patch ? 'payment_method'
        then nullif(p_patch ->> 'payment_method', '')::public.payment_method
        else e.payment_method end
  where e.id = any(v_ids) and e.user_id = v_user;

  -- The amount. On a single row it is that row's amount; across a series it is
  -- the price of the whole purchase, re-split the way booking it would have,
  -- because "essa compra foi 300 e não 360" is about the purchase and not
  -- about one instalment of it.
  if p_patch ? 'amount_cents' then
    v_amount := (p_patch ->> 'amount_cents')::bigint;

    if v_amount is null or v_amount <= 0 then
      raise exception 'amount_must_be_positive' using errcode = '22023';
    end if;

    if v_series and v_count > 1 then
      v_base := v_amount / v_count;
      v_remainder := v_amount - v_base * v_count;

      for i in 1..v_count loop
        update public.entries
        set amount_cents = v_base + case when i <= v_remainder then 1 else 0 end
        where id = v_ids[i] and user_id = v_user;
      end loop;
    else
      update public.entries set amount_cents = v_amount
      where id = p_id and user_id = v_user;
    end if;
  end if;

  -- The date. Across a series the new date belongs to the instalment that was
  -- pointed at, and the rest keep their spacing: moving the first instalment
  -- moves the purchase, it does not pile the whole series onto one day.
  if p_patch ? 'occurred_on' then
    v_date := (p_patch ->> 'occurred_on')::date;

    if v_date is null then
      raise exception 'occurred_on cannot be null' using errcode = '22023';
    end if;

    if v_series and v_count > 1 then
      v_shift := v_date - v_from_date;
      update public.entries
      set occurred_on = occurred_on + v_shift
      where id = any(v_ids) and user_id = v_user;
    else
      update public.entries set occurred_on = v_date
      where id = p_id and user_id = v_user;
    end if;
  end if;

  -- A card settles the method regardless of what was asked for, so say when
  -- that happened rather than letting the agent report back something the row
  -- does not actually say.
  v_asked := nullif(p_patch ->> 'payment_method', '');
  select e.payment_method::text into v_got
  from public.entries e where e.id = p_id;

  return jsonb_build_object(
    'entry', public.entry_as_json(p_id),
    'applied_to', case when v_series then 'series' else 'entry' end,
    'entries_changed', v_count,
    'payment_method_forced_to_credit',
      v_asked is not null and v_got is distinct from v_asked and v_got = 'credit',
    'series', case when v_series then (
      select jsonb_agg(public.entry_as_json(e.id)
                       order by e.installment_number, e.occurred_on)
      from public.entries e
      where e.installment_group_id = v_group and e.user_id = v_user
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting
-- ---------------------------------------------------------------------------

-- A hard delete, because that is what the app's own delete does: an entry
-- carries no archived_at and nothing in the schema reads a tombstone.
--
-- On a single entry the intent is plain. On one instalment of a twelve-month
-- purchase it is not -- "apaga essa compra" reads both ways -- so an
-- instalment refuses to be deleted until the caller has said which they meant.
-- Guessing here silently destroys eleven rows nobody asked about.
create or replace function public.api_delete_entry(
  p_token text,
  p_id uuid,
  p_delete_series boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_group uuid;
  v_total smallint;
  v_number smallint;
  v_description text;
  v_amount bigint;
  v_deleted integer;
begin
  select e.installment_group_id, e.installment_total, e.installment_number,
         e.description, e.amount_cents
    into v_group, v_total, v_number, v_description, v_amount
  from public.entries e
  where e.id = p_id and e.user_id = v_user;

  if v_description is null then
    raise exception 'unknown_entry' using errcode = '23503';
  end if;

  if v_group is not null and p_delete_series is null then
    raise exception 'installment_needs_explicit_scope' using errcode = '22023';
  end if;

  if v_group is not null and p_delete_series then
    delete from public.entries
    where installment_group_id = v_group and user_id = v_user;
    get diagnostics v_deleted = row_count;

    return jsonb_build_object(
      'deleted', v_deleted,
      'scope', 'series',
      'description', v_description,
      'installment_total', v_total
    );
  end if;

  delete from public.entries where id = p_id and user_id = v_user;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'deleted', v_deleted,
    'scope', case when v_group is null then 'entry' else 'installment' end,
    'description', v_description,
    'amount_cents', v_amount,
    'installment_number', v_number,
    'installment_total', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading, narrowed
-- ---------------------------------------------------------------------------

-- Redefined with the filters, and with the totals that were the point of
-- asking for them: "quanto gastei com jogos esse mês" used to mean fetching
-- every row and adding them up outside the database, which is both slower and
-- a place for arithmetic to go wrong. A subcategory filter implies nothing
-- about the category, so both are offered separately.
--
-- The shape changes from a bare array to an object carrying `entries`. Nothing
-- but the MCP tool reads it.
create or replace function public.api_recent_entries(
  p_token text,
  p_limit integer default 20,
  p_from_date date default null,
  p_to_date date default null,
  p_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 200);
  v_matching integer;
  v_total bigint;
  v_expense bigint;
  v_income bigint;
begin
  -- Counted over everything that matches rather than over the page, so a
  -- total is a total and not "the total of the first twenty".
  select count(*),
         coalesce(sum(e.amount_cents), 0),
         coalesce(sum(e.amount_cents) filter (where e.kind = 'expense'), 0),
         coalesce(sum(e.amount_cents) filter (where e.kind = 'income'), 0)
    into v_matching, v_total, v_expense, v_income
  from public.entries e
  where e.user_id = v_user
    and (p_from_date is null or e.occurred_on >= p_from_date)
    and (p_to_date is null or e.occurred_on <= p_to_date)
    and (p_category_id is null or e.category_id = p_category_id)
    and (p_subcategory_id is null or e.subcategory_id = p_subcategory_id)
    and (p_account_id is null or e.account_id = p_account_id);

  return jsonb_build_object(
    'matching', v_matching,
    'returned', least(v_matching, v_limit),
    'total_cents', v_total,
    'expense_cents', v_expense,
    'income_cents', v_income,
    'filters', jsonb_strip_nulls(jsonb_build_object(
      'from_date', to_char(p_from_date, 'YYYY-MM-DD'),
      'to_date', to_char(p_to_date, 'YYYY-MM-DD'),
      'category_id', p_category_id,
      'subcategory_id', p_subcategory_id,
      'account_id', p_account_id
    )),
    'entries', coalesce((
      select jsonb_agg(public.entry_as_json(e.id)
                       order by e.occurred_on desc, e.created_at desc)
      from (
        select e.id, e.occurred_on, e.created_at
        from public.entries e
        where e.user_id = v_user
          and (p_from_date is null or e.occurred_on >= p_from_date)
          and (p_to_date is null or e.occurred_on <= p_to_date)
          and (p_category_id is null or e.category_id = p_category_id)
          and (p_subcategory_id is null or e.subcategory_id = p_subcategory_id)
          and (p_account_id is null or e.account_id = p_account_id)
        order by e.occurred_on desc, e.created_at desc
        limit v_limit
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

-- The old two-argument shape would otherwise sit alongside the new one and win
-- some calls by overload resolution.
drop function if exists public.api_recent_entries(text, integer);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.api_update_entry(text, uuid, jsonb, boolean)',
    'public.api_delete_entry(text, uuid, boolean)',
    'public.api_recent_entries(text, integer, date, date, uuid, uuid, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('grant execute on function %s to anon, authenticated', v_fn);
  end loop;
end;
$$;
