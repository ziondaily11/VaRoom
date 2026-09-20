-- Paystack TEST MODE recurring-plan mapping.
-- These codes are server-owned and intentionally never sent by the browser.
-- Replace only in a separate, reviewed Live Mode migration after Live plans exist.

update public.billing_plans
set paystack_plan_code = case id
  when 'basic' then 'PLN_mf3hll9nlv8neac'
  when 'growth' then 'PLN_g6pfynz64r22zxc'
  when 'pro' then 'PLN_6prll87cf5e5090'
end,
updated_at = now()
where id in ('basic', 'growth', 'pro');

do $$
begin
  if (select count(*) from public.billing_plans
      where id in ('basic', 'growth', 'pro') and paystack_plan_code is not null) <> 3 then
    raise exception 'All three VaRoom Paystack Test Mode plan codes must be configured';
  end if;
end;
$$;
