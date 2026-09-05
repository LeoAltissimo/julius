-- Triggers, and the starter data a brand new account wakes up with.

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger subcategories_set_updated_at
  before update on public.subcategories
  for each row execute function public.set_updated_at();

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

create trigger investments_set_updated_at
  before update on public.investments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- investment value history
-- ---------------------------------------------------------------------------

-- Runs as definer because investment_snapshots deliberately has no insert
-- policy: only this trigger may append to the history.
create or replace function public.record_investment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.current_value_cents = old.current_value_cents then
    return new;
  end if;

  new.value_updated_at := now();

  insert into public.investment_snapshots (user_id, investment_id, value_cents)
  values (new.user_id, new.id, new.current_value_cents);

  return new;
end;
$$;

revoke all on function public.record_investment_snapshot() from public, anon, authenticated;

create trigger investments_record_snapshot
  after insert on public.investments
  for each row execute function public.record_investment_snapshot();

create trigger investments_record_snapshot_on_update
  before update of current_value_cents on public.investments
  for each row execute function public.record_investment_snapshot();

-- ---------------------------------------------------------------------------
-- starter categories
-- ---------------------------------------------------------------------------

-- Two levels, exactly as the app models them: a macro category with a colour,
-- and the concrete places money actually goes underneath it. These are only a
-- starting point -- everything is editable in the app.
create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_defaults jsonb := $json$
  [
    {"name": "Moradia", "kind": "expense", "color": "#0ea5e9",
     "subs": ["Aluguel", "Condomínio", "Energia", "Água", "Internet", "Gás", "Manutenção", "IPTU"]},
    {"name": "Alimentação", "kind": "expense", "color": "#f97316",
     "subs": ["Mercado", "iFood", "Restaurante", "Padaria", "Frutaria", "Café", "Delivery"]},
    {"name": "Transporte", "kind": "expense", "color": "#8b5cf6",
     "subs": ["Combustível", "Uber", "Estacionamento", "Manutenção do carro", "Transporte público", "Pedágio"]},
    {"name": "Saúde", "kind": "expense", "color": "#ef4444",
     "subs": ["Psicóloga", "Dentista", "Exames", "Consultas", "Farmácia", "Plano de saúde", "Academia"]},
    {"name": "Lazer", "kind": "expense", "color": "#ec4899",
     "subs": ["Steam", "Cinema", "Bar", "Jogos", "Shows", "Hobbies"]},
    {"name": "Assinaturas", "kind": "expense", "color": "#6366f1",
     "subs": ["Streaming", "Software", "Celular", "Nuvem", "Notícias"]},
    {"name": "Educação", "kind": "expense", "color": "#14b8a6",
     "subs": ["Cursos", "Livros", "Faculdade", "Certificações"]},
    {"name": "Compras", "kind": "expense", "color": "#a855f7",
     "subs": ["Roupas", "Eletrônicos", "Casa", "Presentes", "Beleza"]},
    {"name": "Viagem", "kind": "expense", "color": "#22c55e",
     "subs": ["Passagens", "Hospedagem", "Alimentação em viagem", "Passeios", "Seguro viagem"]},
    {"name": "Pets", "kind": "expense", "color": "#eab308",
     "subs": ["Ração", "Veterinário", "Petshop", "Brinquedos"]},
    {"name": "Impostos e tarifas", "kind": "expense", "color": "#78716c",
     "subs": ["Impostos", "Tarifas bancárias", "Multas", "Juros"]},
    {"name": "Investimentos", "kind": "expense", "color": "#0f766e",
     "subs": ["Aporte", "Reserva de emergência", "Previdência"]},
    {"name": "Outros", "kind": "expense", "color": "#64748b",
     "subs": ["Diversos", "Doações", "Não identificado"]},

    {"name": "Salário", "kind": "income", "color": "#16a34a",
     "subs": ["Salário", "13º", "Férias", "Bônus"]},
    {"name": "Trabalho autônomo", "kind": "income", "color": "#059669",
     "subs": ["Projetos", "Consultoria", "Pró-labore"]},
    {"name": "Rendimentos", "kind": "income", "color": "#0d9488",
     "subs": ["Juros", "Dividendos", "Aluguéis", "Resgate"]},
    {"name": "Outros", "kind": "income", "color": "#64748b",
     "subs": ["Reembolso", "Presente", "Venda", "Cashback"]}
  ]
  $json$;
  v_category jsonb;
  v_sub text;
  v_category_id uuid;
  v_category_order integer := 0;
  v_sub_order integer;
begin
  for v_category in select * from jsonb_array_elements(v_defaults)
  loop
    insert into public.categories (user_id, name, kind, color, sort_order)
    values (
      p_user_id,
      v_category ->> 'name',
      (v_category ->> 'kind')::public.category_kind,
      v_category ->> 'color',
      v_category_order
    )
    on conflict do nothing
    returning id into v_category_id;

    v_category_order := v_category_order + 10;

    if v_category_id is null then
      continue;
    end if;

    v_sub_order := 0;
    for v_sub in select * from jsonb_array_elements_text(v_category -> 'subs')
    loop
      insert into public.subcategories (user_id, category_id, name, sort_order)
      values (p_user_id, v_category_id, v_sub, v_sub_order)
      on conflict do nothing;

      v_sub_order := v_sub_order + 10;
    end loop;
  end loop;
end;
$$;

revoke all on function public.seed_default_categories(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- new user bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  insert into public.accounts (user_id, name, type, color, sort_order)
  values (new.id, 'Carteira', 'cash', '#64748b', 0)
  on conflict do nothing;

  perform public.seed_default_categories(new.id);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
