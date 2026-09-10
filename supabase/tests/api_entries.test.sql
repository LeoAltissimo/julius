-- Tests for the entry API: editing, deleting, and the filtered list.
--
-- Run with `pnpm test:db` against a local stack (`pnpm db:start`). Everything
-- happens inside one transaction that is rolled back at the end, so the suite
-- leaves the database exactly as it found it and is safe to run twice.
--
-- There is no pgTAP here on purpose: the suite has to run anywhere psql does,
-- including a CI container with nothing installed, and the assertions it needs
-- are simple enough that an extension would be the heaviest part of it.

\set ON_ERROR_STOP on
\timing off

begin;

-- ---------------------------------------------------------------------------
-- The two assertions this suite needs
-- ---------------------------------------------------------------------------

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice 'ok    %', p_what;
  else
    raise exception 'FAIL  %', p_what;
  end if;
end;
$$;

-- A test that expects a refusal has to prove the *right* refusal happened;
-- "it threw something" would pass even when the wrong rule fired.
create or replace function pg_temp.refuses(p_sql text, p_expect text, p_what text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expect in sqlerrm) > 0 then
      raise notice 'ok    % (%)', p_what, p_expect;
      return;
    end if;
    raise exception 'FAIL  % -- esperava "%", veio "%"', p_what, p_expect, sqlerrm;
  end;
  raise exception 'FAIL  % -- deveria ter sido recusado, mas passou', p_what;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

create temporary table t (k text primary key, v text) on commit drop;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_token text := 'julius_test_' || replace(gen_random_uuid()::text, '-', '');
  v_other_token text := 'julius_other_' || replace(gen_random_uuid()::text, '-', '');
begin
  insert into auth.users (id) values (v_user), (v_other);

  insert into public.api_tokens (user_id, name, token_hash, prefix) values
    (v_user, 'suite', encode(extensions.digest(v_token, 'sha256'), 'hex'), 'julius_t'),
    (v_other, 'other', encode(extensions.digest(v_other_token, 'sha256'), 'hex'), 'julius_o');

  insert into t values ('user', v_user), ('other_user', v_other),
                       ('token', v_token), ('other_token', v_other_token);
end;
$$;

do $$
declare
  v_token text := (select v from t where k = 'token');
begin
  insert into t values
    ('bank',    public.api_upsert_account(v_token, 'Banco Teste', 'checking') ->> 'id'),
    ('wallet',  public.api_upsert_account(v_token, 'Carteira Teste', 'cash') ->> 'id');

  insert into t values
    ('card', public.api_upsert_account(v_token, 'Cartão Teste', 'credit_card',
        null, null, null, 500000, 28::smallint, 5::smallint,
        (select v from t where k = 'bank')::uuid) ->> 'id');

  insert into t values
    ('cat_spend',  public.api_upsert_category(v_token, 'Lazer', 'expense') ->> 'id'),
    ('cat_other',  public.api_upsert_category(v_token, 'Casa', 'expense') ->> 'id'),
    ('cat_income', public.api_upsert_category(v_token, 'Salário', 'income') ->> 'id');

  insert into t values
    ('sub_games', public.api_upsert_subcategory(v_token,
        (select v from t where k = 'cat_spend')::uuid, 'Jogos') ->> 'id'),
    ('sub_rent', public.api_upsert_subcategory(v_token,
        (select v from t where k = 'cat_other')::uuid, 'Aluguel') ->> 'id');
end;
$$;

-- ---------------------------------------------------------------------------
-- update_transaction: a simple field
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_id uuid;
  v_out jsonb;
