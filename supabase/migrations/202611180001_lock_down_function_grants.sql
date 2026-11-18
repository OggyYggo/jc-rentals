-- Keep notification creation internal to database triggers and trusted server calls.
revoke all on function public.notify(uuid, text, text, text, text, uuid, text[], boolean, text)
  from public, anon, authenticated;
revoke all on function public.notify_admins(text, text, text, text, text[], boolean, text)
  from public, anon, authenticated;
grant execute on function public.notify_admins(text, text, text, text, text[], boolean, text)
  to service_role;

-- Trigger functions are not API entry points. Their triggers continue to run normally.
revoke all on function public.notify_booking_events() from public, anon, authenticated;
revoke all on function public.notify_profile_review_events() from public, anon, authenticated;
revoke all on function public.notify_topup_events() from public, anon, authenticated;
revoke all on function public.notify_owner_qr_decision() from public, anon, authenticated;
revoke all on function public.set_booking_owner_and_earnings() from public, anon, authenticated;
revoke all on function public.validate_customer_payment_proof() from public, anon, authenticated;
revoke all on function public.expire_booking_holds_before_insert() from public, anon, authenticated;
revoke all on function public.create_customer_profile() from public, anon, authenticated;
revoke all on function public.mark_customer_documents_pending() from public, anon, authenticated;

-- Authenticated RPCs retain their explicit authenticated grants; only anon/public
-- execution is removed from this additional set of guarded procedures.
revoke execute on function public.confirm_booking_payment(uuid) from public, anon;
revoke execute on function public.reject_booking_payment(uuid, text) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.mark_deposit_refunded(uuid) from public, anon;
revoke execute on function public.owner_set_booking_status(uuid, public.booking_status) from public, anon;
revoke execute on function public.owner_mark_payment_received(uuid, text) from public, anon;
revoke execute on function public.admin_review_owner_topup(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_set_owner_payment_terms(uuid, text, numeric, numeric) from public, anon;
revoke execute on function public.admin_set_owner_payment_qr_verified(uuid, boolean) from public, anon;
revoke execute on function public.admin_generate_monthly_invoices(date) from public, anon;
revoke execute on function public.admin_mark_invoice_paid(uuid) from public, anon;
revoke execute on function public.admin_set_customer_verification(uuid, public.verification_status) from public, anon;
revoke execute on function public.admin_create_owner(uuid, text, numeric) from public, anon;
revoke execute on function public.cancel_my_booking(uuid) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.is_admin() from public, anon;
