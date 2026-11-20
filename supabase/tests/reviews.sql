begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('71000000-0000-4000-8000-000000000001','review-customer@example.invalid','{"full_name":"Maria Ana Santos"}'),
 ('71000000-0000-4000-8000-000000000002','review-owner@example.invalid','{"full_name":"Fixture Owner"}'),
 ('71000000-0000-4000-8000-000000000003','review-admin@example.invalid','{"full_name":"Fixture Admin"}'),
 ('71000000-0000-4000-8000-000000000004','review-other@example.invalid','{}');
update public.profiles set role='owner' where id='71000000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='71000000-0000-4000-8000-000000000003';
insert into public.owners(id,profile_id,business_name,payment_qr_verified,fee_mode)
 values('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','Fixture Rentals',true,'invoice');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.cars(id,owner_id,brand,model)
 values('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','Test','Vehicle');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
insert into public.car_rates(car_id,mode,daily_rate)
 values('73000000-0000-4000-8000-000000000001','self_drive',1000);
update public.profiles set license_classes=array['car'],verification='approved' where id='71000000-0000-4000-8000-000000000001';
insert into public.bookings(id,car_id,customer_id,mode,start_date,end_date)
select ('74000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','self_drive',current_date+i*3,current_date+i*3+1
from generate_series(1,5) i;
update public.bookings set status='completed' where id in ('74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000004');
update public.bookings set status='returned' where id in ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003');
update public.bookings set status='confirmed' where id='74000000-0000-4000-8000-000000000005';

alter table public.bookings disable trigger track_trip_completion;
update public.bookings set returned_at=now()-interval '48 hours' where id='74000000-0000-4000-8000-000000000002';
update public.bookings set returned_at=now()-interval '47 hours' where id='74000000-0000-4000-8000-000000000003';
update public.bookings set completed_at=now()-interval '61 days' where id='74000000-0000-4000-8000-000000000004';
alter table public.bookings enable trigger track_trip_completion;

create function pg_temp.review_test_claim(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(who::text,''),true);
  perform set_config('request.jwt.claims',case when who is null then '{}' else jsonb_build_object('sub',who,'role','authenticated')::text end,true);
end;
$$;
create function pg_temp.assert_review_error(statement text,expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected %',expected;
exception when raise_exception then
  assert sqlerrm=expected,sqlerrm;
end;
$$;

set local role authenticated;
select pg_temp.review_test_claim('71000000-0000-4000-8000-000000000004');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000001',5,null,null,'{}')$$,'REVIEW_NOT_ALLOWED');

select pg_temp.review_test_claim('71000000-0000-4000-8000-000000000001');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000002',5,null,null,'{}')$$,'REVIEW_NOT_ALLOWED');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000004',5,null,null,'{}')$$,'REVIEW_NOT_ALLOWED');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000005',5,null,null,'{}')$$,'REVIEW_NOT_ALLOWED');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000001',0,null,null,'{}')$$,'REVIEW_INVALID');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000001',6,null,null,'{}')$$,'REVIEW_INVALID');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000001',5,null,'<img src=x>','{}')$$,'REVIEW_INVALID');
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000001',5,null,'http://example.invalid','{}')$$,'REVIEW_INVALID');
select public.submit_review('74000000-0000-4000-8000-000000000001',5,3,' Clean ride. ',array['clean']);
select pg_temp.assert_review_error(
 $$select public.submit_review('74000000-0000-4000-8000-000000000001',5,null,null,'{}')$$,'REVIEW_EXISTS');
select public.edit_review(id,4,5,'Smooth pickup',array['smooth_pickup']) from public.reviews;
select pg_temp.assert_review_error(
 $$select public.edit_review(id,5,null,null,'{}') from public.reviews$$,'REVIEW_NOT_ALLOWED');
select pg_temp.assert_review_error(
 $$select public.report_review(id,'spam',null) from public.public_reviews$$,'REVIEW_NOT_ALLOWED');

reset role;
do $$ begin
  assert (select rating_avg=4 and rating_count=1 from public.cars where id='73000000-0000-4000-8000-000000000001');
  assert (select rating_avg=5 and rating_count=1 from public.owners where id='72000000-0000-4000-8000-000000000001');
  assert exists(select 1 from public.notifications where type='review_received' and user_id='71000000-0000-4000-8000-000000000002');
