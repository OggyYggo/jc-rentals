alter table public.reviews
  add column owner_rating smallint check (owner_rating between 1 and 5),
  add column tags text[] not null default '{}' check (cardinality(tags) <= 5),
  add column edited_at timestamptz,
  add column owner_reply text check (char_length(owner_reply) <= 500),
  add column owner_reply_at timestamptz,
  add column is_hidden boolean not null default false,
  add column hidden_reason text,
  add column hidden_by uuid references public.profiles(id) on delete set null,
  add column hidden_at timestamptz;

-- Preserve legacy text for its author and moderators. Invalid legacy text needs review before publication.
update public.reviews set is_hidden=true,hidden_at=now(),hidden_reason='Legacy review requires moderation'
  where char_length(comment)>1000 or comment ~* '(https?://|www\.|<)';
alter table public.reviews add constraint reviews_comment_len check (char_length(comment)<=1000) not valid;

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','offensive','personal_info','fake','other')),
  note text check (char_length(note)<=300),
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  created_at timestamptz not null default now(),
  unique (review_id,reporter_id)
);
create index review_reports_open_idx on public.review_reports(status,created_at);
create index review_reports_reporter_idx on public.review_reports(reporter_id,created_at desc);
create index reviews_author_recent_idx on public.reviews(customer_id,created_at desc);
create index reviews_owner_recent_idx on public.reviews(owner_id,created_at desc);
create index audit_review_car_idx on public.audit_log ((metadata->>'car_id'),id desc) where entity_type='review';
create index reviews_visible_rating_idx on public.reviews(car_id,rating,created_at desc,id desc) where not is_hidden;

alter table public.review_reports enable row level security;
revoke all on public.review_reports,public.reviews from public,anon,authenticated,service_role;
grant select on public.review_reports,public.reviews to authenticated;
drop policy if exists "Customers can read reviews" on public.reviews;
drop policy if exists "Customers can review own completed bookings" on public.reviews;
drop policy if exists "Admins can manage reviews" on public.reviews;
create policy "Authors and admins read raw reviews" on public.reviews for select to authenticated
  using (customer_id=(select auth.uid()) or (select public.is_admin()));
create policy "Admins read review reports" on public.review_reports for select to authenticated using ((select public.is_admin()));

alter table public.cars add column rating_avg numeric(3,2) not null default 0, add column rating_count integer not null default 0;
alter table public.owners add column rating_avg numeric(3,2) not null default 0, add column rating_count integer not null default 0;
alter table public.bookings add column returned_at timestamptz, add column completed_at timestamptz;

create function public.refresh_review_aggregates(p_car uuid,p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Lock before querying so concurrent transactions calculate from committed reviews plus their own write.
  perform 1 from public.cars where id=p_car for no key update;
  perform 1 from public.owners where id=p_owner for no key update;
  update public.cars set (rating_avg,rating_count)=(
    select coalesce(round(avg(rating),2),0),count(*) from public.reviews where car_id=p_car and not is_hidden
  ) where id=p_car;
  update public.owners set (rating_avg,rating_count)=(
    select coalesce(round(avg(coalesce(owner_rating,rating)),2),0),count(*) from public.reviews where owner_id=p_owner and not is_hidden
  ) where id=p_owner;
end;
$$;

create function public.guard_review_aggregates() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user <> (select pg_get_userbyid(proowner) from pg_proc where oid='public.refresh_review_aggregates(uuid,uuid)'::regprocedure)
     and (case when tg_op='INSERT' then (new.rating_avg,new.rating_count) is distinct from (0::numeric,0)
       else (new.rating_avg,new.rating_count) is distinct from (old.rating_avg,old.rating_count) end) then
    raise exception 'Rating aggregates are managed by reviews.';
  end if;
  return new;
end;
$$;
create trigger guard_car_review_aggregates before insert or update of rating_avg,rating_count on public.cars
  for each row execute function public.guard_review_aggregates();
create trigger guard_owner_review_aggregates before insert or update of rating_avg,rating_count on public.owners
  for each row execute function public.guard_review_aggregates();

create function public.reviews_aggregate_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.rating,new.owner_rating,new.is_hidden,new.car_id,new.owner_id)
    is not distinct from (old.rating,old.owner_rating,old.is_hidden,old.car_id,old.owner_id) then return null; end if;
  if tg_op='UPDATE' and (old.car_id,old.owner_id) is distinct from (new.car_id,new.owner_id) then
    perform public.refresh_review_aggregates(old.car_id,old.owner_id);
  end if;
  perform public.refresh_review_aggregates(coalesce(new.car_id,old.car_id),coalesce(new.owner_id,old.owner_id));
  return null;
