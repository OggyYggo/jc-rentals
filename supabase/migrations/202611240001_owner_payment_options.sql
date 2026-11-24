create table if not exists public.owner_payment_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  provider text not null check (provider in ('gcash','maya','gotyme','bpi','maribank','other_qrph')),
  label text not null,
  account_name text not null,
  account_hint text check (account_hint ~ '^•••• [0-9]{4}$'),
  qr_path text not null,
  qr_bucket text not null default 'owner-qr' check (qr_bucket in ('owner-qr','owner-applications')),
  is_preferred boolean not null default false,
  sort_order int not null default 0,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  rejection_reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists owner_payment_options_owner_idx on public.owner_payment_options (owner_id, sort_order);
create unique index if not exists owner_payment_options_one_preferred
  on public.owner_payment_options (owner_id) where is_preferred and is_active;
create unique index if not exists owner_payment_options_one_per_provider
  on public.owner_payment_options (owner_id, provider) where provider <> 'other_qrph' and is_active;

alter table public.owner_payment_options enable row level security;
revoke all on public.owner_payment_options from public, anon, authenticated;
grant select on public.owner_payment_options to authenticated;
drop policy if exists "Owners and admins read payment options" on public.owner_payment_options;
create policy "Owners and admins read payment options" on public.owner_payment_options for select to authenticated
using ((select public.is_admin()) or exists (
  select 1 from public.owners o where o.id = owner_id and o.profile_id = (select auth.uid())
));

