-- Audit timestamps are authoritative when present. Treat older unrecorded returns as observed today.
update public.bookings b set
  returned_at=case when b.status='returned' then coalesce((
    select max(created_at) from public.audit_log where entity_type='booking' and entity_id=b.id::text and changes->'status'->>'to'='returned'
  ),now()) end,
  completed_at=case when b.status='completed' then coalesce((
    select max(created_at) from public.audit_log where entity_type='booking' and entity_id=b.id::text and changes->'status'->>'to'='completed'
  ),(b.end_date+1)::timestamp at time zone 'Asia/Manila') end
where b.status in ('returned','completed');

create index bookings_returned_review_idx on public.bookings(returned_at) where status='returned';
create index bookings_completed_review_idx on public.bookings(completed_at) where status='completed';

create function public.track_trip_completion() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.returned_at := case when new.status='returned' then now() end;
    new.completed_at := case when new.status='completed' then now() end;
  else
    new.returned_at := case when new.status='returned' and old.status<>new.status then now() else old.returned_at end;
    new.completed_at := case when new.status='completed' and old.status<>new.status then now() else old.completed_at end;
  end if;
  return new;
end;
$$;
create trigger track_trip_completion before insert or update on public.bookings
  for each row execute function public.track_trip_completion();

create function public.send_trip_review_prompt(p_trip public.bookings,p_reminder boolean)
returns void language plpgsql security definer set search_path='' as $$
declare vehicle text; owner_name text;
begin
  if exists(select 1 from public.reviews where booking_id=p_trip.id) then return; end if;
  select concat_ws(' ',c.brand,c.model),o.business_name into vehicle,owner_name
    from public.cars c left join public.owners o on o.id=p_trip.owner_id where c.id=p_trip.car_id;
  perform public.notify(p_trip.customer_id,case when p_reminder then 'review_reminder' else 'review_prompt' end,
    case when p_reminder then 'A reminder to review your trip' else 'How was your trip?' end,
    'Rate '||coalesce(nullif(left(public.audit_safe_note(vehicle),80),''),'your vehicle')||' and '||
      coalesce(nullif(left(public.audit_safe_note(owner_name),80),''),'your rental experience')||'.',
    '/account/bookings?review='||p_trip.id||'#trip-'||p_trip.id,p_trip.id,'{in_app,email,push}',false,
    case when p_reminder then 'review-reminder:' else 'review-prompt:' end||p_trip.id);
end;
$$;

create function public.notify_trip_review_prompt() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.send_trip_review_prompt(new,false);
  end if;
  return new;
end;
$$;
create trigger notify_trip_review_prompt after insert or update of status on public.bookings
  for each row execute function public.notify_trip_review_prompt();

create function public.auto_complete_returned_bookings() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer; previous_actor text := current_setting('app.audit_actor',true);
begin
  perform set_config('app.audit_actor','cron:auto_complete_returned_bookings',true);
  update public.bookings set status='completed' where status='returned' and returned_at<=now()-interval '48 hours';
  get diagnostics affected=row_count;
  perform set_config('app.audit_actor',coalesce(previous_actor,''),true);
  return affected;
end;
$$;

create function public.send_trip_review_reminders() returns void
language plpgsql security definer set search_path='' as $$
declare trip public.bookings;
begin
  for trip in select b.* from public.bookings b where b.status='completed'
    and b.completed_at between now()-interval '60 days' and now()-interval '3 days'
    and not exists(select 1 from public.reviews where booking_id=b.id)
    and exists(select 1 from public.notifications where user_id=b.customer_id and dedupe_key='review-prompt:'||b.id)
    and not exists(select 1 from public.notifications where user_id=b.customer_id and dedupe_key='review-reminder:'||b.id)
    for update of b skip locked
  loop
    perform public.send_trip_review_prompt(trip,true);
  end loop;
end;
$$;
revoke all on function public.track_trip_completion(),public.send_trip_review_prompt(public.bookings,boolean),
  public.notify_trip_review_prompt(),public.auto_complete_returned_bookings(),public.send_trip_review_reminders()
  from public,anon,authenticated,service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('complete-returned-trips','5 * * * *','select public.auto_complete_returned_bookings()');
    perform cron.schedule('review-trip-reminders','15 * * * *','select public.send_trip_review_reminders()');
  end if;
end $$;