end;
$$;
create trigger reviews_aggregate after insert or update or delete on public.reviews
  for each row execute function public.reviews_aggregate_trigger();
do $$ declare target record; begin
  for target in select distinct car_id,owner_id from public.reviews loop
    perform public.refresh_review_aggregates(target.car_id,target.owner_id);
  end loop;
end $$;

create function public.review_display_name(p_name text) returns text language sql immutable set search_path='' as $$
  select case when words[1] ~ '^[[:alpha:]''’.-]+$' then left(words[1],40)
    || case when cardinality(words)>1 and words[cardinality(words)] ~ '^[[:alpha:]''’.-]+$'
      then ' ' || left(words[cardinality(words)],1) || '.' else '' end
    else 'Customer' end
  from (select regexp_split_to_array(btrim(coalesce(p_name,'')),'[[:space:]]+') as words) parsed;
$$;
create view public.public_reviews with (security_barrier=true) as
select r.id,r.car_id,r.owner_id,r.rating,r.owner_rating,r.tags,r.comment,r.owner_reply,r.owner_reply_at,r.created_at,
  case when words[1] ~ '^[[:alpha:]''’.-]+$' then left(words[1],40)
    || case when cardinality(words)>1 and words[cardinality(words)] ~ '^[[:alpha:]''’.-]+$'
      then ' ' || left(words[cardinality(words)],1) || '.' else '' end else 'Customer' end as reviewer_name,
  to_char(b.start_date,'Mon YYYY') as trip_month
from public.reviews r join public.bookings b on b.id=r.booking_id join public.profiles p on p.id=r.customer_id
join public.cars c on c.id=r.car_id
cross join lateral (select regexp_split_to_array(btrim(coalesce(p.full_name,'')),'[[:space:]]+') as words) names
where not r.is_hidden and c.is_active and public.owner_can_accept(c.owner_id);

-- Public metadata and statistics contain only currently visible listings.
create view public.public_review_owners with (security_barrier=true) as
select c.id as car_id,o.business_name,o.rating_avg,o.rating_count from public.cars c join public.owners o on o.id=c.owner_id
where c.is_active and public.owner_can_accept(c.owner_id);
create view public.public_review_distribution with (security_barrier=true) as
select car_id,rating,count(*) as total from public.public_reviews group by car_id,rating;
create view public.public_review_tags with (security_barrier=true) as
select car_id,tag,count(*) as total from public.public_reviews cross join lateral unnest(tags) as labels(tag) group by car_id,tag;
revoke all on public.public_reviews,public.public_review_owners,public.public_review_distribution,public.public_review_tags from public,anon,authenticated,service_role;
grant select on public.public_reviews,public.public_review_owners,public.public_review_distribution,public.public_review_tags to anon,authenticated;

create function public.validate_review(p_rating int,p_owner_rating int,p_comment text,p_tags text[])
returns void language plpgsql set search_path='' as $$
begin
  if p_rating is null or p_rating not between 1 and 5 or p_owner_rating not between 1 and 5
     or char_length(btrim(p_comment))>1000 or p_comment ~* '(https?://|www\.|<)'
     or cardinality(p_tags)>5 or array_position(p_tags,null) is not null
     or not coalesce(p_tags,'{}') <@ array['clean','as_described','smooth_pickup','fair_price','friendly_owner','on_time','needs_improvement']
     or cardinality(p_tags) <> (select count(distinct tag) from unnest(p_tags) as tags(tag)) then
    raise exception 'REVIEW_INVALID';
  end if;
