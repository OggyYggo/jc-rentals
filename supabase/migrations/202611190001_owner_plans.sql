create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (char_length(name) between 2 and 40),
  tagline text,
  price_php numeric(10,2) not null default 0 check (price_php >= 0),
  max_active_cars int not null check (max_active_cars between 1 and 1000),
  commission_rate numeric(5,4) not null check (commission_rate between 0 and 0.5),
  support_level text not null default 'email' check (support_level in ('email','priority','priority_onboarding','custom')),
  features jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.owner_plans (
  owner_id uuid primary key references public.owners(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active' check (status in ('active','expired')),
  started_at timestamptz not null default now(), expires_at timestamptz,
  car_limit_override int check (car_limit_override is null or car_limit_override between 1 and 1000),
  commission_override numeric(5,4) check (commission_override is null or commission_override between 0 and 0.5),
  reminder_stage int not null default 0,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.plan_payments (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.owners(id) on delete cascade,
  plan_id uuid not null references public.plans(id), amount numeric(10,2) not null check(amount > 0),
  reference_no text not null check(char_length(reference_no) between 6 and 40), proof_path text,
  status text not null default 'pending' check(status in ('pending','verified','rejected')),
  months int not null default 1 check(months between 1 and 12), period_start timestamptz, period_end timestamptz,
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, reject_reason text, created_at timestamptz not null default now()
);
create unique index plan_payments_reference_unique on public.plan_payments(reference_no);
create unique index plan_payments_one_pending_per_owner on public.plan_payments(owner_id) where status='pending';
create index plan_payments_owner_idx on public.plan_payments(owner_id,created_at desc);
create index plan_payments_status_idx on public.plan_payments(status,created_at desc);
create table public.owner_plan_events (
  id bigint generated always as identity primary key, owner_id uuid not null references public.owners(id) on delete cascade,
  event text not null, from_plan text, to_plan text, detail jsonb not null default '{}'::jsonb,
  actor uuid references public.profiles(id), created_at timestamptz not null default now()
);
alter table public.cars add column plan_hidden boolean not null default false;
insert into public.settings(key,value) values ('plan_grace_days','3'::jsonb),('platform_payment_qr_path','null'::jsonb),('platform_payment_account_name','""'::jsonb) on conflict(key) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('owner-plan-proofs','owner-plan-proofs',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Owners upload own plan proof" on storage.objects;
create policy "Owners upload own plan proof" on storage.objects for insert to authenticated
with check(bucket_id='owner-plan-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Owners read own plan proof" on storage.objects;
create policy "Owners read own plan proof" on storage.objects for select to authenticated
using(bucket_id='owner-plan-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Admins read plan proofs" on storage.objects;
create policy "Admins read plan proofs" on storage.objects for select to authenticated
using(bucket_id='owner-plan-proofs' and public.is_admin());

insert into public.plans(code,name,tagline,price_php,max_active_cars,commission_rate,support_level,features,is_public,is_featured,sort_order) values
('starter','Starter','A simple way to get started',0,3,.05,'email','["Up to 3 active cars","Owner dashboard and booking calendar","Pay commission only on completed bookings"]',true,false,1),
('standard','Standard','For growing local fleets',499,10,.03,'priority','["Up to 10 active cars","Lower 3% commission","Priority email support","Promo kit with your own QR code"]',true,true,2),
('fleet','Fleet','For established operators',1499,30,.02,'priority_onboarding','["Up to 30 active cars","Lowest 2% commission","Priority support","Onboarding help","Promo kit with your own QR code"]',true,false,3),
('custom','Custom','A plan tailored to your fleet',0,1,.05,'custom','[]',false,false,4)
on conflict(code) do nothing;

insert into public.owner_plans(owner_id,plan_id,car_limit_override,commission_override)
select o.id,p.id,greatest(3,(select count(*) from public.cars c where c.owner_id=o.id and c.is_active)),o.commission_rate
from public.owners o cross join public.plans p where p.code='starter' on conflict(owner_id) do nothing;
insert into public.owner_plan_events(owner_id,event,to_plan,detail)
select op.owner_id,'assigned','starter',jsonb_build_object('backfill',true) from public.owner_plans op
where not exists(select 1 from public.owner_plan_events e where e.owner_id=op.owner_id);

alter table public.plans enable row level security;
alter table public.owner_plans enable row level security;
alter table public.plan_payments enable row level security;
alter table public.owner_plan_events enable row level security;
create policy "Public can read public plans" on public.plans for select to anon,authenticated using(is_public and is_active);
create policy "Admins manage plans" on public.plans for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "Owners read own plan" on public.owner_plans for select to authenticated using(owner_id in(select id from public.owners where profile_id=auth.uid()) or public.is_admin());
create policy "Admins manage owner plans" on public.owner_plans for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "Owner read own plan payments" on public.plan_payments for select to authenticated using(owner_id in(select id from public.owners where profile_id=auth.uid()) or public.is_admin());
create policy "Admins manage plan payments" on public.plan_payments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "Owner read plan events" on public.owner_plan_events for select to authenticated using(owner_id in(select id from public.owners where profile_id=auth.uid()) or public.is_admin());
grant select on public.plans to anon,authenticated;
grant insert,update,delete on public.plans to authenticated;
grant select on public.owner_plans,public.plan_payments,public.owner_plan_events to authenticated;
grant usage,select on sequence public.owner_plan_events_id_seq to authenticated;

create or replace function public.owner_effective_plan(p_owner uuid)
returns table(plan_id uuid,plan_code text,max_cars int,commission numeric,expires_at timestamptz,expired boolean)
language plpgsql stable security definer set search_path=public as $$
declare v_op public.owner_plans%rowtype; v_plan public.plans%rowtype; v_starter public.plans%rowtype; v_grace int;
begin
 if not(public.is_admin() or exists(select 1 from public.owners where id=p_owner and profile_id=auth.uid())) then return; end if;
 select * into v_starter from public.plans where code='starter';
 select coalesce((value#>>'{}')::int,3) into v_grace from public.settings where key='plan_grace_days'; v_grace:=coalesce(v_grace,3);
 select * into v_op from public.owner_plans where owner_id=p_owner;
 select * into v_plan from public.plans where id=v_op.plan_id;
 if not found or (v_op.expires_at is not null and v_op.expires_at+make_interval(days=>v_grace)<=now()) then
   return query select v_starter.id,v_starter.code,coalesce(v_op.car_limit_override,v_starter.max_active_cars),v_starter.commission_rate,null::timestamptz,true; return;
 end if;
 return query select v_plan.id,v_plan.code,coalesce(v_op.car_limit_override,v_plan.max_active_cars),coalesce(v_op.commission_override,v_plan.commission_rate),v_op.expires_at,false;
end $$;
create or replace function public.owner_car_usage(p_owner uuid)
returns table(used int,max_cars int) language sql stable security definer set search_path=public as $$
 select (select count(*)::int from public.cars c where c.owner_id=p_owner and c.is_active),e.max_cars from public.owner_effective_plan(p_owner)e
$$;
revoke all on function public.owner_effective_plan(uuid),public.owner_car_usage(uuid) from public,anon;
grant execute on function public.owner_effective_plan(uuid),public.owner_car_usage(uuid) to authenticated;

create or replace function public.enforce_car_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare v_max int; v_used int;
begin
 if new.is_active is not true then return new; end if;
 if tg_op='UPDATE' and old.is_active and new.owner_id=old.owner_id then return new; end if;
 perform 1 from public.owners where id=new.owner_id for update;
 select max_cars into v_max from public.owner_effective_plan(new.owner_id);
 select count(*) into v_used from public.cars where owner_id=new.owner_id and is_active and id is distinct from new.id;
 if v_used>=coalesce(v_max,0) then raise exception 'CAR_LIMIT_REACHED' using errcode='P0001',detail=format('limit=%s used=%s',v_max,v_used),hint='Upgrade your plan to publish more cars.'; end if;
 return new;
end $$;
revoke all on function public.enforce_car_limit() from public,anon,authenticated;
drop trigger if exists enforce_car_limit on public.cars;
create trigger enforce_car_limit before insert or update of is_active,owner_id on public.cars for each row execute function public.enforce_car_limit();

create or replace function public.reset_owner_payment_qr_verification() returns trigger language plpgsql set search_path='' as $$
begin
 if new.payment_method_label is distinct from old.payment_method_label or new.payment_account_name is distinct from old.payment_account_name or new.payment_qr_path is distinct from old.payment_qr_path then new.payment_qr_verified:=false; end if;
 if not public.is_admin() and auth.uid()=old.profile_id then
  if new.business_name is distinct from old.business_name or new.contact_phone is distinct from old.contact_phone or
   (new.commission_rate is distinct from old.commission_rate and current_setting('app.plan_sync',true) is distinct from 'on') or
   new.is_active is distinct from old.is_active or new.fee_mode is distinct from old.fee_mode or new.deposit_percent is distinct from old.deposit_percent or new.payment_qr_verified is distinct from old.payment_qr_verified then
    raise exception 'Only administrators can change business access, fees, deposit percent, and QR verification.';
  end if;
 end if; return new;
end $$;

create or replace function public.sync_owner_plan(p_owner uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_rate numeric; v_op public.owner_plans%rowtype; v_plan public.plans%rowtype; v_starter public.plans%rowtype; v_grace int;
begin
 select * into v_starter from public.plans where code='starter';
 select coalesce((value#>>'{}')::int,3) into v_grace from public.settings where key='plan_grace_days'; v_grace:=coalesce(v_grace,3);
 select * into v_op from public.owner_plans where owner_id=p_owner;
 select * into v_plan from public.plans where id=v_op.plan_id;
 if not found or (v_op.expires_at is not null and v_op.expires_at+make_interval(days=>v_grace)<=now()) then v_rate:=v_starter.commission_rate;
 else v_rate:=coalesce(v_op.commission_override,v_plan.commission_rate); end if;
 perform set_config('app.plan_sync','on',true);
 update public.owners set commission_rate=v_rate where id=p_owner and commission_rate is distinct from v_rate;
end $$;
revoke all on function public.sync_owner_plan(uuid) from public,anon,authenticated;

create or replace function public.admin_activate_owner_plan(p_owner uuid,p_plan_code text,p_months int default 1,p_payment uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_plan public.plans%rowtype; v_old public.owner_plans%rowtype; v_exp timestamptz; v_profile uuid; v_usage int; v_hidden uuid; v_restored int:=0;
begin
 if not public.is_admin() then raise exception 'Administrator access required.'; end if;
 if p_months<1 or p_months>12 then raise exception 'Months must be between 1 and 12.'; end if;
 select * into v_plan from public.plans where code=p_plan_code and is_active; if not found then raise exception 'Plan unavailable.'; end if;
 select * into v_old from public.owner_plans where owner_id=p_owner;
 if p_plan_code='starter' then v_exp:=null; elsif v_old.plan_id=v_plan.id and (v_old.expires_at is null or v_old.expires_at>now()) then v_exp:=coalesce(v_old.expires_at,now())+make_interval(days=>30*p_months); else v_exp:=now()+make_interval(days=>30*p_months); end if;
 insert into public.owner_plans(owner_id,plan_id,status,started_at,expires_at,reminder_stage,updated_by) values(p_owner,v_plan.id,'active',now(),v_exp,0,auth.uid())
 on conflict(owner_id) do update set plan_id=excluded.plan_id,status='active',started_at=excluded.started_at,expires_at=excluded.expires_at,reminder_stage=0,updated_by=excluded.updated_by,updated_at=now();
 if p_payment is not null then update public.plan_payments set status='verified',reviewed_by=auth.uid(),reviewed_at=now(),period_start=now(),period_end=v_exp where id=p_payment and owner_id=p_owner; end if;
 perform public.sync_owner_plan(p_owner);
 select profile_id into v_profile from public.owners where id=p_owner;
 select count(*) into v_usage from public.cars where owner_id=p_owner and is_active;
 for v_hidden in select id from public.cars where owner_id=p_owner and plan_hidden and not is_active order by created_at asc loop
  exit when v_usage>=v_plan.max_active_cars;
  update public.cars set is_active=true,plan_hidden=false where id=v_hidden; v_usage:=v_usage+1; v_restored:=v_restored+1;
 end loop;
 insert into public.owner_plan_events(owner_id,event,from_plan,to_plan,detail,actor) values(p_owner,case when v_old.owner_id is null then 'assigned' else 'renewed' end,(select code from public.plans where id=v_old.plan_id),v_plan.code,jsonb_build_object('expires_at',v_exp,'cars_restored',v_restored),auth.uid());
 if v_profile is not null then perform public.notify(v_profile,'plan_activated','Plan activated','Your owner plan is ready to use.','/owner/plan',null,'{in_app,email}',false,'plan-activated:'||p_owner||':'||coalesce(v_exp::text,'starter')); end if;
end $$;
revoke all on function public.admin_activate_owner_plan(uuid,text,int,uuid) from public,anon;
grant execute on function public.admin_activate_owner_plan(uuid,text,int,uuid) to authenticated;

create or replace function public.owner_downgrade_to_starter() returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_starter public.plans%rowtype; v_used int; v_old_code text;
begin
 select id into v_owner from public.owners where profile_id=auth.uid(); if v_owner is null then raise exception 'Owner account required.'; end if;
 select count(*) into v_used from public.cars where owner_id=v_owner and is_active;
 select * into v_starter from public.plans where code='starter';
 if v_used>v_starter.max_active_cars then raise exception 'Hide cars before switching to Starter.'; end if;
 select p.code into v_old_code from public.owner_plans op join public.plans p on p.id=op.plan_id where op.owner_id=v_owner;
 insert into public.owner_plans(owner_id,plan_id,status,started_at,expires_at,car_limit_override,commission_override,reminder_stage,updated_by)
 values(v_owner,v_starter.id,'active',now(),null,null,null,0,auth.uid())
 on conflict(owner_id) do update set plan_id=excluded.plan_id,status='active',started_at=now(),expires_at=null,car_limit_override=null,commission_override=null,reminder_stage=0,updated_by=auth.uid(),updated_at=now();
 perform public.sync_owner_plan(v_owner);
 insert into public.owner_plan_events(owner_id,event,from_plan,to_plan,detail,actor) values(v_owner,'assigned',v_old_code,'starter','{"owner_downgrade":true}'::jsonb,auth.uid());
end $$;
revoke all on function public.owner_downgrade_to_starter() from public,anon;
grant execute on function public.owner_downgrade_to_starter() to authenticated;

create or replace function public.admin_set_owner_plan_override(p_owner uuid,p_car_limit int,p_commission numeric,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare v_code text;
begin
 if not public.is_admin() then raise exception 'Administrator access required.'; end if;
 if p_car_limit is not null and p_car_limit not between 1 and 1000 then raise exception 'Invalid car limit.'; end if;
 if p_commission is not null and p_commission not between 0 and .5 then raise exception 'Invalid commission.'; end if;
 if nullif(btrim(p_note),'') is null then raise exception 'A note is required.'; end if;
 update public.owner_plans set car_limit_override=p_car_limit,commission_override=p_commission,updated_by=auth.uid(),updated_at=now() where owner_id=p_owner;
 if not found then raise exception 'Owner plan not found.'; end if;
 select code into v_code from public.plans p join public.owner_plans op on op.plan_id=p.id where op.owner_id=p_owner;
 perform public.sync_owner_plan(p_owner);
 insert into public.owner_plan_events(owner_id,event,to_plan,detail,actor) values(p_owner,'override_set',v_code,jsonb_build_object('car_limit',p_car_limit,'commission',p_commission,'note',p_note),auth.uid());
end $$;
revoke all on function public.admin_set_owner_plan_override(uuid,int,numeric,text) from public,anon;
grant execute on function public.admin_set_owner_plan_override(uuid,int,numeric,text) to authenticated;

create or replace function public.admin_extend_owner_plan(p_owner uuid,p_days int)
returns void language plpgsql security definer set search_path=public as $$
declare v_code text;
begin
 if not public.is_admin() then raise exception 'Administrator access required.'; end if;
 if p_days not between 1 and 90 then raise exception 'Extension must be 1 to 90 days.'; end if;
 update public.owner_plans set expires_at=coalesce(greatest(expires_at,now()),now())+make_interval(days=>p_days),reminder_stage=0,updated_by=auth.uid(),updated_at=now() where owner_id=p_owner and expires_at is not null;
 if not found then raise exception 'This plan does not expire.'; end if;
 select p.code into v_code from public.owner_plans op join public.plans p on p.id=op.plan_id where op.owner_id=p_owner;
 insert into public.owner_plan_events(owner_id,event,to_plan,detail,actor) values(p_owner,'extended',v_code,jsonb_build_object('days',p_days),auth.uid());
end $$;
revoke all on function public.admin_extend_owner_plan(uuid,int) from public,anon;
grant execute on function public.admin_extend_owner_plan(uuid,int) to authenticated;

create or replace function public.expire_owner_plans() returns void language plpgsql security definer set search_path=public as $$
declare r record; v_grace int; v_limit int; v_active int; v_hidden int;
begin
 select coalesce((value#>>'{}')::int,3) into v_grace from public.settings where key='plan_grace_days'; v_grace:=coalesce(v_grace,3);
 for r in select op.owner_id,p.code from public.owner_plans op join public.plans p on p.id=op.plan_id where op.status='active' and op.expires_at is not null and op.expires_at+make_interval(days=>v_grace)<=now() and p.code<>'starter' loop
  select max_active_cars into v_limit from public.plans where code='starter';
  select count(*) into v_active from public.cars where owner_id=r.owner_id and is_active;
  v_hidden:=greatest(0,v_active-v_limit);
  if v_hidden>0 then
   with excess as (select id from public.cars where owner_id=r.owner_id and is_active order by created_at desc limit v_hidden)
   update public.cars c set is_active=false,plan_hidden=true from excess e where c.id=e.id;
  end if;
  update public.owner_plans set status='expired',car_limit_override=null,commission_override=null,updated_at=now() where owner_id=r.owner_id;
  perform public.sync_owner_plan(r.owner_id);
  insert into public.owner_plan_events(owner_id,event,from_plan,to_plan,detail) values(r.owner_id,'expired',r.code,'starter',jsonb_build_object('cars_hidden',v_hidden));
 end loop;
end $$;
revoke all on function public.expire_owner_plans() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('expire-owner-plans','15 2 * * *','select public.expire_owner_plans()');
 end if;
exception when others then null;
end $$;

create or replace function public.submit_plan_payment(p_plan_code text,p_months int,p_reference text,p_proof_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_plan public.plans%rowtype; v_id uuid;
begin
 select id into v_owner from public.owners where profile_id=auth.uid() and is_active;
 if v_owner is null then raise exception 'Active owner account required.'; end if;
 if p_months is null or p_months not in (1,3,6,12) then raise exception 'Choose 1, 3, 6, or 12 months.'; end if;
 if p_reference is null or char_length(btrim(p_reference)) not between 6 and 40 then raise exception 'Enter a valid transaction reference.'; end if;
 if p_proof_path is null or split_part(p_proof_path,'/',1)<>auth.uid()::text then raise exception 'Invalid payment proof.'; end if;
 select * into v_plan from public.plans where code=p_plan_code and is_public and is_active and price_php>0;
 if not found then raise exception 'This plan cannot be purchased.'; end if;
 if exists(select 1 from public.plan_payments where owner_id=v_owner and status='pending') then raise exception 'A plan payment is already waiting for review.'; end if;
 if (select count(*) from public.plan_payments where owner_id=v_owner and created_at>now()-interval '1 day')>=5 then raise exception 'Daily payment submission limit reached.'; end if;
 insert into public.plan_payments(owner_id,plan_id,amount,reference_no,proof_path,months)
 values(v_owner,v_plan.id,v_plan.price_php*p_months,btrim(p_reference),p_proof_path,p_months) returning id into v_id;
 perform public.notify_admins('plan_payment_submitted','Plan payment needs review','An owner submitted a plan payment for review.','/admin/plan-payments','{in_app,push}',false,'plan-payment:'||v_id);
 return v_id;
end $$;
revoke all on function public.submit_plan_payment(text,int,text,text) from public,anon;
grant execute on function public.submit_plan_payment(text,int,text,text) to authenticated;

create or replace function public.admin_review_plan_payment(p_payment uuid,p_approve boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_payment public.plan_payments%rowtype; v_profile uuid; v_code text;
begin
 if not public.is_admin() then raise exception 'Administrator access required.'; end if;
 select * into v_payment from public.plan_payments where id=p_payment for update;
 if not found or v_payment.status<>'pending' then raise exception 'Pending payment not found.'; end if;
 if p_approve then
  select code into v_code from public.plans where id=v_payment.plan_id;
  perform public.admin_activate_owner_plan(v_payment.owner_id,v_code,v_payment.months,v_payment.id);
 else
  if nullif(btrim(p_reason),'') is null then raise exception 'A rejection reason is required.'; end if;
  update public.plan_payments set status='rejected',reject_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=p_payment;
  select profile_id into v_profile from public.owners where id=v_payment.owner_id;
  perform public.notify(v_profile,'plan_payment_rejected','Plan payment needs attention',btrim(p_reason),'/owner/plan',null,'{in_app,email}',false,'plan-payment-rejected:'||p_payment);
 end if;
end $$;
revoke all on function public.admin_review_plan_payment(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_plan_payment(uuid,boolean,text) to authenticated;
