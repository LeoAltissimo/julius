-- seed_default_categories(uuid) is security definer, so leaving it callable by
-- the authenticated role would let any signed in user write categories into
-- someone else's account just by passing their id. It goes back to being an
-- internal helper for the signup trigger, and the app gets a wrapper that can
-- only ever act on the caller.

revoke all on function public.seed_default_categories(uuid) from authenticated;

create or replace function public.restore_default_categories()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform public.seed_default_categories(v_user_id);
end;
$$;

revoke all on function public.restore_default_categories() from public, anon;
grant execute on function public.restore_default_categories() to authenticated;
