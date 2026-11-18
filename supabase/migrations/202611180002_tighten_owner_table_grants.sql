-- Owners can update only their own payment display settings via the existing RLS policy.
-- Admin changes are performed through guarded SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.owners from authenticated;
grant update (payment_method_label, payment_account_name, payment_qr_path)
  on table public.owners to authenticated;
