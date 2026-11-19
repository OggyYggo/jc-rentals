alter table public.owner_applications
  add column if not exists preferred_plan text not null default 'starter'
  check (preferred_plan ~ '^[a-z][a-z0-9_]{1,30}$');

-- Applications approved after the plan migration start on Starter. The
-- applicant's preference never activates a paid subscription by itself.
create or replace function public.assign_new_owner_starter_plan()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_starter uuid;
begin
 select id into v_starter from public.plans where code='starter';
 if v_starter is not null then
  insert into public.owner_plans(owner_id,plan_id,status,expires_at)
  values(new.id,v_starter,'active',null) on conflict(owner_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.assign_new_owner_starter_plan() from public,anon,authenticated;
drop trigger if exists assign_new_owner_starter_plan on public.owners;
create trigger assign_new_owner_starter_plan after insert on public.owners
for each row execute function public.assign_new_owner_starter_plan();
