-- Current balance per account.
--
-- security_invoker makes the view run with the caller's privileges, so the row
-- level security on accounts and entries applies exactly as it would to a
-- direct query: there is no way to read someone else's balance through it.
--
-- Sign convention: money you hold is positive, so on a credit card the balance
-- goes negative as you spend, which is what you owe.

create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.opening_balance_cents + coalesce(movement.delta_cents, 0) as balance_cents
from public.accounts a
left join lateral (
  select coalesce(
    sum(
      case
        when e.kind = 'income' and e.account_id = a.id then e.amount_cents
        when e.kind = 'expense' and e.account_id = a.id then -e.amount_cents
        when e.kind = 'transfer' and e.account_id = a.id then -e.amount_cents
        when e.kind = 'transfer' and e.counter_account_id = a.id then e.amount_cents
        else 0
      end
    ),
    0
  ) as delta_cents
  from public.entries e
  where e.account_id = a.id or e.counter_account_id = a.id
) as movement on true;

revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;
