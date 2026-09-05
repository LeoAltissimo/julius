-- The surface the MCP server talks to.
--
-- Every function here is SECURITY DEFINER and takes the raw token as its first
-- argument. The owner is resolved from that token *inside* the function, so the
-- user id is never something a caller can pass. That is the whole point: it is
-- structurally impossible to address someone else's data, which is why the
-- deployment needs no service role key at all -- the app still ships nothing
-- but the publishable key.

-- ---------------------------------------------------------------------------
-- Token resolution
-- ---------------------------------------------------------------------------

create or replace function public.api_user_for_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_user uuid;
begin
  if p_token is null or length(p_token) < 24 then
    raise exception 'invalid_token' using errcode = '28000';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select user_id into v_user
  from public.api_tokens
  where token_hash = v_hash and revoked_at is null;

  if v_user is null then
    raise exception 'invalid_token' using errcode = '28000';
  end if;

  update public.api_tokens
  set last_used_at = now()
  where token_hash = v_hash;

  return v_user;
end;
$$;

-- Callable only by the other functions in this file, which run as the owner.
revoke all on function public.api_user_for_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading the shape of someone's finances
-- ---------------------------------------------------------------------------

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
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'type', a.type,
        'institution', a.institution
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
    ), '[]'::jsonb)
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
-- Recording entries
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
          source, external_ref
        )
        values (
          v_user,
          (v_entry ->> 'kind')::public.entry_kind,
          v_cents,
          (v_date + ((i - 1) || ' month')::interval)::date,
          coalesce(v_entry ->> 'description', ''),
          nullif(btrim(coalesce(v_entry ->> 'notes', '')), ''),
          (v_entry ->> 'account_id')::uuid,
          nullif(v_entry ->> 'counter_account_id', '')::uuid,
          nullif(v_entry ->> 'category_id', '')::uuid,
          nullif(v_entry ->> 'subcategory_id', '')::uuid,
          case when v_installments > 1 then
            coalesce(nullif(v_entry ->> 'installment_group_id', '')::uuid, gen_random_uuid())
          end,
          case when v_installments > 1 then i end,
          case when v_installments > 1 then v_installments end,
          'api',
          v_row_ref
        )
        returning id into v_id;

        v_created := v_created || to_jsonb(v_id);
      exception
        when unique_violation then
          -- The same reference was booked before. Reporting it rather than
          -- failing the batch is what makes retrying a photo safe.
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

-- ---------------------------------------------------------------------------
-- Shaping the category tree
-- ---------------------------------------------------------------------------

