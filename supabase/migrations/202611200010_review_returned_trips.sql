-- Allow customers to review a trip as soon as its return is recorded.
create or replace function public.submit_review(p_booking uuid,p_rating int,p_owner_rating int,p_comment text,p_tags text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare
  trip public.bookings;
  review_id uuid;
  owner_user uuid;
  vehicle text;
begin
  select * into trip from public.bookings where id=p_booking and customer_id=auth.uid() for update;
  if not found or trip.status not in ('returned','completed') or trip.owner_id is null
    or coalesce(case when trip.status='completed' then trip.completed_at else trip.returned_at end,(trip.end_date+1)::timestamp at time zone 'Asia/Manila') < now()-interval '60 days' then
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
