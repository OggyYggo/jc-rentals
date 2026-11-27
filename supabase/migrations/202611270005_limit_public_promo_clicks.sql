create function public.record_promo_click_limited(p_car_id uuid, p_source text, p_caller text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  minute_bucket timestamptz := date_trunc('minute', now());
  owner_uuid uuid;
begin
  if p_source is null or p_source not in ('post', 'story', 'poster', 'sticker', 'cover', 'share')
     or p_caller is null or p_caller !~ '^[0-9a-f]{64}$' then return; end if;

  select owner_id into owner_uuid from public.cars where id = p_car_id and is_active;
  if owner_uuid is null then return; end if;

  insert into public.payment_request_limits as limits(scope, caller, bucket, requests)
    values ('promo-ip', p_caller, minute_bucket, 1)
  on conflict (scope, caller, bucket) do update set requests = limits.requests + 1
    where limits.requests < 20;
  if not found then return; end if;

  insert into public.payment_request_limits as limits(scope, caller, bucket, requests)
    values ('promo-car', p_car_id::text, minute_bucket, 1)
  on conflict (scope, caller, bucket) do update set requests = limits.requests + 1
    where limits.requests < 120;
  if not found then return; end if;

  insert into public.promo_clicks (car_id, owner_id, src) values (p_car_id, owner_uuid, p_source);
end;
$$;
revoke all on function public.record_promo_click_limited(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_promo_click_limited(uuid, text, text) to service_role;