-- Idempotent on purpose. An agent that asks for "Mercado" when "Mercado"
-- already exists gets the existing one back rather than a near-duplicate, which
-- is what would quietly wreck the month-over-month comparison.
create or replace function public.api_upsert_category(
  p_token text,
  p_name text,
  p_kind text default 'expense',
  p_color text default '#64748b',
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_id uuid;
  v_created boolean := false;
begin
  select id into v_id
  from public.categories
  where user_id = v_user
    and kind = p_kind::public.category_kind
    and lower(name) = lower(btrim(p_name));

  if v_id is null then
    insert into public.categories (user_id, name, kind, color, description,
                                   sort_order)
    values (v_user, btrim(p_name), p_kind::public.category_kind, p_color,
            nullif(btrim(coalesce(p_description, '')), ''),
            coalesce((select max(sort_order) + 10 from public.categories
                      where user_id = v_user), 0))
    returning id into v_id;
    v_created := true;
  else
    -- Reviving an archived category beats creating a second one beside it.
    update public.categories set archived_at = null
    where id = v_id and archived_at is not null;
  end if;

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

create or replace function public.api_upsert_subcategory(
  p_token text,
  p_category_id uuid,
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_id uuid;
  v_created boolean := false;
begin
  if not exists (select 1 from public.categories
                 where id = p_category_id and user_id = v_user) then
    raise exception 'unknown_category' using errcode = '23503';
  end if;

  select id into v_id
  from public.subcategories
  where category_id = p_category_id and lower(name) = lower(btrim(p_name));

  if v_id is null then
    insert into public.subcategories (user_id, category_id, name, description,
                                      sort_order)
    values (v_user, p_category_id, btrim(p_name),
            nullif(btrim(coalesce(p_description, '')), ''),
            coalesce((select max(sort_order) + 10 from public.subcategories
                      where category_id = p_category_id), 0))
    returning id into v_id;
    v_created := true;
  else
    update public.subcategories set archived_at = null
    where id = v_id and archived_at is not null;
  end if;

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

create or replace function public.api_update_category(
  p_token text,
  p_id uuid,
  p_name text default null,
  p_color text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
begin
  update public.categories
  set name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
      color = coalesce(p_color, color),
      description = case
        when p_description is null then description
        else nullif(btrim(p_description), '')
      end
  where id = p_id and user_id = v_user;

  if not found then
    raise exception 'unknown_category' using errcode = '23503';
  end if;

  return jsonb_build_object('id', p_id, 'updated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Moving and merging
-- ---------------------------------------------------------------------------

-- Shared by the app and the API. Deferring the composite foreign key is what
-- lets the subcategory and the entries that point at it change macro category
-- together; without it neither statement can go first.
create or replace function public.move_subcategory_owned(
  p_user_id uuid,
  p_subcategory_id uuid,
  p_target_category_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_current uuid;
  v_moved integer;
begin
  select category_id into v_current
  from public.subcategories
  where id = p_subcategory_id and user_id = p_user_id;

  if v_current is null then
    raise exception 'unknown_subcategory' using errcode = '23503';
  end if;

  if not exists (select 1 from public.categories
                 where id = p_target_category_id and user_id = p_user_id) then
    raise exception 'unknown_category' using errcode = '23503';
  end if;

  if v_current = p_target_category_id then
    return 0;
  end if;

  set constraints public.entries_subcategory_id_category_id_fkey deferred;

  update public.subcategories
  set category_id = p_target_category_id
  where id = p_subcategory_id;

  update public.entries
  set category_id = p_target_category_id
  where subcategory_id = p_subcategory_id and user_id = p_user_id;

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

revoke all on function public.move_subcategory_owned(uuid, uuid, uuid)
  from public, anon, authenticated;

-- The app's own entry point: acts on the caller, never on an id they pass.
create or replace function public.move_subcategory(
  p_subcategory_id uuid,
  p_target_category_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return public.move_subcategory_owned(v_user, p_subcategory_id, p_target_category_id);
end;
$$;

revoke all on function public.move_subcategory(uuid, uuid) from public, anon;
grant execute on function public.move_subcategory(uuid, uuid) to authenticated;

create or replace function public.api_move_subcategory(
  p_token text,
  p_subcategory_id uuid,
  p_target_category_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_moved integer;
begin
  v_moved := public.move_subcategory_owned(v_user, p_subcategory_id, p_target_category_id);
  return jsonb_build_object('entries_repointed', v_moved);
end;
$$;

-- Folds one subcategory into another and archives the empty one. This is the
-- cleanup that makes "Supermercado" and "Mercado" stop being two lines.
create or replace function public.api_merge_subcategories(
  p_token text,
  p_from_id uuid,
  p_into_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_target_category uuid;
  v_moved integer;
begin
  if p_from_id = p_into_id then
    raise exception 'cannot merge a subcategory into itself' using errcode = '22023';
  end if;

  select category_id into v_target_category
  from public.subcategories
  where id = p_into_id and user_id = v_user;

  if v_target_category is null then
    raise exception 'unknown_subcategory' using errcode = '23503';
  end if;

  if not exists (select 1 from public.subcategories
                 where id = p_from_id and user_id = v_user) then
    raise exception 'unknown_subcategory' using errcode = '23503';
  end if;

  set constraints public.entries_subcategory_id_category_id_fkey deferred;

  update public.entries
  set subcategory_id = p_into_id,
      category_id = v_target_category
  where subcategory_id = p_from_id and user_id = v_user;

  get diagnostics v_moved = row_count;

  update public.subcategories
  set archived_at = now()
  where id = p_from_id and user_id = v_user;

  return jsonb_build_object('entries_moved', v_moved, 'archived', p_from_id);
end;
$$;

create or replace function public.api_archive_subcategory(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
begin
  update public.subcategories set archived_at = now()
  where id = p_id and user_id = v_user;

  if not found then
    raise exception 'unknown_subcategory' using errcode = '23503';
  end if;

  return jsonb_build_object('id', p_id, 'archived', true);
end;
$$;

create or replace function public.api_archive_category(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
begin
  update public.categories set archived_at = now()
  where id = p_id and user_id = v_user;

  if not found then
    raise exception 'unknown_category' using errcode = '23503';
  end if;

  update public.subcategories set archived_at = now()
  where category_id = p_id and user_id = v_user and archived_at is null;

  return jsonb_build_object('id', p_id, 'archived', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- These are reachable without a session because the MCP route holds only the
-- publishable key; the token in the first argument is the credential. A token
-- is 32 random bytes, so guessing one is not a thing that happens.

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.api_snapshot(text)',
    'public.api_recent_entries(text, integer)',
    'public.api_create_entries(text, jsonb)',
    'public.api_upsert_category(text, text, text, text, text)',
    'public.api_upsert_subcategory(text, uuid, text, text)',
    'public.api_update_category(text, uuid, text, text, text)',
    'public.api_move_subcategory(text, uuid, uuid)',
    'public.api_merge_subcategories(text, uuid, uuid)',
    'public.api_archive_subcategory(text, uuid)',
    'public.api_archive_category(text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('grant execute on function %s to anon, authenticated', v_fn);
  end loop;
end;
$$;
