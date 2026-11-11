create or replace function public.notify_booking_events()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner_user uuid;
begin
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
 elsif new.status='awaiting_payment' and old.status='payment_review' then
  perform public.notify(new.customer_id,'payment_rejected','Payment proof needs another upload','The payment proof was not accepted. Review the reason and upload it again.','/account/bookings',new.id,'{in_app,email,push}',true,'rejected-proof:'||new.id||':'||clock_timestamp()::text);
 elsif new.status='expired' then
  if auth.uid() is distinct from new.customer_id then perform public.notify(new.customer_id,'booking_expired','Booking expired','The payment deadline passed and the booking was released.','/account/bookings',new.id,'{in_app,email}',false,'expired:'||new.id); end if;
 elsif new.status='cancelled' then
  if auth.uid() is distinct from new.customer_id then perform public.notify(new.customer_id,'booking_cancelled','Booking cancelled','Your booking was cancelled.','/account/bookings',new.id,'{in_app,email,push}',true,'customer-cancelled:'||new.id); end if;
  if auth.uid() is distinct from v_owner_user then perform public.notify(v_owner_user,'booking_cancelled','Booking cancelled','A booking was cancelled.','/owner/bookings',new.id,'{in_app,email,push}',false,'owner-cancelled:'||new.id); end if;
 elsif new.status='rejected' then
  if auth.uid() is distinct from new.customer_id then perform public.notify(new.customer_id,'booking_cancelled','Booking declined','The owner could not accept this booking.','/account/bookings',new.id,'{in_app,email,push}',true,'booking-rejected:'||new.id); end if;
 end if;
 return new;
end $$;

create or replace function public.notify_profile_review_events()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.license_path is distinct from old.license_path or new.id_path is distinct from old.id_path)
    and new.license_path is not null and new.id_path is not null then
  perform public.notify_admins('customer_pending_review','Customer documents need review','A customer submitted identification documents.','/admin/customers','{in_app,push}',false,'customer-review:'||new.id);
 end if;
 if new.verification is distinct from old.verification and new.verification in ('approved','rejected') then
  perform public.notify(new.id,case when new.verification='approved' then 'account_approved' else 'account_rejected' end,
   case when new.verification='approved' then 'Account approved' else 'Account documents need attention' end,
   case when new.verification='approved' then 'Your account documents were approved.' else 'Your account documents were not approved. Please review and resubmit them.' end,
   '/account/profile',null,'{in_app,email,push}',true,'account-review:'||new.id||':'||new.verification::text);
 end if;
 return new;
end $$;
drop trigger if exists trg_notify_profile_review_events on public.profiles;
create trigger trg_notify_profile_review_events after update of license_path,id_path,verification on public.profiles for each row execute function public.notify_profile_review_events();

create or replace function public.notify_topup_events()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
 select profile_id into v_user from public.owners where id=new.owner_id;
 if tg_op='INSERT' and new.type='topup' and new.status='pending' then
  perform public.notify_admins('topup_requested','Owner credit top-up needs review','An owner submitted a credit top-up proof.','/admin/topups','{in_app,email,push}',false,'topup-request:'||new.id);
 elsif tg_op='UPDATE' and old.status='pending' and new.status in ('posted','rejected') and new.type='topup' then
  perform public.notify(v_user,case when new.status='posted' then 'topup_approved' else 'topup_rejected' end,
   case when new.status='posted' then 'Top-up approved' else 'Top-up not approved' end,
   case when new.status='posted' then 'Your credit top-up was approved.' else 'Your credit top-up was not approved. Review the details and resubmit if needed.' end,
   '/owner/credits',null,'{in_app,email,push}',false,'topup-decision:'||new.id||':'||new.status);
 end if;
 return new;
end $$;
drop trigger if exists trg_notify_topup_events on public.owner_credit_ledger;
create trigger trg_notify_topup_events after insert or update of status on public.owner_credit_ledger for each row execute function public.notify_topup_events();

create or replace function public.notify_owner_qr_decision()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.payment_qr_verified is distinct from new.payment_qr_verified then
  perform public.notify(new.profile_id,case when new.payment_qr_verified then 'qr_verified' else 'qr_rejected' end,
   case when new.payment_qr_verified then 'Payment QR approved' else 'Payment QR needs review' end,
   case when new.payment_qr_verified then 'Your payment QR was approved.' else 'Your payment QR verification changed. Please review your payment settings.' end,
   '/owner/payment-settings',null,'{in_app,email,push}',false,'qr-decision:'||new.id||':'||new.payment_qr_verified::text);
 end if;
 return new;
end $$;
drop trigger if exists trg_notify_owner_qr_decision on public.owners;
create trigger trg_notify_owner_qr_decision after update of payment_qr_verified on public.owners for each row execute function public.notify_owner_qr_decision();
