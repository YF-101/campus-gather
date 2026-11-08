-- Real-database verification only: every profile/activity/registration mutation
-- is rolled back. No credentials are created and no real role grant persists.
begin;
select set_config('campus.audit.owner',(select p.id from public.cg_profiles p join auth.users u on u.sub=p.id order by p.id limit 1),true);
select set_config('campus.audit.student',(select sub from auth.users where sub<>current_setting('campus.audit.owner') order by sub limit 1),true);
do $audit$ begin
 if nullif(current_setting('campus.audit.owner'),'') is null or nullif(current_setting('campus.audit.student'),'') is null then raise exception 'Audit needs two existing platform identities';end if;
end $audit$;
update public.cg_profiles set role='organizer' where id=current_setting('campus.audit.owner');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('campus.audit.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('campus.audit.owner'))::text,true);
select set_config('campus.audit.event',(public.cg_call('create',jsonb_build_object('title','【事务回滚验证】组织者流程','description','仅用于验证发布、报名、权限及幂等签到；本事务全部回滚。','location','验证环境','category','技术','capacity',2,'starts_at',now()+interval '3 days','deadline',now()+interval '2 days'))->>'id'),true);
select set_config('request.jwt.claim.sub',current_setting('campus.audit.student'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('campus.audit.student'))::text,true);
select public.cg_call('register',jsonb_build_object('id',current_setting('campus.audit.event')));
do $audit$ begin
 begin
  perform public.cg_call('attendees',jsonb_build_object('id',current_setting('campus.audit.event')));
  raise exception 'Audit failed: non-owner could read roster';
 exception when raise_exception then
  if sqlerrm<>'没有管理该活动的权限' then raise;end if;
 end;
end $audit$;
select set_config('request.jwt.claim.sub',current_setting('campus.audit.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('campus.audit.owner'))::text,true);
do $audit$
declare first_checkin text; latest jsonb;
begin
 if jsonb_array_length(public.cg_call('attendees',jsonb_build_object('id',current_setting('campus.audit.event'))))<>1 then raise exception 'Audit failed: roster count';end if;
 perform public.cg_call('checkin',jsonb_build_object('id',current_setting('campus.audit.event'),'user',current_setting('campus.audit.student')));
 first_checkin:=public.cg_call('attendees',jsonb_build_object('id',current_setting('campus.audit.event')))->0->>'checked_in_at';
 perform public.cg_call('checkin',jsonb_build_object('id',current_setting('campus.audit.event'),'user',current_setting('campus.audit.student')));
 latest:=public.cg_call('attendees',jsonb_build_object('id',current_setting('campus.audit.event')));
 if first_checkin is null or first_checkin<>(latest->0->>'checked_in_at') then raise exception 'Audit failed: checkin idempotency';end if;
end $audit$;
select 'PASS: publish, enroll, owner-only roster, checkin, idempotency; all changes rolled back' as organizer_audit;
rollback;
