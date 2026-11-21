-- Reuse the existing customer-visible rejection field and its audit trigger.
-- The two-argument RPC stays available to legacy callers.
create function public.admin_set_customer_verification(
  customer_uuid uuid,next_status public.verification_status,p_note text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;

  if next_status = 'rejected' then
    if coalesce(char_length(btrim(p_note)),0) not between 5 and 300 then
      raise exception 'Enter a reason of 5 to 300 characters.';
    end if;
    perform public.admin_reject_customer_verification(customer_uuid,btrim(p_note));
    return;
  end if;

  if next_status is null then raise exception 'Invalid verification status.'; end if;
  if next_status = 'approved' then
    perform 1 from public.profiles where id = customer_uuid and role = 'customer'
      and nullif(btrim(license_path),'') is not null and nullif(btrim(id_path),'') is not null for update;
    if not found then raise exception 'Both verification documents are required.'; end if;
  end if;
  perform public.admin_set_customer_verification(customer_uuid,next_status);
end;
$$;
revoke all on function public.admin_set_customer_verification(uuid,public.verification_status,text)
  from public, anon, authenticated;
grant execute on function public.admin_set_customer_verification(uuid,public.verification_status,text)
  to authenticated;
