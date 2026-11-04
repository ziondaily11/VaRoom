-- Apply AFTER the analytics page that calls host_analytics_overview is live.
--
-- The v1 analytics functions (20261009_000033) return the same data without
-- the subscription check in host_analytics_overview, so signed-in users can no
-- longer call them. They are kept for rollback; host_plan_payments stays
-- available because it is the host's own billing history.

revoke execute on function public.host_booking_summary(date, date) from authenticated;
revoke execute on function public.host_booking_trend(date, date, text) from authenticated;
revoke execute on function public.host_listing_ranking(date, date) from authenticated;
revoke execute on function public.host_reservation_summary(date, date) from authenticated;
revoke execute on function public.host_review_summary() from authenticated;
