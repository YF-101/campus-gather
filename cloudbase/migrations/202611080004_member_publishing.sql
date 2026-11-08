-- Owner selected: every authenticated member may publish their own events.
-- Existing platform identity, RLS, direct-write denial and owner checks remain.
begin;
alter table public.cg_activities add column created_at timestamptz not null default now();
create index cg_owner_created on public.cg_activities(owner_id,created_at);
do $migration$
declare definition text;
 create_guard text := $guard$  if me.role<>'organizer' then raise exception '只有组织者可以发布活动';end if;$guard$;
 owner_guard text := $guard$me.role<>'organizer' or event.owner_id<>uid$guard$;
 register_guard text := $guard$  if me.role<>'student' then raise exception '请使用学生身份报名';end if;$guard$;
begin
 select pg_get_functiondef('public.cg_call(text,jsonb)'::regprocedure) into definition;
 if strpos(definition,create_guard)=0 or strpos(definition,owner_guard)=0 or strpos(definition,register_guard)=0 then
  raise exception 'Existing permission function differs; review before applying';
 end if;
 definition:=replace(definition,create_guard,$quota$  -- Serialize publication limits per authenticated member.
  perform 1 from public.cg_profiles where id=uid for update;
  if (select count(*) from public.cg_activities where owner_id=uid and created_at>now()-interval '24 hours')>=5 then
   raise exception '每 24 小时最多发布 5 场活动，请稍后再试';
  end if;$quota$);
 definition:=replace(definition,owner_guard,'event.owner_id<>uid');
 definition:=replace(definition,register_guard,'  -- Every authenticated member may participate.');
 execute definition;
end;
$migration$;
commit;