end $$;

set local role anon;
do $$ begin
  assert exists(select 1 from public.public_reviews where reviewer_name='Maria S.' and rating=4);
  assert not exists(select 1 from information_schema.columns where table_schema='public' and table_name='public_reviews'
    and column_name in ('booking_id','customer_id','hidden_reason'));
  begin
    perform 1 from public.reviews;
    raise exception 'Anonymous raw read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select pg_temp.review_test_claim('71000000-0000-4000-8000-000000000004');
select pg_temp.assert_review_error($$select public.reply_to_review(id,'Reply') from public.public_reviews$$,'REVIEW_NOT_ALLOWED');
select pg_temp.assert_review_error($$select public.admin_moderate_review(id,true,'Spam') from public.public_reviews$$,'REVIEW_NOT_ALLOWED');
select public.report_review(id,'offensive','Fixture report') from public.public_reviews;
select pg_temp.assert_review_error($$select public.report_review(id,'offensive',null) from public.public_reviews$$,'REVIEW_EXISTS');

select pg_temp.review_test_claim('71000000-0000-4000-8000-000000000002');
do $$ begin
  assert not exists(select 1 from public.reviews);
  assert exists(select 1 from public.owner_trip_reviews() where reviewer_name='Maria S.' and booking_id is not null);
  perform pg_temp.assert_review_error($q$select public.reply_to_review(id,repeat('a',501)) from public.public_reviews$q$,'REVIEW_INVALID');
end $$;
select public.reply_to_review(id,'Thank you') from public.public_reviews;
select public.reply_to_review(id,'Thank you for the feedback') from public.public_reviews;

select pg_temp.review_test_claim('71000000-0000-4000-8000-000000000003');
select pg_temp.assert_review_error($$select public.admin_moderate_review(id,true,'') from public.reviews$$,'REVIEW_INVALID');
select public.admin_moderate_review(id,true,'Offensive') from public.reviews;
do $$ begin
  assert not exists(select 1 from public.public_reviews);
  assert (select rating_count=0 from public.cars where id='73000000-0000-4000-8000-000000000001');
  assert (select rating_count=0 from public.owners where id='72000000-0000-4000-8000-000000000001');
end $$;
select pg_temp.review_test_claim('71000000-0000-4000-8000-000000000001');
do $$ begin
  assert exists(select 1 from public.reviews where is_hidden);
  assert not exists(select 1 from public.public_reviews);
end $$;
select pg_temp.review_test_claim('71000000-0000-4000-8000-000000000003');
select public.admin_moderate_review(id,false,'Restored after review') from public.reviews;
select public.admin_resolve_review_report(id,'actioned') from public.review_reports;
do $$ begin
  assert exists(select 1 from public.public_reviews where owner_reply='Thank you for the feedback');
  assert (select count(*) from public.audit_log where action in ('review.hidden','review.unhidden','review.report_actioned'))=3;
  assert exists(select 1 from public.admin_alert_queue where event_key='review.reported' and status='digest');
end $$;

reset role;
select pg_temp.review_test_claim(null);
do $$ begin
  assert (select count(*) from public.notifications where type='review_reply')=1;
  assert public.auto_complete_returned_bookings()=1;
  assert public.auto_complete_returned_bookings()=0;
  assert (select status='returned' from public.bookings where id='74000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.notifications where type='review_prompt' and booking_id='74000000-0000-4000-8000-000000000002')=1;
end $$;
alter table public.bookings disable trigger track_trip_completion;
update public.bookings set completed_at=now()-interval '3 days' where id='74000000-0000-4000-8000-000000000002';
alter table public.bookings enable trigger track_trip_completion;
select public.send_trip_review_reminders();
select public.send_trip_review_reminders();
do $$ begin
  assert (select count(*) from public.notifications where type='review_reminder')=1;
end $$;

delete from public.reviews;
do $$ begin
  assert (select rating_avg=0 and rating_count=0 from public.cars where id='73000000-0000-4000-8000-000000000001');
  assert (select rating_avg=0 and rating_count=0 from public.owners where id='72000000-0000-4000-8000-000000000001');
end $$;
rollback;
