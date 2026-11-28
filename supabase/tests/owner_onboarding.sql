-- Run after migrations in a disposable database. Fixtures roll back.
begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('ac500000-0000-4000-8000-000000000001', 'onboarding-owner-1@example.invalid', '{"full_name":"Owner One"}'),
  ('ac500000-0000-4000-8000-000000000002', 'onboarding-owner-2@example.invalid', '{"full_name":"Owner Two"}'),
  ('ac500000-0000-4000-8000-000000000003', 'onboarding-customer@example.invalid', '{"full_name":"Customer"}');

update public.profiles set role = 'owner' where id in (
  'ac500000-0000-4000-8000-000000000001', 'ac500000-0000-4000-8000-000000000002'
);

insert into public.owners(profile_id, business_name, onboarding_tour_seen_at) values
  ('ac500000-0000-4000-8000-000000000001', 'Owner One', '2026-01-01T00:00:00Z'),
  ('ac500000-0000-4000-8000-000000000002', 'Owner Two', null);

do $$
begin
  assert not has_function_privilege('anon', 'public.mark_owner_onboarding(text)', 'EXECUTE');
  assert has_function_privilege('authenticated', 'public.mark_owner_onboarding(text)', 'EXECUTE');
  assert not has_column_privilege('authenticated', 'public.owners', 'onboarding_dismissed_at', 'UPDATE');
  assert not has_column_privilege('authenticated', 'public.owners', 'onboarding_tour_seen_at', 'UPDATE');
  assert not has_column_privilege('authenticated', 'public.owners', 'guide_confirm_deposit_seen_at', 'UPDATE');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ac500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.mark_owner_onboarding('tour_seen');
select public.mark_owner_onboarding('guide_confirm_deposit');
select public.mark_owner_onboarding('dismissed');

do $$
begin
  begin
    update public.owners set onboarding_tour_seen_at = null;
    raise exception 'Expected direct write to be rejected';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_owner_onboarding('unknown');
    raise exception 'Expected unknown key to be rejected';
  exception when invalid_parameter_value then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"ac500000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.mark_owner_onboarding('dismissed');
    raise exception 'Expected caller without owner row to be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  assert (select onboarding_tour_seen_at = '2026-01-01T00:00:00Z'
    and guide_confirm_deposit_seen_at is not null and onboarding_dismissed_at is not null
    from public.owners where profile_id = 'ac500000-0000-4000-8000-000000000001');
  assert (select onboarding_tour_seen_at is null and guide_confirm_deposit_seen_at is null
    and onboarding_dismissed_at is null
    from public.owners where profile_id = 'ac500000-0000-4000-8000-000000000002');
end $$;

rollback;
