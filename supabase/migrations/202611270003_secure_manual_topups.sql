-- Keep historical ledger rows intact, including pre-existing reference collisions.
-- New submissions serialize by normalized reference and by proof path.
create function public.normalize_topup_reference(p_reference text)
returns text language sql immutable strict set search_path = '' as $$
  select upper(regexp_replace(p_reference collate "C", '[^A-Za-z0-9]', '', 'g'));
$$;
revoke all on function public.normalize_topup_reference(text) from public, anon, authenticated;

create index owner_topup_normalized_reference_idx on public.owner_credit_ledger
  (public.normalize_topup_reference(reference_no))
  where type = 'topup' and status in ('pending', 'posted');
create index owner_topup_proof_path_idx on public.owner_credit_ledger (proof_path)
  where type = 'topup' and proof_path is not null;

create function public.owner_topup_proof_exists(p_owner_id uuid, p_path text)
returns boolean language sql volatile set search_path = '' as $$
  select coalesce(p_path ~ ('^' || p_owner_id::text || '/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$'), false)
    and exists (select 1 from storage.objects where bucket_id = 'topup-proofs' and name = p_path);
$$;
revoke all on function public.owner_topup_proof_exists(uuid, text) from public, anon, authenticated;

drop policy if exists "Owners request credit topups" on public.owner_credit_ledger;
revoke insert, update, delete on public.owner_credit_ledger from public, anon, authenticated;

create function public.submit_owner_topup(p_amount numeric, p_reference text, p_proof_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_uuid uuid;
  ref text := public.normalize_topup_reference(p_reference);
  result uuid;
begin
  select id into owner_uuid from public.owners where profile_id = auth.uid() and is_active;
  if owner_uuid is null then raise exception 'Owner not found.'; end if;
  if p_amount is null or not (p_amount between 0.01 and 9999999999.99) or p_amount <> round(p_amount, 2)
     or p_reference is null or char_length(p_reference) > 100 or char_length(ref) not between 1 and 64
     or ref ~ '^KBT[A-F0-9]{12}$'
  then raise exception 'Enter a valid top-up amount and transfer reference.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('manual-topup-ref:' || ref, 0));
  if not public.owner_topup_proof_exists(owner_uuid, p_proof_path) then
    raise exception 'Upload a valid top-up proof for this owner.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('manual-topup-proof:' || p_proof_path, 0));
  if exists (select 1 from public.owner_credit_ledger where type = 'topup' and status in ('pending', 'posted')
       and public.normalize_topup_reference(reference_no) = ref)
     or exists (select 1 from public.owner_credit_ledger where type = 'topup' and proof_path = p_proof_path)
  then raise exception 'That top-up reference or proof has already been used.'; end if;

  insert into public.owner_credit_ledger (owner_id, type, amount, status, reference_no, proof_path, note)
  values (owner_uuid, 'topup', p_amount, 'pending', btrim(p_reference), p_proof_path, 'Owner credit top-up request')
  returning id into result;
  return result;
end;
$$;
revoke all on function public.submit_owner_topup(numeric, text, text) from public, anon, authenticated;
grant execute on function public.submit_owner_topup(numeric, text, text) to authenticated;

drop function public.admin_review_owner_topup(uuid, boolean, text);
create function public.admin_review_owner_topup(
  p_ledger_id uuid, p_approve boolean, p_reason text default null,
  p_received_amount numeric default null, p_received_reference text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
  ledger_row public.owner_credit_ledger%rowtype;
  ref text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into ledger_row from public.owner_credit_ledger where id = p_ledger_id for update;
  if not found or ledger_row.type <> 'topup' or ledger_row.status <> 'pending' then raise exception 'Pending top-up not found.'; end if;
  if p_approve is true then
    ref := public.normalize_topup_reference(ledger_row.reference_no);
    if coalesce(ref, '') = '' or p_received_amount is distinct from ledger_row.amount
       or public.normalize_topup_reference(p_received_reference) is distinct from ref
    then raise exception 'Enter the amount and reference from the verified transfer.'; end if;
    if not public.owner_topup_proof_exists(ledger_row.owner_id, ledger_row.proof_path) then
      raise exception 'Upload a valid top-up proof for this owner.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('manual-topup-ref:' || ref, 0));
    perform pg_advisory_xact_lock(hashtextextended('manual-topup-proof:' || ledger_row.proof_path, 0));
    if exists (select 1 from public.owner_credit_ledger
       where type = 'topup' and status = 'posted' and id <> ledger_row.id
         and (public.normalize_topup_reference(reference_no) = ref or proof_path = ledger_row.proof_path))
    then raise exception 'That top-up reference or proof has already been used.'; end if;
  else
    p_reason := public.require_dashboard_reason(p_reason);
  end if;

  perform set_config('app.audit_reason', coalesce(case when p_approve is not true then p_reason end, ''), true);
  update public.owner_credit_ledger set status = case when p_approve then 'posted' else 'rejected' end,
    note = case when p_approve then 'Top-up verified.' else p_reason end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_ledger_id;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end;
$$;
revoke all on function public.admin_review_owner_topup(uuid, boolean, text, numeric, text) from public, anon, authenticated;
grant execute on function public.admin_review_owner_topup(uuid, boolean, text, numeric, text) to authenticated;
