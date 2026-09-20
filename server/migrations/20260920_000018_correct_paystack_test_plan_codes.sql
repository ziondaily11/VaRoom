-- Corrected Paystack TEST MODE recurring-plan codes supplied after plan lookup.
-- The browser still submits only basic, growth, or pro; these values remain
-- server-owned database configuration.

update public.billing_plans
set paystack_plan_code = case id
  when 'growth' then 'PLN_g6pfynz64r22zcx'
  when 'pro' then 'PLN_6pr1l87cfne5o90'
  else paystack_plan_code
end,
updated_at = now()
where id in ('growth', 'pro');

do $$
begin
  if (select paystack_plan_code from public.billing_plans where id = 'growth') <> 'PLN_g6pfynz64r22zcx' then
    raise exception 'Growth Paystack Test Mode plan code was not configured';
  end if;
  if (select paystack_plan_code from public.billing_plans where id = 'pro') <> 'PLN_6pr1l87cfne5o90' then
    raise exception 'Pro Paystack Test Mode plan code was not configured';
  end if;
end;
$$;
