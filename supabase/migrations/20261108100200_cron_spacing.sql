-- R11 (decision D2 of Roberto): scheduled promotions may start or end up to 5 minutes late; WhatsApp notices stay
-- every minute. The promotion job ran every minute (1 440 cold starts a day, 30–45 ms each, ~3 % of the database
-- time of an idle Nano) and on the same second as the WhatsApp dispatcher.
--   * kshop-promotion-boundaries: every 5 minutes, at minutes 2, 7, 12… (not with the dispatcher at :00).
--   * The window that finds promotions starting or ending grows from 3 to 7 minutes, so every boundary is seen by at
--     least one run (5 minutes apart plus 2 of slack for a late start). Seeing one twice only refreshes it again.
--   * cron.job_run_details is purged daily (it grew ~2 880 rows a day with nothing removing them).

create or replace function private.refresh_promotion_boundaries()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_store uuid;
begin
  for v_store in
    select store_id from public.promotions
    where is_active
      and (starts_at between now() - interval '7 minutes' and now()
        or ends_at between now() - interval '7 minutes' and now())
    union
    select store_id from public.variant_promotions where ends_at <= now()
  loop
    perform private.refresh_store_promotions(v_store);
  end loop;
end;
$$;

select cron.alter_job(
  (select jobid from cron.job where jobname = 'kshop-promotion-boundaries'),
  schedule := '2-59/5 * * * *'
);

select cron.schedule(
  'kshop-cron-purge',
  '40 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