begin
  v_id := (public.api_create_entries(v_token, jsonb_build_array(jsonb_build_object(
    'kind','expense','amount_cents', 4990, 'occurred_on','2026-09-01',
    'description','Steam', 'account_id',(select v from t where k='bank'),
    'category_id',(select v from t where k='cat_spend'),
    'subcategory_id',(select v from t where k='sub_games'),
    'payment_method','debit'
  ))) -> 'ids' ->> 0)::uuid;
  insert into t values ('simple', v_id);

  v_out := public.api_update_entry(v_token, v_id,
    jsonb_build_object('amount_cents', 5990, 'description', 'Steam — Hades II'));

  perform pg_temp.ok((v_out -> 'entry' ->> 'amount_cents')::bigint = 5990,
    'edição simples troca o valor');
  perform pg_temp.ok(v_out -> 'entry' ->> 'description' = 'Steam — Hades II',
    'edição simples troca a descrição');
  perform pg_temp.ok(v_out ->> 'applied_to' = 'entry',
    'edição de lançamento avulso reporta applied_to=entry');

  -- The whole point of the jsonb patch: what was not sent is not touched.
  perform pg_temp.ok(v_out -> 'entry' ->> 'payment_method' = 'debit',
    'campo omitido no patch fica intacto');
  perform pg_temp.ok(v_out -> 'entry' ->> 'subcategory' = 'Jogos',
    'subcategoria omitida fica intacta');

  -- And names, not just ids, come back out.
  perform pg_temp.ok(v_out -> 'entry' ->> 'account' = 'Banco Teste'
                 and v_out -> 'entry' ->> 'category' = 'Lazer',
    'retorno traz os nomes resolvidos de conta e categoria');
end;
$$;

-- ---------------------------------------------------------------------------
-- update_transaction: null clears, absence does not
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_id uuid := (select v from t where k = 'simple')::uuid;
  v_out jsonb;
begin
  -- A subcategory cannot outlive its category, so both go at once.
  v_out := public.api_update_entry(v_token, v_id,
    jsonb_build_object('category_id', null, 'subcategory_id', null));

  perform pg_temp.ok(v_out -> 'entry' ->> 'category_id' is null,
    'category_id explicitamente nulo limpa a categoria');
  perform pg_temp.ok(v_out -> 'entry' ->> 'amount_cents' = '5990',
    'limpar categoria não mexe no valor');
end;
$$;

-- ---------------------------------------------------------------------------
-- update_transaction: the refusals
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_id uuid := (select v from t where k = 'simple')::uuid;
begin
  -- A subcategory that belongs to another macro category.
  perform pg_temp.refuses(format(
    'select public.api_update_entry(%L, %L, %L::jsonb)', v_token, v_id,
    jsonb_build_object(
      'category_id', (select v from t where k='cat_spend'),
      'subcategory_id', (select v from t where k='sub_rent'))::text),
    'subcategory_id_category_id',
    'subcategoria de outra categoria é recusada');

  -- Spending cannot be filed under an income category.
  perform pg_temp.refuses(format(
    'select public.api_update_entry(%L, %L, %L::jsonb)', v_token, v_id,
    jsonb_build_object('category_id', (select v from t where k='cat_income'))::text),
    'category_kind_mismatch',
    'categoria de outro kind é recusada');

  perform pg_temp.refuses(format(
    'select public.api_update_entry(%L, %L, %L::jsonb)', v_token, v_id,
    jsonb_build_object('amount_cents', 0)::text),
    'amount_must_be_positive',
    'valor zero é recusado');

  perform pg_temp.refuses(format(
    'select public.api_update_entry(%L, %L, %L::jsonb)',
    v_token, gen_random_uuid(), '{"description":"x"}'),
    'unknown_entry',
    'id inexistente é recusado');

  -- The isolation that everything else rests on.
  perform pg_temp.refuses(format(
    'select public.api_update_entry(%L, %L, %L::jsonb)',
    (select v from t where k='other_token'), v_id, '{"description":"sequestrado"}'),
    'unknown_entry',
    'token de outro usuário não edita este lançamento');
end;
$$;

-- ---------------------------------------------------------------------------
-- update_transaction: a card settles the method
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_id uuid := (select v from t where k = 'simple')::uuid;
  v_out jsonb;
begin
  v_out := public.api_update_entry(v_token, v_id, jsonb_build_object(
    'account_id', (select v from t where k='card'),
    'payment_method', 'pix'));

  perform pg_temp.ok(v_out -> 'entry' ->> 'payment_method' = 'credit',
    'gasto movido para cartão vira crédito mesmo pedindo pix');
  perform pg_temp.ok((v_out ->> 'payment_method_forced_to_credit')::boolean,
    'a coerção é reportada em vez de silenciosa');

  -- Back to the bank, and credit is no longer allowed there.
  perform public.api_update_entry(v_token, v_id, jsonb_build_object(
    'account_id', (select v from t where k='bank'), 'payment_method', 'debit'));

  perform pg_temp.refuses(format(
    'select public.api_update_entry(%L, %L, %L::jsonb)', v_token, v_id,
    '{"payment_method":"credit"}'),
    'credit_needs_card',
    'crédito fora de cartão é recusado na edição');
