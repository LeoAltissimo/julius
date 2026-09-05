-- Patrimony over the API.
--
-- The category tree and the entries were already reachable from an agent; the
-- positions that make up the net worth curve were not, so "atualiza meu
-- patrimônio" had nowhere to land. Same shape as the rest of this file's
-- neighbours: SECURITY DEFINER, the token as the first argument, the owner
-- resolved inside the function and never passed in.
--
-- Every value written here goes through the ordinary column update, so the
-- snapshot trigger appends to investment_snapshots exactly as the app's own
-- form does. A value edited by an agent and a value edited by hand produce the
-- same history; the curve cannot tell them apart, which is the point.

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- The running total at each point where any position changed value. Each
-- snapshot only carries the position it belongs to, so the total is rebuilt
-- from the deltas: a month where you touched one position still shows the whole
-- patrimony rather than a dip. Mirrors fetchNetWorthSeries in the app.
create or replace function public.api_net_worth_history(
  p_token text,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 400);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'recorded_at', to_char(h.recorded_at at time zone 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SSZ'),
             'total_cents', h.total_cents
           ) order by h.recorded_at)
    from (
      select r.recorded_at, r.total_cents
      from (
        select
          d.recorded_at,
          sum(d.delta) over (order by d.recorded_at, d.id
                             rows between unbounded preceding and current row)
            as total_cents
        from (
          select
            s.id,
            s.recorded_at,
            s.value_cents - coalesce(
              lag(s.value_cents) over (partition by s.investment_id
                                       order by s.recorded_at, s.id), 0)
              as delta
          from public.investment_snapshots s
          where s.user_id = v_user
        ) d
      ) r
      order by r.recorded_at desc
      limit v_limit
    ) h
  ), '[]'::jsonb);
end;
$$;

create or replace function public.api_investments(
  p_token text,
  p_include_archived boolean default false,
  p_history_limit integer default 30
)
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
    'total_cents', coalesce((
      select sum(i.current_value_cents)
      from public.investments i
      where i.user_id = v_user and i.archived_at is null
    ), 0),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'institution', i.institution,
        'kind', i.kind,
        'current_value_cents', i.current_value_cents,
        'value_updated_at', to_char(i.value_updated_at at time zone 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SSZ'),
        'notes', i.notes,
        'color', i.color,
        'archived', i.archived_at is not null
      ) order by i.archived_at nulls first, i.sort_order, i.name)
      from public.investments i
      where i.user_id = v_user
        and (coalesce(p_include_archived, false) or i.archived_at is null)
    ), '[]'::jsonb),
    'history', public.api_net_worth_history(p_token, p_history_limit)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

-- Idempotent for the same reason api_upsert_category is: an agent that asks for
-- "Tesouro Selic" when "Tesouro Selic" is already there should land on the
-- existing position rather than open a second one beside it and split the
-- curve in two. A name that already exists is the same position, so a value
-- sent with it is an update of that position, not a new one.
create or replace function public.api_upsert_investment(
  p_token text,
  p_name text,
  p_value_cents bigint default null,
  p_institution text default null,
  p_kind text default null,
  p_color text default null,
  p_notes text default null
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
  v_was_archived boolean;
  v_created boolean := false;
  v_value bigint;
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'investment name is required' using errcode = '22023';
  end if;

  if p_value_cents is not null and p_value_cents < 0 then
    raise exception 'investment value cannot be negative' using errcode = '22023';
  end if;

  select i.id, i.archived_at is not null into v_id, v_was_archived
  from public.investments i
  where i.user_id = v_user and lower(i.name) = lower(btrim(p_name))
  order by i.archived_at nulls first
  limit 1;

  if v_id is null then
    insert into public.investments (
      user_id, name, institution, kind, color, notes,
      current_value_cents, sort_order
    )
    values (
      v_user,
      btrim(p_name),
      nullif(btrim(coalesce(p_institution, '')), ''),
      nullif(btrim(coalesce(p_kind, '')), ''),
      coalesce(p_color, '#0f766e'),
      nullif(btrim(coalesce(p_notes, '')), ''),
      coalesce(p_value_cents, 0),
      coalesce((select max(sort_order) + 10 from public.investments
                where user_id = v_user), 0)
    )
    returning id into v_id;
    v_created := true;
  else
    -- Bringing an archived position back beats standing a duplicate next to it.
    update public.investments
    set archived_at = null,
        institution = case
          when p_institution is null then institution
          else nullif(btrim(p_institution), '')
        end,
        kind = case
          when p_kind is null then kind
          else nullif(btrim(p_kind), '')
        end,
        color = coalesce(p_color, color),
        notes = case
          when p_notes is null then notes
          else nullif(btrim(p_notes), '')
        end,
        current_value_cents = coalesce(p_value_cents, current_value_cents)
    where id = v_id and user_id = v_user;
  end if;

  -- The stored spelling, not the one that was asked for: "tesouro selic" lands
  -- on "Tesouro Selic", and the agent should read back what is actually there.
  select name, current_value_cents into v_name, v_value
  from public.investments where id = v_id;

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'created', v_created,
    'restored', coalesce(v_was_archived, false),
    'current_value_cents', v_value
  );
end;
$$;

