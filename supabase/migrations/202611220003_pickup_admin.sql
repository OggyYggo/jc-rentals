insert into public.admin_alert_rules(event_key,label,description,mode,default_mode)
values ('pickup.override','Pickup override','A pickup was confirmed outside the allowed window or with admin assistance.','digest','digest');

create function public.admin_reset_pickup_pass(p_booking uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'PASS_NOT_VALID'; end if;
  if char_length(reason) not between 5 and 200 then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'confirmed' or not public.pickup_reservation_verified(b) then raise exception 'PASS_NOT_VALID'; end if;
  if exists(select 1 from public.booking_pickup_passes where booking_id = b.id) then
    update public.booking_pickup_passes set status = 'revoked' where booking_id = b.id;
    perform public.log_pickup_event(b.id,'pass_revoked',jsonb_build_object('reason',public.pickup_safe_note(reason)));
    perform public.issue_pickup_credentials(b.id,b.owner_id,true);
  else
    perform public.ensure_pickup_pass(b.id);
  end if;
  perform public.log_pickup_event(b.id,'pass_rotated',jsonb_build_object('reason',public.pickup_safe_note(reason),'admin_reset',true));
  perform public.notify(b.customer_id,'pickup_pass_reset','Your pickup pass was replaced',
    'Open the current pickup pass from your booking.','/account/bookings/'||b.id||'/pickup',b.id,'{in_app,push}',true,null);
end;
$$;

create function public.admin_set_pickup_settings(p_early integer,p_late integer,p_docs boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Not allowed.'; end if;
  if not coalesce(p_early between 0 and 3 and p_late between 0 and 3,false) or p_docs is null
    then raise exception 'Enter pickup windows from 0 to 3 days.'; end if;
  insert into public.settings(key,value,updated_by) values
    ('pickup_early_days',to_jsonb(p_early),auth.uid()),('pickup_late_days',to_jsonb(p_late),auth.uid()),
    ('pickup_require_verified_docs',to_jsonb(p_docs),auth.uid())
  on conflict (key) do update set value = excluded.value,updated_by = excluded.updated_by,updated_at = now()
  where public.settings.value is distinct from excluded.value;
end;
$$;

create function public.admin_pickup_metrics()
returns table(scanned bigint,manual bigint,overrides bigint)
language sql stable security definer set search_path = '' as $$
  select count(*) filter (where kind = 'pickup_confirmed'),count(*) filter (where kind = 'manual'),
    count(*) filter (where kind = 'override')
  from public.booking_pickup_events where public.is_admin() and created_at >= now() - interval '30 days'
$$;

revoke all on function public.admin_reset_pickup_pass(uuid,text),public.admin_set_pickup_settings(integer,integer,boolean),
 public.admin_pickup_metrics() from public,anon,authenticated;
grant execute on function public.admin_reset_pickup_pass(uuid,text),public.admin_set_pickup_settings(integer,integer,boolean),
 public.admin_pickup_metrics() to authenticated;