end;
$$;

-- ---------------------------------------------------------------------------
-- update_transaction: instalments, with and without apply_to_series
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_ids jsonb;
  v_first uuid;
  v_out jsonb;
  v_group uuid;
begin
  -- R$ 360,00 in 3x on the card: 12000 + 12000 + 12000, monthly.
  v_ids := public.api_create_entries(v_token, jsonb_build_array(jsonb_build_object(
    'kind','expense','amount_cents', 36000, 'occurred_on','2026-09-10',
    'installments', 3, 'description','Notebook',
    'account_id',(select v from t where k='card'),
    'category_id',(select v from t where k='cat_spend')
  ))) -> 'ids';

  v_first := (v_ids ->> 0)::uuid;
  insert into t values ('inst_first', v_first);
  select installment_group_id into v_group from public.entries where id = v_first;
  insert into t values ('inst_group', v_group);

  perform pg_temp.ok(jsonb_array_length(v_ids) = 3, 'parcelamento cria 3 linhas');

  -- Without apply_to_series: one instalment moves, the others do not.
  v_out := public.api_update_entry(v_token, v_first,
    jsonb_build_object('description', 'Notebook (corrigido)'));

  perform pg_temp.ok(v_out ->> 'applied_to' = 'entry',
    'sem apply_to_series a edição fica na parcela');
  perform pg_temp.ok((v_out ->> 'entries_changed')::int = 1,
    'sem apply_to_series muda exatamente uma linha');
  perform pg_temp.ok((select count(*) from public.entries
      where installment_group_id = v_group and description = 'Notebook') = 2,
    'as outras parcelas mantêm a descrição antiga');

  -- With apply_to_series: the patch reaches every instalment.
  v_out := public.api_update_entry(v_token, v_first,
    jsonb_build_object('description', 'Notebook Dell'), true);

  perform pg_temp.ok(v_out ->> 'applied_to' = 'series',
    'com apply_to_series a edição reporta series');
  perform pg_temp.ok((v_out ->> 'entries_changed')::int = 3,
    'com apply_to_series muda as três linhas');
  perform pg_temp.ok((select count(*) from public.entries
      where installment_group_id = v_group and description = 'Notebook Dell') = 3,
    'todas as parcelas ficam com a descrição nova');
  perform pg_temp.ok(jsonb_array_length(v_out -> 'series') = 3,
    'o retorno traz a série inteira resolvida');
end;
$$;

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_first uuid := (select v from t where k = 'inst_first')::uuid;
  v_group uuid := (select v from t where k = 'inst_group')::uuid;
begin
  -- The amount on a series is the price of the purchase, re-split. R$ 300,00
  -- over three does not divide evenly on purpose: 10000/10000/10000 would hide
  -- a rounding bug, 30001 would not.
  perform public.api_update_entry(v_token, v_first,
    jsonb_build_object('amount_cents', 30001), true);

  perform pg_temp.ok((select sum(amount_cents) from public.entries
      where installment_group_id = v_group) = 30001,
    'apply_to_series re-divide o total sem perder centavo');
  perform pg_temp.ok((select count(distinct amount_cents) from public.entries
      where installment_group_id = v_group) = 2,
    'o centavo que sobra fica em uma parcela só');

  -- On a single instalment the amount is that instalment's.
  perform public.api_update_entry(v_token, v_first,
    jsonb_build_object('amount_cents', 50000));

  perform pg_temp.ok((select amount_cents from public.entries where id = v_first) = 50000,
    'sem apply_to_series o valor é o daquela parcela');

  -- Dates: moving the first instalment moves the purchase, keeping the spacing.
  perform public.api_update_entry(v_token, v_first,
    jsonb_build_object('occurred_on', '2026-10-10'), true);

  perform pg_temp.ok((select min(occurred_on) from public.entries
      where installment_group_id = v_group) = date '2026-10-10',
    'apply_to_series desloca a série pela mesma diferença');
  perform pg_temp.ok((select max(occurred_on) from public.entries
      where installment_group_id = v_group) = date '2026-12-10',
    'o espaçamento mensal entre parcelas é preservado');
  perform pg_temp.ok((select count(distinct occurred_on) from public.entries
      where installment_group_id = v_group) = 3,
    'a série não desaba toda no mesmo dia');
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_transaction
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_first uuid := (select v from t where k = 'inst_first')::uuid;
  v_group uuid := (select v from t where k = 'inst_group')::uuid;
  v_out jsonb;
  v_solo uuid;
