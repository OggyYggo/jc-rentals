create or replace function public.mark_customer_documents_pending()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.license_path is distinct from old.license_path then
    new.license_classes := '{}';
  end if;
  if new.license_path is distinct from old.license_path or new.id_path is distinct from old.id_path then
    new.verification := 'pending';
    new.verification_rejection_reason := null;
  end if;
  return new;
end;
$$;
revoke all on function public.mark_customer_documents_pending() from public, anon, authenticated;
