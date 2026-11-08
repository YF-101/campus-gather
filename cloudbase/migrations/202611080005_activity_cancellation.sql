-- Keep event/registration history; cancelling never deletes user records.
begin;
alter table public.cg_activities add column cancelled_at timestamptz;
alter table public.cg_activities add column cancellation_reason text check(length(cancellation_reason)<=200);
do $migration$
declare definition text;
 marker text := $marker$ if action in ('attendees','checkin') then$marker$;
begin
 select pg_get_functiondef('public.cg_call(text,jsonb)'::regprocedure) into definition;
 if strpos(definition,marker)=0 then raise exception 'Existing activity function differs; review before applying';end if;
 definition:=replace(definition,marker,$cancel$ if action='cancel_activity' then
  if event.owner_id<>uid then raise exception '没有管理该活动的权限';end if;
  if length(coalesce(payload->>'reason',''))>200 then raise exception '取消原因最多 200 字';end if;
  update public.cg_activities set cancellation_reason=case when cancelled_at is null then coalesce(nullif(trim(payload->>'reason'),''),'发布者取消了活动') else cancellation_reason end,cancelled_at=coalesce(cancelled_at,now()) where id=eid;
  return jsonb_build_object('ok',true);
 end if;
 if event.cancelled_at is not null and action in ('register','checkin') then raise exception '活动已取消';end if;
 if action in ('attendees','checkin') then$cancel$);
 definition:=replace(definition,$old$if event.starts_at<=now() then raise exception '活动已开始，不能取消报名';end if;$old$,$new$if event.starts_at<=now() and event.cancelled_at is null then raise exception '活动已开始，不能取消报名';end if;$new$);
 execute definition;
end;
$migration$;
commit;