create or replace function public.api_update_investment(
  p_token text,
  p_id uuid,
  p_name text default null,
  p_value_cents bigint default null,
  p_institution text default null,
  p_kind text default null,
  p_color text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_before bigint;
  v_after bigint;
begin
  if p_value_cents is not null and p_value_cents < 0 then
    raise exception 'investment value cannot be negative' using errcode = '22023';
  end if;

  select current_value_cents into v_before
  from public.investments
  where id = p_id and user_id = v_user;

  if v_before is null then
    raise exception 'unknown_investment' using errcode = '23503';
  end if;

  update public.investments
  set name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
      institution = case
        when p_institution is null then institution
        else nullif(btrim(p_institution), '')
      end,
      kind = case
        when p_kind is null then kind
        else nullif(btrim(p_kind), '')
      end,
      color = coalesce(p_color, color),
      notes = case
        when p_notes is null then notes
        else nullif(btrim(p_notes), '')
      end,
      -- Naming the column in the SET list is what arms the snapshot trigger,
      -- and the trigger itself ignores a write that does not move the value.
      current_value_cents = coalesce(p_value_cents, current_value_cents)
  where id = p_id and user_id = v_user
  returning current_value_cents into v_after;

  return jsonb_build_object(
    'id', p_id,
    'updated', true,
    'previous_value_cents', v_before,
    'current_value_cents', v_after
  );
end;
$$;

-- The periodic ritual, in one call: whatever each position is worth today.
-- Unchanged values are reported rather than written, so the history stays a
-- record of real movements instead of a record of visits.
create or replace function public.api_update_investment_values(
  p_token text,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_row jsonb;
  v_id uuid;
  v_value bigint;
  v_before bigint;
  v_updated jsonb := '[]'::jsonb;
  v_unchanged jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_values) <> 'array' then
    raise exception 'values must be an array' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_values)
  loop
    v_id := (v_row ->> 'investment_id')::uuid;
    v_value := (v_row ->> 'value_cents')::bigint;

    if v_value < 0 then
      raise exception 'investment value cannot be negative' using errcode = '22023';
    end if;

    select current_value_cents into v_before
    from public.investments
    where id = v_id and user_id = v_user;

    if v_before is null then
      raise exception 'unknown_investment' using errcode = '23503';
    end if;

    if v_before = v_value then
      v_unchanged := v_unchanged || to_jsonb(v_id);
      continue;
    end if;

    update public.investments
    set current_value_cents = v_value
    where id = v_id and user_id = v_user;

    v_updated := v_updated || jsonb_build_object(
      'id', v_id,
      'previous_value_cents', v_before,
      'current_value_cents', v_value
    );
  end loop;

  return jsonb_build_object(
    'updated', jsonb_array_length(v_updated),
    'positions', v_updated,
    'unchanged', v_unchanged,
    'total_cents', coalesce((
      select sum(i.current_value_cents)
      from public.investments i
      where i.user_id = v_user and i.archived_at is null
    ), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Taking a position off the board
-- ---------------------------------------------------------------------------

-- The reversible one, and the one to reach for. The position leaves the app and
-- stops counting towards the total; its snapshots stay, so the past shape of
-- the curve does not change under you.
create or replace function public.api_archive_investment(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_name text;
begin
  update public.investments set archived_at = now()
  where id = p_id and user_id = v_user and archived_at is null
  returning name into v_name;

  if v_name is null then
    if not exists (select 1 from public.investments
                   where id = p_id and user_id = v_user) then
      raise exception 'unknown_investment' using errcode = '23503';
    end if;
    select name into v_name from public.investments where id = p_id;
  end if;

  return jsonb_build_object('id', p_id, 'name', v_name, 'archived', true);
end;
$$;

create or replace function public.api_restore_investment(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_name text;
begin
  update public.investments set archived_at = null
  where id = p_id and user_id = v_user
  returning name into v_name;

  if v_name is null then
    raise exception 'unknown_investment' using errcode = '23503';
  end if;

  return jsonb_build_object('id', p_id, 'name', v_name, 'archived', false);
end;
$$;

-- The irreversible one. Snapshots cascade, so the curve is rewritten as though
-- the position had never existed -- which is right for a position opened by
-- mistake and wrong for one you simply closed. The count comes back so the
-- agent can say out loud how much history is going with it.
create or replace function public.api_delete_investment(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.api_user_for_token(p_token);
  v_name text;
  v_snapshots integer;
begin
  select i.name,
         (select count(*) from public.investment_snapshots s
          where s.investment_id = i.id)
    into v_name, v_snapshots
  from public.investments i
  where i.id = p_id and i.user_id = v_user;

  if v_name is null then
    raise exception 'unknown_investment' using errcode = '23503';
  end if;

  delete from public.investments where id = p_id and user_id = v_user;

  return jsonb_build_object(
    'id', p_id,
    'name', v_name,
    'deleted', true,
    'snapshots_discarded', v_snapshots
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The snapshot learns about patrimony
-- ---------------------------------------------------------------------------

-- Redefined so that the one call an agent already makes before writing anything
-- also hands back the position ids. Names and values only: the history and the
-- archived positions stay behind api_investments, so filing a receipt does not
-- drag the whole net worth curve through the context window.
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
    'public.api_net_worth_history(text, integer)',
    'public.api_investments(text, boolean, integer)',
    'public.api_upsert_investment(text, text, bigint, text, text, text, text)',
    'public.api_update_investment(text, uuid, text, bigint, text, text, text, text)',
    'public.api_update_investment_values(text, jsonb)',
    'public.api_archive_investment(text, uuid)',
    'public.api_restore_investment(text, uuid)',
    'public.api_delete_investment(text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('grant execute on function %s to anon, authenticated', v_fn);
  end loop;
end;
$$;