begin
  -- An instalment refuses to be deleted until the caller says which they meant.
  perform pg_temp.refuses(format(
    'select public.api_delete_entry(%L, %L)', v_token, v_first),
    'installment_needs_explicit_scope',
    'apagar parcela sem dizer o escopo é recusado');

  -- Explicitly just this one.
  v_out := public.api_delete_entry(v_token, v_first, false);
  perform pg_temp.ok((v_out ->> 'deleted')::int = 1, 'delete_series=false apaga uma linha');
  perform pg_temp.ok(v_out ->> 'scope' = 'installment', 'e reporta escopo installment');
  perform pg_temp.ok((select count(*) from public.entries
      where installment_group_id = v_group) = 2, 'as outras duas parcelas sobrevivem');

  -- Explicitly the whole series.
  v_out := public.api_delete_entry(v_token,
    (select id from public.entries where installment_group_id = v_group limit 1), true);
  perform pg_temp.ok((v_out ->> 'deleted')::int = 2, 'delete_series=true apaga o que resta');
  perform pg_temp.ok(v_out ->> 'scope' = 'series', 'e reporta escopo series');
  perform pg_temp.ok((select count(*) from public.entries
      where installment_group_id = v_group) = 0, 'a série inteira some');

  -- A lone entry needs no such ceremony.
  v_solo := (public.api_create_entries(v_token, jsonb_build_array(jsonb_build_object(
    'kind','expense','amount_cents', 1000, 'occurred_on','2026-09-02',
    'description','Café','account_id',(select v from t where k='wallet')
  ))) -> 'ids' ->> 0)::uuid;

  v_out := public.api_delete_entry(v_token, v_solo);
  perform pg_temp.ok((v_out ->> 'deleted')::int = 1 and v_out ->> 'scope' = 'entry',
    'lançamento avulso é apagado sem parâmetro extra');

  perform pg_temp.refuses(format(
    'select public.api_delete_entry(%L, %L)', v_token, v_solo),
    'unknown_entry', 'apagar duas vezes é recusado');
end;
$$;

do $$
declare
  v_id uuid;
