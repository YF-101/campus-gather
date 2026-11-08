-- Owner approved on 2026-11-08: authenticated students can enroll without an extra email prerequisite.
-- Removes only the extra email prerequisite. Login, roles, capacity, deadlines,
-- own-registration rules and organizer ownership checks remain in cg_call.
begin;
do $migration$
declare
 definition text;
 email_guard text := $guard$  if not exists(select 1 from auth.users where sub=uid and email_verified is true) then raise exception '请先验证邮箱，再报名活动';end if;$guard$;
begin
 select pg_get_functiondef('public.cg_call(text,jsonb)'::regprocedure) into definition;
 if strpos(definition,email_guard)=0 then
  raise exception 'Existing enrollment function differs; review before applying';
 end if;
 execute replace(definition,email_guard,'  -- Campus enrollment requires an authenticated student account.');
end;
$migration$;
commit;