end;
$$;

create function public.submit_review(p_booking uuid,p_rating int,p_owner_rating int,p_comment text,p_tags text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare
  trip public.bookings;
  review_id uuid;
  owner_user uuid;
  vehicle text;
begin
  select * into trip from public.bookings where id=p_booking and customer_id=auth.uid() for update;
  if not found or trip.status<>'completed' or trip.owner_id is null
    or coalesce(trip.completed_at,(trip.end_date+1)::timestamp at time zone 'Asia/Manila') < now()-interval '60 days' then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;
  if exists(select 1 from public.reviews where booking_id=p_booking) then raise exception 'REVIEW_EXISTS'; end if;
  perform public.validate_review(p_rating,p_owner_rating,p_comment,p_tags);
  perform pg_advisory_xact_lock(hashtextextended('submit-review:'||auth.uid(),0));
  if (select count(*) from public.reviews where customer_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then
    raise exception 'REVIEW_RATE_LIMIT';
  end if;
  insert into public.reviews(booking_id,customer_id,car_id,owner_id,rating,owner_rating,comment,tags)
   values(trip.id,trip.customer_id,trip.car_id,trip.owner_id,p_rating,p_owner_rating,nullif(btrim(p_comment),''),coalesce(p_tags,'{}'))
   returning id into review_id;
  select profile_id into owner_user from public.owners where id=trip.owner_id;
  select concat_ws(' ',brand,model) into vehicle from public.cars where id=trip.car_id;
  perform public.notify(owner_user,'review_received','New '||p_rating||'-star review',
    'A customer reviewed '||left(coalesce(public.audit_safe_note(vehicle),'your vehicle'),100)||'.','/owner/reviews',trip.id,
    '{in_app,email,push}',false,'review-received:'||review_id);
  return review_id;
end;
$$;

create function public.edit_review(p_review uuid,p_rating int,p_owner_rating int,p_comment text,p_tags text[])
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.validate_review(p_rating,p_owner_rating,p_comment,p_tags);
  update public.reviews set rating=p_rating,owner_rating=p_owner_rating,comment=nullif(btrim(p_comment),''),
    tags=coalesce(p_tags,'{}'),edited_at=now()
    where id=p_review and customer_id=auth.uid() and edited_at is null and created_at>=now()-interval '7 days';
  if not found then raise exception 'REVIEW_NOT_ALLOWED'; end if;
end;
$$;

create function public.audit_review(p_action text,p_review public.reviews,p_summary text,p_reason text default null,p_changes jsonb default '{}')
returns void language sql security definer set search_path='' as $$
  select public.audit_write(p_action,'review',p_review.id::text,'Trip review',p_summary,p_changes,p_reason,
    jsonb_build_object('owner_id',p_review.owner_id,'car_id',p_review.car_id,'booking_id',p_review.booking_id));
$$;

create function public.reply_to_review(p_review uuid,p_reply text)
returns void language plpgsql security definer set search_path='' as $$
declare
  item public.reviews;
  owner_name text;
begin
  p_reply := btrim(coalesce(p_reply,''));
  if char_length(p_reply) not between 1 and 500 or p_reply ~* '(https?://|www\.|<)' then raise exception 'REVIEW_INVALID'; end if;
  update public.reviews r set owner_reply=p_reply,owner_reply_at=coalesce(r.owner_reply_at,now())
    from public.owners o where r.id=p_review and r.owner_id=o.id and o.profile_id=auth.uid()
    and not r.is_hidden and exists(select 1 from public.cars c where c.id=r.car_id and c.owner_id=o.id)
    and (r.owner_reply_at is null or r.owner_reply_at>=now()-interval '7 days')
    returning r.* into item;
  if not found then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  select business_name into owner_name from public.owners where id=item.owner_id;
  perform public.audit_review('review.replied',item,'Owner replied to a trip review');
  perform public.notify(item.customer_id,'review_reply','New reply to your review',
    coalesce(nullif(left(public.audit_safe_note(owner_name),100),''),'The owner')||' replied to your review.',
    '/account/bookings?review='||item.booking_id,item.booking_id,'{in_app,email,push}',false,'review-reply:'||p_review);
end;
$$;

insert into public.admin_alert_rules(event_key,label,description,mode,default_mode)
values ('review.reported','Review reported','A trip review needs moderation.','digest','digest');

create function public.report_review(p_review uuid,p_reason text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.reviews;
begin
  select * into item from public.reviews where id=p_review and not is_hidden and customer_id<>auth.uid()
    and (exists(select 1 from public.public_reviews where id=p_review)
      or exists(select 1 from public.owners where id=reviews.owner_id and profile_id=auth.uid()));
  if not found or auth.uid() is null then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  if p_reason is null or p_reason not in ('spam','offensive','personal_info','fake','other')
     or char_length(btrim(p_note))>300 or p_note ~* '(https?://|www\.|<)' then raise exception 'REVIEW_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('report-review:'||auth.uid(),0));
  if exists(select 1 from public.review_reports where review_id=p_review and reporter_id=auth.uid()) then raise exception 'REVIEW_EXISTS'; end if;
  if (select count(*) from public.review_reports where reporter_id=auth.uid() and created_at>now()-interval '24 hours')>=10 then
    raise exception 'REVIEW_RATE_LIMIT';
  end if;
  insert into public.review_reports(review_id,reporter_id,reason,note)
    values(p_review,auth.uid(),p_reason,nullif(btrim(p_note),''));
  if exists(select 1 from public.owners where profile_id=auth.uid()) or public.is_admin() then
    perform public.audit_review('review.reported',item,'Trip review reported',p_reason);
  end if;
  perform public.notify_admins('review_reported','Trip review reported','A trip review needs moderation.',
    '/admin/reviews','{in_app,push}',false,'review-reported:'||p_review);
  begin
    perform public.admin_alert('review.reported','Trip review reported','A trip review needs moderation.',
      '/admin/reviews','review.reported:'||p_review||':'||(now() at time zone 'Asia/Manila')::date);
  exception when others then
    raise warning 'Could not enqueue the review moderation alert (%).',sqlstate;
  end;
end;
$$;

create function public.admin_moderate_review(p_review uuid,p_hide boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.reviews;
begin
  if not public.is_admin() then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  p_reason := nullif(btrim(p_reason),'');
  if p_hide is null or (p_hide and coalesce(char_length(p_reason),0)<3) or char_length(p_reason)>300 then
    raise exception 'REVIEW_INVALID';
  end if;
  if not p_hide then
    select * into item from public.reviews where id=p_review for update;
    if not found then raise exception 'REVIEW_NOT_ALLOWED'; end if;
    perform public.validate_review(item.rating,item.owner_rating,item.comment,item.tags);
  end if;
  update public.reviews set is_hidden=p_hide,hidden_reason=case when p_hide then public.audit_safe_note(p_reason) end,
    hidden_by=case when p_hide then auth.uid() end,hidden_at=case when p_hide then now() end
    where id=p_review and is_hidden<>p_hide returning * into item;
  if not found then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  perform public.audit_review(case when p_hide then 'review.hidden' else 'review.unhidden' end,item,
    case when p_hide then 'Trip review hidden' else 'Trip review restored' end,p_reason,
    jsonb_build_object('is_hidden',jsonb_build_object('from',(not p_hide)::text,'to',p_hide::text)));
  if p_hide then
    perform public.notify(item.customer_id,'review_hidden','Your review was moderated',
      'This review was hidden by moderators.','/account/bookings?review='||item.booking_id,item.booking_id,
      '{in_app}',false,'review-hidden:'||p_review);
  end if;
end;
$$;

create function public.admin_resolve_review_report(p_report uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.reviews; target uuid; report_reason text;
begin
  if not public.is_admin() then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  if p_action is null or p_action not in ('dismissed','actioned') then raise exception 'REVIEW_INVALID'; end if;
  update public.review_reports set status=p_action where id=p_report and status='open' returning review_id,reason into target,report_reason;
  if not found then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  select * into item from public.reviews where id=target;
  perform public.audit_review('review.report_'||p_action,item,'Review report '||p_action,report_reason,
    jsonb_build_object('status',jsonb_build_object('from','open','to',p_action)));
end;
$$;

create function public.owner_trip_reviews(p_filter text default 'all',p_offset int default 0)
returns table(id uuid,booking_id uuid,car_id uuid,rating smallint,owner_rating smallint,tags text[],comment text,
  owner_reply text,owner_reply_at timestamptz,created_at timestamptz,reviewer_name text,trip_month text,vehicle text,reported boolean)
language sql stable security definer set search_path='' as $$
  select r.id,r.booking_id,r.car_id,r.rating,r.owner_rating,r.tags,r.comment,r.owner_reply,r.owner_reply_at,r.created_at,
    public.review_display_name(p.full_name),to_char(b.start_date,'Mon YYYY'),concat_ws(' ',c.brand,c.model),flags.reported
  from public.reviews r join public.bookings b on b.id=r.booking_id join public.profiles p on p.id=r.customer_id
  join public.cars c on c.id=r.car_id and c.owner_id=r.owner_id join public.owners o on o.id=r.owner_id
  cross join lateral (select exists(select 1 from public.review_reports rr where rr.review_id=r.id and rr.reporter_id=auth.uid()) as reported) flags
  where o.profile_id=auth.uid() and not r.is_hidden and
    (p_filter='all' or (p_filter='reply' and r.owner_reply is null) or (p_filter='reported' and flags.reported))
  order by r.created_at desc,r.id desc offset greatest(0,p_offset) limit 21;
$$;
create function public.owner_review_counts()
returns table(rating_avg numeric,rating_count integer,recent bigint,unanswered bigint)
language sql stable security definer set search_path='' as $$
  select o.rating_avg,o.rating_count,count(r.id) filter(where r.created_at>=now()-interval '30 days'),
    count(r.id) filter(where r.owner_reply is null and exists(select 1 from public.cars c where c.id=r.car_id and c.owner_id=o.id))
  from public.owners o left join public.reviews r on r.owner_id=o.id and not r.is_hidden
  where o.profile_id=auth.uid() group by o.id;
$$;

revoke all on function public.refresh_review_aggregates(uuid,uuid),public.guard_review_aggregates(),public.reviews_aggregate_trigger(),
 public.review_display_name(text),public.validate_review(int,int,text,text[]),public.audit_review(text,public.reviews,text,text,jsonb),
 public.submit_review(uuid,int,int,text,text[]),public.edit_review(uuid,int,int,text,text[]),public.reply_to_review(uuid,text),
 public.report_review(uuid,text,text),public.admin_moderate_review(uuid,boolean,text),public.admin_resolve_review_report(uuid,text),
 public.owner_trip_reviews(text,int),public.owner_review_counts() from public,anon,authenticated,service_role;
grant execute on function public.submit_review(uuid,int,int,text,text[]),public.edit_review(uuid,int,int,text,text[]),
 public.reply_to_review(uuid,text),public.report_review(uuid,text,text),public.admin_moderate_review(uuid,boolean,text),
 public.admin_resolve_review_report(uuid,text),public.owner_trip_reviews(text,int),public.owner_review_counts() to authenticated;