begin
  v_id := (public.api_create_entries((select v from t where k='token'),
    jsonb_build_array(jsonb_build_object(
      'kind','expense','amount_cents', 999, 'occurred_on','2026-09-02',
      'description','Alvo','account_id',(select v from t where k='wallet')
    ))) -> 'ids' ->> 0)::uuid;

  perform pg_temp.refuses(format(
    'select public.api_delete_entry(%L, %L)',
    (select v from t where k='other_token'), v_id),
    'unknown_entry', 'token de outro usuário não apaga este lançamento');

  perform public.api_delete_entry((select v from t where k='token'), v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- list_recent_transactions: the filters
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_out jsonb;
begin
  -- The blocks above left one entry standing in September, and a total that
  -- silently includes it would pass while meaning nothing. Filters are asserted
  -- against exactly the rows this block creates.
  delete from public.entries where user_id = (select v from t where k='user')::uuid;

  -- Three months, two categories, two accounts, so every filter has something
  -- to exclude as well as something to keep.
  perform public.api_create_entries(v_token, jsonb_build_array(
    jsonb_build_object('kind','expense','amount_cents',3000,'occurred_on','2026-08-15',
      'description','Jogo de agosto','account_id',(select v from t where k='bank'),
      'category_id',(select v from t where k='cat_spend'),
      'subcategory_id',(select v from t where k='sub_games')),
    jsonb_build_object('kind','expense','amount_cents',5000,'occurred_on','2026-09-15',
      'description','Jogo de setembro','account_id',(select v from t where k='bank'),
      'category_id',(select v from t where k='cat_spend'),
      'subcategory_id',(select v from t where k='sub_games')),
    jsonb_build_object('kind','expense','amount_cents',7000,'occurred_on','2026-09-20',
      'description','Aluguel','account_id',(select v from t where k='wallet'),
      'category_id',(select v from t where k='cat_other'),
      'subcategory_id',(select v from t where k='sub_rent')),
    jsonb_build_object('kind','income','amount_cents',900000,'occurred_on','2026-09-05',
      'description','Salário','account_id',(select v from t where k='bank'),
      'category_id',(select v from t where k='cat_income'))
  ));

  -- The question the filters exist for: "quanto gastei com jogos esse mês".
  v_out := public.api_recent_entries(v_token, 50, '2026-09-01', '2026-09-30',
    null, (select v from t where k='sub_games')::uuid);

  perform pg_temp.ok((v_out ->> 'matching')::int = 1,
    'filtro de subcategoria + intervalo isola uma linha');
  perform pg_temp.ok((v_out ->> 'total_cents')::bigint = 5000,
    'o total vem somado do banco, não à mão');
  perform pg_temp.ok(v_out -> 'filters' ->> 'from_date' = '2026-09-01',
    'os filtros aplicados voltam no retorno');

  -- Date bounds are inclusive on both ends.
  v_out := public.api_recent_entries(v_token, 50, '2026-08-15', '2026-08-15');
  perform pg_temp.ok((v_out ->> 'matching')::int = 1,
    'from_date e to_date são inclusivos');

  -- Category, which is broader than the subcategory above.
  v_out := public.api_recent_entries(v_token, 50, null, null,
    (select v from t where k='cat_spend')::uuid);
  perform pg_temp.ok((v_out ->> 'matching')::int = 2,
    'filtro de categoria pega os dois meses');

  -- Account.
  v_out := public.api_recent_entries(v_token, 50, null, null, null, null,
    (select v from t where k='wallet')::uuid);
  perform pg_temp.ok((v_out ->> 'matching')::int = 1
                 and v_out -> 'entries' -> 0 ->> 'description' = 'Aluguel',
    'filtro de conta isola a carteira');

  -- Expense and income are totalled apart, since adding them would be nonsense.
  v_out := public.api_recent_entries(v_token, 50, '2026-09-01', '2026-09-30');
  perform pg_temp.ok((v_out ->> 'expense_cents')::bigint = 12000
                 and (v_out ->> 'income_cents')::bigint = 900000,
    'gasto e entrada são somados separadamente');

  -- The count is of everything matching, not of the page.
  v_out := public.api_recent_entries(v_token, 1, '2026-09-01', '2026-09-30');
  perform pg_temp.ok((v_out ->> 'matching')::int = 3
                 and (v_out ->> 'returned')::int = 1
                 and jsonb_array_length(v_out -> 'entries') = 1,
    'limit corta a página sem falsear o total');
  perform pg_temp.ok((v_out ->> 'expense_cents')::bigint = 12000,
    'e o total continua sendo o total, não o da página');

  -- No filters at all still works, and still isolates by owner.
  perform pg_temp.ok(
    (public.api_recent_entries((select v from t where k='other_token'))
      ->> 'matching')::int = 0,
    'outro usuário não enxerga estes lançamentos');
end;
$$;

-- ---------------------------------------------------------------------------
-- The repair for series the old api_create_entries scattered
-- ---------------------------------------------------------------------------

do $$
declare
  v_token text := (select v from t where k = 'token');
  v_group uuid;
  v_repaired integer;
begin
  perform public.api_create_entries(v_token, jsonb_build_array(jsonb_build_object(
    'kind','expense','amount_cents', 30000, 'occurred_on','2026-11-01',
    'installments', 3, 'description','Geladeira',
    'account_id',(select v from t where k='bank'))));

  select installment_group_id into v_group from public.entries
  where description = 'Geladeira' and installment_number = 1;

  perform pg_temp.ok((select count(distinct installment_group_id) from public.entries
      where description = 'Geladeira') = 1,
    'a função corrigida agrupa as parcelas sob um id só');

  -- Scatter it the way the old version did, then watch the repair undo that.
  update public.entries set installment_group_id = gen_random_uuid()
  where description = 'Geladeira';

  perform pg_temp.ok((select count(distinct installment_group_id) from public.entries
      where description = 'Geladeira') = 3,
    'a série foi espalhada para o teste');

  v_repaired := public.repair_installment_groups();

  perform pg_temp.ok(v_repaired = 2, 'o reparo religa as duas parcelas soltas');
  perform pg_temp.ok((select count(distinct installment_group_id) from public.entries
      where description = 'Geladeira') = 1,
    'a série volta a ter um grupo só');

  -- And it is idempotent: nothing left to fix means nothing touched.
  perform pg_temp.ok(public.repair_installment_groups() = 0,
    'rodar o reparo de novo não mexe em linha nenhuma');
end;
$$;

do $$ begin raise notice '--- todos os testes passaram ---'; end; $$;

rollback;
