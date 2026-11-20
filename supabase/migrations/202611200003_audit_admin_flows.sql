-- Customer documents remain accessible to their owners. Admin downloads go through
-- the server action so a signed URL can only be released after a successful audit write.
drop policy if exists "Admins can read customer documents" on storage.objects;

-- Auth invitations happen through the Auth API. Finish the database work in one
-- transaction under the reviewing admin's session, including every audit event.
create function public.admin_complete_owner_application(p_application_id uuid, p_user_id uuid)
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
  insert into public.owners (profile_id, business_name, contact_phone, payment_qr_path)
    values (p_user_id, application.business_name, application.phone, application.payment_qr_path)
    on conflict (profile_id) do update set business_name = excluded.business_name,
      contact_phone = excluded.contact_phone, payment_qr_path = excluded.payment_qr_path
    returning id into owner_uuid;
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

create function public.admin_request_application_changes(p_application_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_status is null or p_status not in ('needs_changes', 'rejected') then
    raise exception 'Invalid review decision.';
  end if;
  p_reason := public.require_dashboard_reason(p_reason);
  perform set_config('app.audit_reason', p_reason, true);
  update public.owner_applications set status = p_status, admin_note = p_reason, reviewed_by = auth.uid(),
    reviewed_at = now(), updated_at = now() where id = p_application_id and status = 'pending';
  if not found then raise exception 'This application is no longer pending.'; end if;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end;
$$;

revoke all on function public.admin_complete_owner_application(uuid, uuid),
  public.admin_request_application_changes(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_complete_owner_application(uuid, uuid),
  public.admin_request_application_changes(uuid, text, text) to authenticated;
