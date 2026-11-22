insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('customer-selfies','customer-selfies',false,10485760,array['image/webp']);

create table public.customer_selfies (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  revision uuid not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected'))
);
alter table public.customer_selfies enable row level security;
revoke all on public.customer_selfies from public,anon,authenticated;
grant select on public.customer_selfies to authenticated;
grant select,insert,update on public.customer_selfies to service_role;
create policy customer_selfie_read on public.customer_selfies for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_admin()));

create function public.admin_review_customer_selfie(p_customer uuid,p_revision uuid,p_approved boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() or p_approved is null then
    raise exception 'Not allowed.';
  end if;
  update public.customer_selfies
  set status=case when p_approved then 'approved' else 'rejected' end
  where customer_id=p_customer and revision=p_revision and status='pending';
  if not found then raise exception 'This selfie changed. Reload the customer record and try again.'; end if;
  perform public.audit_write('document.selfie_reviewed','customer',p_customer::text,null,
    'Reviewed selfie with ID','{}',null,jsonb_build_object('decision',case when p_approved then 'approved' else 'rejected' end));
end;
$$;
revoke all on function public.admin_review_customer_selfie(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_review_customer_selfie(uuid,uuid,boolean) to authenticated;

create function public.admin_log_customer_selfie_view(p_customer uuid,p_revision uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Not allowed.'; end if;
  if not exists (select 1 from public.customer_selfies where customer_id=p_customer and revision=p_revision) then
    raise exception 'Document record not found.';
  end if;
  perform public.audit_write('document.viewed','customer',p_customer::text,null,
    'Viewed selfie with ID','{}',null,jsonb_build_object('document','Selfie with ID'));
end;
$$;
revoke all on function public.admin_log_customer_selfie_view(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_log_customer_selfie_view(uuid,uuid) to authenticated;
