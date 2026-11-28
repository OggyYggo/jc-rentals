alter table public.owners
  add column onboarding_dismissed_at timestamptz,
  add column onboarding_tour_seen_at timestamptz,
  add column guide_confirm_deposit_seen_at timestamptz;

-- Authenticated UPDATE is already limited to the payment columns by
-- 202611180003_tighten_owner_table_grants.sql.
revoke update (onboarding_dismissed_at, onboarding_tour_seen_at, guide_confirm_deposit_seen_at)
  on public.owners from public, anon, authenticated;

create function public.mark_owner_onboarding(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  case p_key
    when 'dismissed' then
      update public.owners set onboarding_dismissed_at = coalesce(onboarding_dismissed_at, now())
        where profile_id = auth.uid() and archived_at is null;
    when 'tour_seen' then
      update public.owners set onboarding_tour_seen_at = coalesce(onboarding_tour_seen_at, now())
        where profile_id = auth.uid() and archived_at is null;
    when 'guide_confirm_deposit' then
      update public.owners set guide_confirm_deposit_seen_at = coalesce(guide_confirm_deposit_seen_at, now())
        where profile_id = auth.uid() and archived_at is null;
    else raise exception 'Invalid onboarding key' using errcode = '22023';
  end case;
  if not found then
    raise exception 'Owner required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.mark_owner_onboarding(text) from public, anon, authenticated, service_role;
grant execute on function public.mark_owner_onboarding(text) to authenticated;