create or replace function public.payment_option_provider(p_label text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_label ilike '%gcash%' then 'gcash'
    when p_label ilike '%maya%' then 'maya'
    when p_label ilike '%gotyme%' then 'gotyme'
    when p_label ilike '%bpi%' then 'bpi'
    when p_label ilike '%maribank%' then 'maribank'
    else 'other_qrph'
  end
$$;

do $$
declare copied integer; approved integer;
begin
  with inserted as (
    insert into public.owner_payment_options (owner_id,provider,label,account_name,account_hint,qr_path,qr_bucket,is_preferred,verified)
    select o.id,public.payment_option_provider(o.payment_method_label),
      coalesce(nullif(trim(o.payment_method_label),''),'QR Ph'),
      coalesce(nullif(trim(o.payment_account_name),''),o.business_name),
      case when public.payment_option_provider(o.payment_method_label) = 'gcash'
        and length(regexp_replace(o.gcash_number,'[^0-9]','','g')) >= 4
        then '•••• ' || right(regexp_replace(o.gcash_number,'[^0-9]','','g'),4) end,
      o.payment_qr_path,
      case when exists (select 1 from public.owner_applications a where a.user_id = o.profile_id and a.payment_qr_path = o.payment_qr_path and a.status = 'approved')
        then 'owner-applications' else 'owner-qr' end,
      true,o.payment_qr_verified
    from public.owners o where o.payment_qr_path is not null
      and not exists (select 1 from public.owner_payment_options p where p.owner_id = o.id)
    returning verified
  )
  select count(*),count(*) filter (where verified) into copied,approved from inserted;
  raise notice 'Backfilled % owner payment options (% verified).',copied,approved;
end
$$;

comment on column public.owners.payment_method_label is 'Deprecated. Mirrors the preferred active payment option.';
comment on column public.owners.payment_account_name is 'Deprecated. Mirrors the preferred active payment option.';
comment on column public.owners.payment_qr_path is 'Deprecated. Mirrors the preferred active payment option.';
comment on column public.owners.payment_qr_verified is 'Deprecated. Use verified active owner payment options for readiness.';

revoke update (payment_method_label,payment_account_name,payment_qr_path) on public.owners from authenticated;

create or replace function public.guard_payment_option()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and
    (new.provider,new.label,new.account_name,new.account_hint,new.qr_bucket,new.qr_path) is distinct from
    (old.provider,old.label,old.account_name,old.account_hint,old.qr_bucket,old.qr_path) then
    new.verified := false;
    new.verified_at := null;
    new.verified_by := null;
    new.rejection_reason := null;
  elsif auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.verified or new.verified_at is not null or new.verified_by is not null or new.rejection_reason is not null then
        raise exception 'Administrator access required.';
      end if;
    elsif (new.verified,new.verified_at,new.verified_by,new.rejection_reason) is distinct from
      (old.verified,old.verified_at,old.verified_by,old.rejection_reason) then
      raise exception 'Administrator access required.';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;

drop trigger if exists guard_payment_option on public.owner_payment_options;
create trigger guard_payment_option before insert or update on public.owner_payment_options
for each row execute function public.guard_payment_option();

create or replace function public.sync_preferred_payment_option()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_uuid uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  preferred public.owner_payment_options%rowtype;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  select * into preferred from public.owner_payment_options where owner_id = owner_uuid and is_preferred and is_active;
  update public.owners set payment_method_label = preferred.label, payment_account_name = preferred.account_name,
    payment_qr_path = preferred.qr_path, payment_qr_verified = coalesce(preferred.verified,false)
  where id = owner_uuid and (payment_method_label,payment_account_name,payment_qr_path,payment_qr_verified)
    is distinct from (preferred.label,preferred.account_name,preferred.qr_path,coalesce(preferred.verified,false));
  return null;
end
$$;

drop trigger if exists sync_preferred_payment_option on public.owner_payment_options;
create trigger sync_preferred_payment_option after insert or update or delete on public.owner_payment_options
for each row execute function public.sync_preferred_payment_option();

-- Import privileged legacy writes (including trusted fixtures and new owner inserts).
-- Ordinary owner writes use the option RPCs, which validate storage ownership.
create or replace function public.import_legacy_payment_option()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 or new.payment_qr_path is null then return null; end if;
  if not exists (select 1 from public.owner_payment_options where owner_id = new.id) then
    insert into public.owner_payment_options(owner_id,provider,label,account_name,qr_path,is_preferred,verified)
    values (new.id,public.payment_option_provider(new.payment_method_label),coalesce(new.payment_method_label,'QR Ph'),
      coalesce(new.payment_account_name,new.business_name),new.payment_qr_path,true,new.payment_qr_verified);
  end if;
  return null;
end
$$;

drop trigger if exists import_legacy_payment_option on public.owners;
create trigger import_legacy_payment_option after insert or update of payment_qr_path on public.owners
for each row execute function public.import_legacy_payment_option();

create or replace function public.owner_save_payment_option(
  p_option_id uuid,p_provider text,p_label text,p_account_name text,p_account_hint text,p_qr_path text,p_make_preferred boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_uuid uuid;
  option_id uuid;
  previous public.owner_payment_options%rowtype;
  digits text := regexp_replace(coalesce(p_account_hint,''),'[^0-9]','','g');
  hint text := case when length(digits) >= 4 then '•••• ' || right(digits,4) end;
  bucket text := 'owner-qr';
begin
  select id into owner_uuid from public.owners where profile_id = auth.uid() for update;
  if not found then raise exception 'Not allowed.'; end if;
  if p_option_id is not null then
    select * into previous from public.owner_payment_options where id = p_option_id and owner_id = owner_uuid and is_active;
    if not found then raise exception 'Payment option not found.'; end if;
    if p_qr_path = previous.qr_path then bucket := previous.qr_bucket; end if;
  end if;
  if p_qr_path is distinct from previous.qr_path and (
    split_part(coalesce(p_qr_path,''),'/',1) <> owner_uuid::text or not exists (
      select 1 from storage.objects where bucket_id = 'owner-qr' and name = p_qr_path
    )
  ) then raise exception 'Choose a QR image uploaded to your account.'; end if;
  if nullif(trim(p_qr_path),'') is null then raise exception 'Choose a QR image uploaded to your account.'; end if;
  if coalesce(length(trim(p_label)),0) not between 1 and 80
    or coalesce(length(trim(p_account_name)),0) not between 1 and 120
    or p_label ~ '[0-9]([ -]*[0-9]){5,}' or p_account_name ~ '[0-9]([ -]*[0-9]){5,}' then
    raise exception 'Enter a label and account name without an account number.';
  end if;
  if exists (select 1 from public.owner_payment_options where owner_id = owner_uuid and is_active
    and provider = p_provider and provider <> 'other_qrph' and id is distinct from p_option_id) then
    raise exception 'You already have an active option for this provider.';
  end if;
  if p_option_id is null then
    if (select count(*) from public.owner_payment_options where owner_id = owner_uuid and is_active) >= 8 then
      raise exception 'You can have up to 8 active payment options.';
    end if;
    insert into public.owner_payment_options (owner_id,provider,label,account_name,account_hint,qr_path,is_preferred,sort_order)
    select owner_uuid,p_provider,trim(p_label),trim(p_account_name),hint,p_qr_path,
      not coalesce(bool_or(is_preferred),false),coalesce(max(sort_order)+1,0)
    from public.owner_payment_options where owner_id = owner_uuid and is_active
    returning id into option_id;
  else
    update public.owner_payment_options set provider = p_provider,label = trim(p_label),
      account_name = trim(p_account_name),account_hint = hint,qr_path = p_qr_path,qr_bucket = bucket
    where id = p_option_id returning id into option_id;
  end if;
  if p_make_preferred then
    perform public.owner_set_preferred_payment_option(option_id);
  end if;
  return option_id;
end
$$;

create or replace function public.owner_set_preferred_payment_option(p_option_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_uuid uuid;
begin
  select id into owner_uuid from public.owners where profile_id = auth.uid() for update;
  if not found or not exists (select 1 from public.owner_payment_options
    where id = p_option_id and owner_id = owner_uuid and is_active) then raise exception 'Payment option not found.'; end if;
  update public.owner_payment_options set is_preferred = false where owner_id = owner_uuid
    and is_active and is_preferred and id <> p_option_id;
  update public.owner_payment_options set is_preferred = true where id = p_option_id and not is_preferred;
end
$$;

create or replace function public.owner_save_payment_option(
  p_option_id uuid,p_provider text,p_label text,p_account_name text,p_account_hint text,p_qr_path text
)
returns uuid language sql security definer set search_path = '' as $$
  select public.owner_save_payment_option(p_option_id,p_provider,p_label,p_account_name,p_account_hint,p_qr_path,false)
$$;

create or replace function public.owner_reorder_payment_options(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare owner_uuid uuid;
begin
  select id into owner_uuid from public.owners where profile_id = auth.uid() for update;
  if not found then raise exception 'Not allowed.'; end if;
  if p_ids is null or cardinality(p_ids) <> (
    select count(*) from public.owner_payment_options where owner_id = owner_uuid and is_active
  ) or cardinality(p_ids) <> (
    select count(*) from public.owner_payment_options where owner_id = owner_uuid and is_active and id = any(p_ids)
  ) then raise exception 'Refresh the page and reorder your current payment options.'; end if;
  update public.owner_payment_options p set sort_order = sequence.position::int - 1
  from unnest(p_ids) with ordinality as sequence(id,position)
  where p.id = sequence.id and p.owner_id = owner_uuid and p.is_active;
end
$$;

create or replace function public.owner_remove_payment_option(p_option_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_uuid uuid;
  option_row public.owner_payment_options%rowtype;
begin
  select id into owner_uuid from public.owners where profile_id = auth.uid() for update;
  select * into option_row from public.owner_payment_options where id = p_option_id and owner_id = owner_uuid and is_active;
  if not found then raise exception 'Payment option not found.'; end if;
  if option_row.verified and not exists (
    select 1 from public.owner_payment_options where owner_id = owner_uuid and is_active and verified and id <> p_option_id
  ) and exists (
    select 1 from public.bookings where owner_id = owner_uuid and status = 'awaiting_payment'
  ) then raise exception 'Keep one verified option while bookings are awaiting payment.'; end if;
  update public.owner_payment_options set is_active = false,is_preferred = false where id = p_option_id;
  if option_row.is_preferred then
    update public.owner_payment_options set is_preferred = true where id = (
      select id from public.owner_payment_options where owner_id = owner_uuid and is_active
      order by verified desc,sort_order,id limit 1
    );
  end if;
end
$$;

create or replace function public.admin_set_payment_option_verified(
  p_option_id uuid,p_verified boolean,p_reason text,p_expected_updated_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_uuid uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_verified is null or (not p_verified and coalesce(length(trim(p_reason)),0) not between 1 and 300) then
    raise exception 'Enter a rejection reason (up to 300 characters).';
  end if;
  select o.id into owner_uuid from public.owners o join public.owner_payment_options p on p.owner_id = o.id
    where p.id = p_option_id for update of o;
  if p_expected_updated_at is not null and not exists (
    select 1 from public.owner_payment_options where id = p_option_id and updated_at = p_expected_updated_at
  ) then raise exception 'The payment option changed. Refresh and review the current QR.'; end if;
  update public.owner_payment_options p set verified = p_verified,
    verified_at = case when p_verified then now() end, verified_by = case when p_verified then auth.uid() end,
    rejection_reason = case when not p_verified then trim(p_reason) end
  where p.id = p_option_id and p.owner_id = owner_uuid and p.is_active
    and (not p_verified or (nullif(trim(p.qr_path),'') is not null and exists (
      select 1 from storage.objects s where s.bucket_id = p.qr_bucket and s.name = p.qr_path
    )));
  if not found then raise exception 'The active payment option or its QR image could not be found.'; end if;
end
$$;

create or replace function public.admin_set_payment_option_verified(
  p_option_id uuid,p_verified boolean,p_reason text default null
)
returns void language sql security definer set search_path = '' as $$
  select public.admin_set_payment_option_verified(p_option_id,p_verified,p_reason,null::timestamptz)
$$;

create or replace function public.admin_set_owner_payment_qr_verified(p_owner_id uuid,p_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  perform public.admin_set_payment_option_verified(
    (select id from public.owner_payment_options where owner_id = p_owner_id and is_active and is_preferred),
    p_verified,'Please review your payment QR.'
  );
end
$$;

create or replace function public.get_booking_payment_options(p_booking_id uuid)
returns table (id uuid,provider text,label text,account_name text,account_hint text,
  sort_order int,is_preferred boolean,qr_path text,qr_bucket text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.provider,p.label,p.account_name,p.account_hint,p.sort_order,p.is_preferred,p.qr_path,p.qr_bucket
  from public.bookings b join public.owner_payment_options p on p.owner_id = b.owner_id
  where b.id = p_booking_id and b.customer_id = auth.uid()
    and (b.status = 'payment_review' or (b.status = 'awaiting_payment'
      and greatest(b.payment_due_at,b.payment_resubmit_due_at) > now()))
    and p.is_active and p.verified
  order by p.is_preferred desc,p.sort_order,p.id
$$;

create or replace function public.get_owner_accepted_providers(p_owner_id uuid)
returns table (provider text)
language sql stable security definer set search_path = '' as $$
  select distinct p.provider from public.owner_payment_options p
  where p.owner_id = p_owner_id and p.is_active and p.verified and public.owner_can_accept(p_owner_id)
  order by p.provider
$$;

revoke all on function public.guard_payment_option(),public.sync_preferred_payment_option(),
  public.import_legacy_payment_option(),public.payment_option_provider(text),
  public.owner_save_payment_option(uuid,text,text,text,text,text),
  public.owner_save_payment_option(uuid,text,text,text,text,text,boolean),public.owner_set_preferred_payment_option(uuid),
  public.owner_reorder_payment_options(uuid[]),public.owner_remove_payment_option(uuid),
  public.admin_set_payment_option_verified(uuid,boolean,text),
  public.admin_set_payment_option_verified(uuid,boolean,text,timestamptz),public.get_booking_payment_options(uuid),
  public.get_owner_accepted_providers(uuid) from public,anon,authenticated;
grant execute on function public.owner_save_payment_option(uuid,text,text,text,text,text),
  public.owner_save_payment_option(uuid,text,text,text,text,text,boolean),
  public.owner_set_preferred_payment_option(uuid),public.owner_reorder_payment_options(uuid[]),
  public.owner_remove_payment_option(uuid),public.admin_set_payment_option_verified(uuid,boolean,text),
  public.admin_set_payment_option_verified(uuid,boolean,text,timestamptz),
  public.get_booking_payment_options(uuid) to authenticated;
-- Public listing data consists of provider codes only.
grant execute on function public.get_owner_accepted_providers(uuid) to anon,authenticated;

alter table public.payments
  add column if not exists payment_option_id uuid references public.owner_payment_options(id) on delete set null,
  add column if not exists payment_provider text,
  add column if not exists payment_label text;


create or replace function public.reset_owner_payment_qr_verification() returns trigger language plpgsql set search_path='' as $$
begin
 if pg_trigger_depth() = 1 and (new.payment_method_label is distinct from old.payment_method_label or new.payment_account_name is distinct from old.payment_account_name or new.payment_qr_path is distinct from old.payment_qr_path) then new.payment_qr_verified:=false; end if;
 if not public.is_admin() and auth.uid()=old.profile_id then
  if new.business_name is distinct from old.business_name or new.contact_phone is distinct from old.contact_phone or
   (new.commission_rate is distinct from old.commission_rate and current_setting('app.plan_sync',true) is distinct from 'on') or
   new.is_active is distinct from old.is_active or new.fee_mode is distinct from old.fee_mode or new.deposit_percent is distinct from old.deposit_percent or (pg_trigger_depth() = 1 and new.payment_qr_verified is distinct from old.payment_qr_verified) then
    raise exception 'Only administrators can change business access, fees, deposit percent, and QR verification.';
  end if;
 end if; return new;
end $$;

create or replace function public.owner_can_accept(p_owner_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(o.is_active and (
    exists (select 1 from public.owner_payment_options p where p.owner_id = o.id and p.is_active and p.verified)
    or (o.payment_qr_verified and not exists (select 1 from public.owner_payment_options p where p.owner_id = o.id))
  ) and case o.fee_mode
    when 'credits' then (select available from public.calculate_owner_credit_state(o.id)) >=
      coalesce((select (value #>> '{}')::numeric from public.settings where key = 'min_credit_to_list'),500)
    else not exists (select 1 from public.commission_invoices i where i.owner_id = o.id
      and i.status = 'unpaid' and i.due_date < (now() at time zone 'Asia/Manila')::date)
    end,false)
  from public.owners o where o.id = p_owner_id
$$;

create or replace function public.validate_customer_payment_proof()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  normalized text;
  option_row public.owner_payment_options%rowtype;
begin
  select * into strict b from public.bookings where id = new.booking_id for update;
  new.owner_id := b.owner_id;
  new.payment_provider := null;
  new.payment_label := null;
  -- Existing pickup-balance RPC records an in-person payment without a proof.
  if new.status = 'verified' then
    if auth.uid() is null or not (public.is_admin() or exists (
      select 1 from public.owners where id = b.owner_id and profile_id = auth.uid()
    )) or b.status not in ('confirmed','picked_up') or new.method = 'owner_qr' then
      raise exception 'Payment cannot be recorded for this booking.';
    end if;
    new.payment_option_id := null;
    return new;
  end if;

  if auth.uid() is distinct from b.customer_id then raise exception 'Not allowed.'; end if;
  if b.status not in ('awaiting_payment','payment_review') then raise exception 'Booking is not accepting proofs.'; end if;
  if greatest(b.payment_due_at,b.payment_resubmit_due_at) <= clock_timestamp() then raise exception 'PAYMENT_WINDOW_EXPIRED'; end if;
  if (select count(*) from public.payments where booking_id = b.id) >= 3 then raise exception 'PROOF_LIMIT'; end if;
  if b.status = 'payment_review' then raise exception 'A proof is already under review.'; end if;
  if new.amount is distinct from b.amount_due_now then raise exception 'Enter the exact deposit amount.'; end if;
  normalized := upper(regexp_replace(trim(new.reference_no), '[^A-Za-z0-9]', '', 'g'));
  if normalized is null or length(new.reference_no) > 100 or length(normalized) not between 6 and 40 then raise exception 'REFERENCE_INVALID'; end if;
  if exists (select 1 from public.payments where owner_id = b.owner_id
    and reference_norm = normalized and status in ('pending','verified')) then raise exception 'REFERENCE_ALREADY_USED'; end if;
  if new.proof_path is null or new.proof_path not like b.customer_id::text || '/' || b.id::text || '/%'
    or not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = new.proof_path)
  then raise exception 'Invalid proof file path.'; end if;
  if new.payment_option_id is not null then
    select * into option_row from public.owner_payment_options
    where id = new.payment_option_id and owner_id = b.owner_id and is_active and verified for share;
    if not found then raise exception 'PAYMENT_OPTION_UNAVAILABLE'; end if;
    new.payment_provider := option_row.provider;
    new.payment_label := option_row.label;
  end if;
  new.status := 'pending';
  new.method := 'owner_qr';
  new.paid_at := clock_timestamp();
  if greatest(b.payment_due_at,b.payment_resubmit_due_at) <= new.paid_at + interval '10 minutes' then
    new.flags := array_append(new.flags,'late_proof');
  end if;
  if (select count(*) from public.payments p join public.bookings prior on prior.id = p.booking_id
      where prior.customer_id = b.customer_id and p.status = 'rejected' and coalesce(p.rejected_at,p.paid_at) > now() - interval '24 hours') >= 2 then
    new.flags := array_append(new.flags,'repeat_rejections');
  end if;
  return new;
end;
$$;

create or replace function public.submit_booking_payment(p_booking_id uuid, p_reference text, p_proof_path text, p_payment_option_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  payment_id uuid;
  constraint_name text;
begin
  select * into b from public.bookings where id = p_booking_id and customer_id = auth.uid() for update;
  if not found then raise exception 'Not allowed.'; end if;

  if b.status in ('payment_review','confirmed','picked_up','returned','completed') then
    select id into payment_id from public.payments where booking_id = b.id
      and (status = 'pending' or (status = 'verified' and method = 'owner_qr'))
      order by paid_at desc,id desc limit 1;
    if found then return payment_id; end if;
  end if;

  insert into public.payments (booking_id,amount,method,reference_no,proof_path,payment_option_id)
    values (b.id,b.amount_due_now,'owner_qr',p_reference,p_proof_path,p_payment_option_id)
    returning id into payment_id;
  return payment_id;
exception when unique_violation then
  get stacked diagnostics constraint_name = CONSTRAINT_NAME;
  if constraint_name = 'payments_owner_reference_unique' then raise exception 'REFERENCE_ALREADY_USED'; end if;
  raise;
end;
$$;

create or replace function public.submit_booking_payment(p_booking_id uuid,p_reference text,p_proof_path text)
returns uuid language sql security definer set search_path = '' as $$
  select public.submit_booking_payment(p_booking_id,p_reference,p_proof_path,null::uuid)
$$;
revoke all on function public.submit_booking_payment(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.submit_booking_payment(uuid,text,text,uuid) to authenticated;

create or replace function public.admin_complete_owner_application(p_application_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  application public.owner_applications%rowtype;
  owner_uuid uuid;
  car_uuid uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into application from public.owner_applications
    where id = p_application_id and status = 'pending' for update;
  if not found then raise exception 'This application is no longer pending.'; end if;
  if not exists (select 1 from auth.users where id = p_user_id and lower(email) = lower(application.email)) then
    raise exception 'The owner account does not match this application.';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'An administrator account cannot be converted to an owner account.';
  end if;

  insert into public.profiles (id, full_name, phone, role)
    values (p_user_id, application.full_name, application.phone, 'owner')
    on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone, role = excluded.role;
  insert into public.owners (profile_id, business_name, contact_phone)
    values (p_user_id, application.business_name, application.phone)
    on conflict (profile_id) do update set business_name = excluded.business_name,
      contact_phone = excluded.contact_phone
    returning id into owner_uuid;
  if application.payment_qr_path like application.id::text || '/payment_qr/%' and not exists (
    select 1 from public.owner_payment_options p where p.owner_id = owner_uuid
      and p.qr_bucket = 'owner-applications' and p.qr_path = application.payment_qr_path and p.is_active
  ) then
    if (select count(*) from public.owner_payment_options where owner_id = owner_uuid and is_active) >= 8 then
      raise exception 'The owner already has 8 active payment options.';
    end if;
    insert into public.owner_payment_options (owner_id,provider,label,account_name,qr_path,qr_bucket,is_preferred,sort_order)
    select owner_uuid,'other_qrph','QR Ph',application.business_name,application.payment_qr_path,'owner-applications',
      not coalesce(bool_or(is_preferred),false),coalesce(max(sort_order)+1,0)
    from public.owner_payment_options where owner_id = owner_uuid and is_active;
  end if;
  insert into public.owner_plans (owner_id, plan_id, status)
    select owner_uuid, id, 'active' from public.plans where code = 'starter'
    on conflict (owner_id) do nothing;

  insert into public.cars (
    vehicle_type, engine_cc, helmets_included, owner_id, brand, model, year, plate_number, seats,
    transmission, car_type, fuel_type, is_active, allows_self_drive, allows_with_driver, description
  ) values (
    application.vehicle_type, application.engine_cc, application.helmets_included, owner_uuid,
    application.car_make, application.car_model, application.car_year, application.plate_number, application.seats,
    application.transmission, application.car_type, application.fuel_type, false,
    application.offers_self_drive, application.offers_with_driver, application.message
  ) returning id into car_uuid;

  if application.offers_self_drive and application.daily_rate_self_drive > 0 then
    insert into public.car_rates (car_id, mode, daily_rate) values (car_uuid, 'self_drive', application.daily_rate_self_drive);
  end if;
  if application.offers_with_driver and application.daily_rate_with_driver > 0 then
    insert into public.car_rates (car_id, mode, daily_rate) values (car_uuid, 'with_driver', application.daily_rate_with_driver);
  end if;
  update public.owner_applications set status = 'approved', user_id = p_user_id, reviewed_by = auth.uid(),
    reviewed_at = now(), updated_at = now() where id = application.id;
end;
$$;

create or replace function public.prepare_admin_digest()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  config public.admin_alert_config;
  manila_day date := (now() at time zone 'Asia/Manila')::date;
  midnight timestamptz := manila_day::timestamp at time zone 'Asia/Manila';
  yesterday timestamptz := (manila_day-1)::timestamp at time zone 'Asia/Manila';
  batch_id uuid;
  waiting jsonb;
  events jsonb;
  heads jsonb;
  activity jsonb;
  attention bigint;
begin
  select * into config from public.admin_alert_config where id for update;
  if config.last_digest_on >= manila_day then return null; end if;

  begin
    perform public.admin_alert('plan.expiring','Owner plans expiring','A paid owner plan expires within seven days.',
      '/admin/owners','plan.expiring:' || op.owner_id || ':' || extract(epoch from op.expires_at))
    from public.owner_plans op join public.plans p on p.id=op.plan_id
    where op.status='active' and p.code<>'starter' and op.expires_at between now() and now()+interval '7 days';
  exception when others then
    raise warning 'Could not enqueue plan expiry alerts (%).', sqlstate;
  end;

  if config.digest_enabled is not true then return null; end if;
  select id into batch_id from public.admin_alert_queue where dedupe_key='daily:' || manila_day;
  if found then return batch_id; end if;

  -- Release an undelivered prior day's events into today's digest.
  update public.admin_alert_queue entry set digest_batch=null
  from public.admin_alert_queue previous
  where entry.digest_batch=previous.id and entry.status='digest'
    and previous.kind='daily' and previous.digest_on < manila_day
    and coalesce(previous.lease_until,'-infinity') <= now() and previous.status <> 'sent';

  select coalesce(jsonb_agg(jsonb_build_object('label',label,'path',path,'count',total,'oldest',oldest) order by position),'[]'), coalesce(sum(total),0)
    into waiting,attention
  from (
    select 1 as position,'Owner applications' as label,'/admin/owner-applications' as path,count(*) as total,min(created_at) as oldest from public.owner_applications where status='pending'
    union all select 2,'Owner payment QRs','/admin/owners',count(*),min(p.updated_at)
      from public.owner_payment_options p join public.owners o on o.id = p.owner_id
      where p.is_active and not p.verified and p.rejection_reason is null and o.archived_at is null
    union all select 3,'Owner top-ups','/admin/topups',count(*),min(created_at) from public.owner_credit_ledger where type='topup' and status='pending'
    union all select 4,'Customer documents','/admin/customers',count(*),min(coalesce(docs.created_at,p.created_at))
      from public.profiles p left join lateral (
        select created_at from public.audit_log where entity_type='customer' and entity_id=p.id::text and changes ?| array['license_path','id_path'] order by id desc limit 1
      ) docs on true where p.role='customer' and p.verification='pending' and p.customer_archived_at is null
    union all select 5,'Booking payments','/admin/payments',count(*),min(paid_at) from public.payments where status='pending'
    union all select 6,'Plan payments','/admin/plan-payments',count(*),min(created_at) from public.plan_payments where status='pending'
    union all select 7,'Contact messages','/admin/contact-messages',count(*),min(created_at) from public.contact_messages where status='new'
    union all select 8,'Review reports','/admin/reviews',count(*),min(created_at) from public.review_reports where status='open'
    union all select 9,'Overdue refunds','/admin/payments',count(*),min(due_at) from public.booking_refunds
      where status='owed' and due_at <= now()
    union all select 10,'Open payment disputes','/admin/payments',count(*),min(created_at) from public.payment_disputes where status='open'
  ) items where total>0;

  select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',total) order by label),'[]') into heads from (
    select 'Paid plans expiring within seven days' as label,count(*) as total from public.owner_plans op join public.plans p on p.id=op.plan_id
      where op.status='active' and p.code<>'starter' and op.expires_at between now() and now()+interval '7 days'
    union all select 'Owners with low credits',count(*) from public.owners o
      cross join lateral public.calculate_owner_credit_state(o.id) b
      where o.is_active and o.fee_mode='credits' and (b.available <= 0 or b.available < b.low_threshold)
    union all select 'Per-user notifications with delivery problems',count(*) from public.notifications where admin_alert_failure_at>now()-interval '1 day'
    union all select 'Admin email alerts that failed',count(*) from public.admin_alert_queue where status='failed' and failed_at>now()-interval '1 day'
  ) totals where total>0;

  select jsonb_build_object(
    'newBookings',count(*),
    'bookedValue',coalesce(sum(total_price) filter(where status in ('confirmed','picked_up','returned','completed')),0),
    'commission',coalesce(sum(commission_amount) filter(where status in ('confirmed','picked_up','returned','completed')),0),
    'confirmed',(select count(distinct entity_id) from public.audit_log where created_at>=yesterday and created_at<midnight
      and entity_type='booking' and changes->'status'->>'to'='confirmed'),
    'cancelled',(select count(distinct entity_id) from public.audit_log where created_at>=yesterday and created_at<midnight
      and entity_type='booking' and changes->'status'->>'to' in ('cancelled','expired')))
    into activity from public.bookings where created_at>=yesterday and created_at<midnight;

  batch_id := gen_random_uuid();
  update public.admin_alert_queue set digest_batch=batch_id where status='digest' and digest_batch is null;
  select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',total) order by label),'[]') into events
    from (select r.label,count(*) as total from public.admin_alert_queue q join public.admin_alert_rules r using(event_key)
      where q.digest_batch=batch_id group by r.label) grouped;

  if attention=0 and events='[]' and heads='[]' and not config.digest_even_if_empty then return null; end if;
  if attention=0 then
    select coalesce(sum((item->>'count')::bigint),0) into attention from jsonb_array_elements(heads || events) as items(item);
  end if;
  insert into public.admin_alert_queue(id,event_key,title,url,kind,dedupe_key,digest_on,digest_data)
    values (batch_id,'daily.summary',case when attention=0 then 'Daily summary: all caught up'
      else 'Daily summary: ' || attention || ' things need attention' end,'/admin','daily','daily:' || manila_day,manila_day,
      jsonb_build_object('waiting',waiting,'activity',activity,'events',events,'heads',heads));
  return batch_id;
end;
$$;

-- Keep notifications tied to an option decision, including non-preferred options.
drop trigger if exists trg_notify_owner_qr_decision on public.owners;
drop trigger if exists admin_alert_owner_qr on public.owners;

create or replace function public.notify_payment_option_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_profile uuid;
begin
  if not new.is_active then return null; end if;
  if tg_op = 'INSERT' or
    (new.provider,new.label,new.account_name,new.account_hint,new.qr_path,new.qr_bucket) is distinct from
    (old.provider,old.label,old.account_name,old.account_hint,old.qr_path,old.qr_bucket) then
    if not new.verified then
      begin
        perform public.admin_alert('owner.qr_submitted','Owner payment QR to verify',null,
          '/admin/owners/' || new.owner_id,'owner.qr_submitted:' || new.id || ':' || new.updated_at);
      exception when others then
        raise warning 'Could not enqueue an admin email alert (%).', sqlstate;
      end;
    end if;
  elsif (new.verified,new.rejection_reason) is distinct from (old.verified,old.rejection_reason)
      and (new.verified or new.rejection_reason is not null) then
    select profile_id into owner_profile from public.owners where id = new.owner_id;
    perform public.notify(owner_profile,case when new.verified then 'qr_verified' else 'qr_rejected' end,
      case when new.verified then 'Payment QR approved' else 'Payment QR rejected' end,
      case when new.verified then 'Your payment option was approved.' else 'Open payment settings to review the reason.' end,
      '/owner/payment-settings',null,'{in_app,email,push}',false,'qr-decision:' || new.id || ':' || new.updated_at);
  end if;
  return null;
end
$$;
revoke all on function public.notify_payment_option_change() from public,anon,authenticated;
drop trigger if exists notify_payment_option_change on public.owner_payment_options;
create trigger notify_payment_option_change after insert or update on public.owner_payment_options
for each row execute function public.notify_payment_option_change();

-- Normalize legacy rows with incomplete labels without changing option verification.
update public.owner_payment_options p set is_preferred = true
from public.owners o where o.id = p.owner_id and p.is_preferred and p.is_active
  and (o.payment_method_label,o.payment_account_name,o.payment_qr_path,o.payment_qr_verified)
    is distinct from (p.label,p.account_name,p.qr_path,p.verified);
