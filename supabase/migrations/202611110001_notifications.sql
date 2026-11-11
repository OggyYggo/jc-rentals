create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, title text not null, body text, url text,
  booking_id uuid references public.bookings(id) on delete set null,
  dedupe_key text, channels text[] not null default '{in_app}',
  critical boolean not null default false, read_at timestamptz,
  email_sent_at timestamptz, push_sent_at timestamptz, delivery_error text,
  delivery_attempts integer not null default 0, created_at timestamptz not null default now()
);
create unique index if not exists notifications_dedupe_uq on public.notifications(user_id,dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_recent_idx on public.notifications(user_id,created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id) where read_at is null;
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true, push_enabled boolean not null default true,
  muted_types text[] not null default '{}'
);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null, user_agent text,
  created_at timestamptz not null default now(), last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "own prefs read" on public.notification_preferences;
create policy "own prefs read" on public.notification_preferences for select to authenticated using (user_id=auth.uid());
drop policy if exists "own prefs insert" on public.notification_preferences;
create policy "own prefs insert" on public.notification_preferences for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "own prefs update" on public.notification_preferences;
create policy "own prefs update" on public.notification_preferences for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "own subs read" on public.push_subscriptions;
create policy "own subs read" on public.push_subscriptions for select to authenticated using (user_id=auth.uid());
drop policy if exists "own subs insert" on public.push_subscriptions;
create policy "own subs insert" on public.push_subscriptions for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "own subs delete" on public.push_subscriptions;
create policy "own subs delete" on public.push_subscriptions for delete to authenticated using (user_id=auth.uid());
grant select on public.notifications, public.notification_preferences, public.push_subscriptions to authenticated;
grant insert,update,delete on public.notification_preferences, public.push_subscriptions to authenticated;
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path=public as $$
 update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null and (p_ids is null or id=any(p_ids));
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
create or replace function public.notify(p_user uuid,p_type text,p_title text,p_body text,p_url text,p_booking uuid default null,p_channels text[] default '{in_app}',p_critical boolean default false,p_dedupe text default null)
returns void language plpgsql security definer set search_path=public as $$
declare prefs public.notification_preferences%rowtype; v_channels text[]:=p_channels;
begin
 if p_user is null then return; end if;
 select * into prefs from public.notification_preferences where user_id=p_user;
 if not p_critical and found then
  if not prefs.email_enabled then v_channels:=array_remove(v_channels,'email'); end if;
  if not prefs.push_enabled then v_channels:=array_remove(v_channels,'push'); end if;
  if p_type=any(prefs.muted_types) then v_channels:='{in_app}'; end if;
 end if;
 insert into public.notifications(user_id,type,title,body,url,booking_id,channels,critical,dedupe_key)
 values(p_user,p_type,p_title,p_body,p_url,p_booking,v_channels,p_critical,p_dedupe)
 on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
end $$;
revoke all on function public.notify(uuid,text,text,text,text,uuid,text[],boolean,text) from public,authenticated;
create or replace function public.notify_admins(p_type text,p_title text,p_body text,p_url text,p_channels text[] default '{in_app,push}',p_critical boolean default false,p_dedupe text default null)
returns void language plpgsql security definer set search_path=public as $$
declare a uuid; begin for a in select id from public.profiles where role='admin' loop
 perform public.notify(a,p_type,p_title,p_body,p_url,null,p_channels,p_critical,case when p_dedupe is null then null else p_dedupe||':'||a::text end);
end loop; end $$;
revoke all on function public.notify_admins(text,text,text,text,text[],boolean,text) from public,authenticated;
create or replace function public.notify_booking_events() returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner_user uuid; begin
 select profile_id into v_owner_user from public.owners where id=new.owner_id;
 if tg_op='INSERT' then
  perform public.notify(v_owner_user,'new_booking','New booking request','A customer booked one of your cars.','/owner/bookings',new.id,'{in_app,email,push}',false,'new-booking:'||new.id);
  perform public.notify(new.customer_id,'booking_created','Booking created','Your booking request was received.','/account/bookings',new.id,'{in_app,email}',false,'booking-created:'||new.id);
  return new;
 end if;
 if new.status is not distinct from old.status then return new; end if;
 if new.status='payment_review' then
  perform public.notify(v_owner_user,'payment_proof_uploaded','Payment proof to verify','A customer uploaded a deposit proof. Please review it.','/owner/payments',new.id,'{in_app,email,push}',true,'proof:'||new.id||':'||clock_timestamp()::text);
 elsif new.status='confirmed' then
  perform public.notify(new.customer_id,'payment_verified','Booking confirmed','Your deposit was verified.','/account/bookings',new.id,'{in_app,email,push}',true,'verified:'||new.id);
 elsif new.status in ('cancelled','rejected','expired') then
  perform public.notify(new.customer_id,case when new.status='expired' then 'booking_expired' else 'booking_cancelled' end,'Booking update','Your booking status has changed.','/account/bookings',new.id,'{in_app,email}',false,'booking-status:'||new.id||':'||new.status);
  if auth.uid() is distinct from v_owner_user then perform public.notify(v_owner_user,'booking_cancelled','Booking cancelled','A booking was cancelled.','/owner/bookings',new.id,'{in_app,email,push}',false,'owner-cancel:'||new.id||':'||new.status); end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_notify_booking_events on public.bookings;
create trigger trg_notify_booking_events after insert or update of status on public.bookings for each row execute function public.notify_booking_events();
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
