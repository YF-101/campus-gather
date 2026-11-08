-- 集刻独立命名空间；不修改 ols_*、auth.users 或既有存储权限。
begin;
create table public.cg_profiles(id text primary key,name text not null default '校园同学' check(length(name) between 1 and 24),role text not null default 'student' check(role in ('student','organizer')));
create table public.cg_activities(id uuid primary key default gen_random_uuid(),owner_id text not null references public.cg_profiles(id),title text not null check(length(title) between 2 and 60),description text not null check(length(description) between 1 and 2000),location text not null check(length(location) between 1 and 80),category text not null check(category in ('技术','艺术','运动','公益','生活')),starts_at timestamptz not null,deadline timestamptz not null,capacity integer not null check(capacity between 1 and 500),check(deadline<=starts_at));
create table public.cg_registrations(activity_id uuid not null references public.cg_activities(id),user_id text not null references public.cg_profiles(id),status text not null default 'registered' check(status in ('registered','cancelled')),registered_at timestamptz not null default now(),checked_in_at timestamptz,primary key(activity_id,user_id));
create index cg_active_registrations on public.cg_registrations(activity_id,status);
alter table public.cg_profiles enable row level security;
alter table public.cg_activities enable row level security;
alter table public.cg_registrations enable row level security;
revoke all on public.cg_profiles,public.cg_activities,public.cg_registrations from public,anon,authenticated;
grant select on public.cg_profiles,public.cg_activities,public.cg_registrations to authenticated;
create policy cg_profile_self on public.cg_profiles for select to authenticated using(id=auth.uid());
create policy cg_activity_read on public.cg_activities for select to authenticated using(auth.uid() is not null);
create policy cg_registration_self on public.cg_registrations for select to authenticated using(user_id=auth.uid());
create function public.cg_call(action text,payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid text:=auth.uid(); me public.cg_profiles; event public.cg_activities; reg public.cg_registrations; eid uuid; total integer; result jsonb;
begin
 if uid is null or not exists(select 1 from auth.users where sub=uid) then raise exception '请先登录有效账号';end if;
 insert into public.cg_profiles(id) values(uid) on conflict do nothing;
 select * into me from public.cg_profiles where id=uid;
 if action='profile' then
  if payload ? 'name' then update public.cg_profiles set name=trim(payload->>'name') where id=uid returning * into me;end if;
  return to_jsonb(me);
 end if;
 if action='list' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
   select a.*,p.name as organizer,(select count(*)::int from public.cg_registrations r where r.activity_id=a.id and status='registered') as enrolled,exists(select 1 from public.cg_registrations r where r.activity_id=a.id and r.user_id=uid and status='registered') as registered,(select checked_in_at from public.cg_registrations r where r.activity_id=a.id and r.user_id=uid and status='registered') as checked_in_at from public.cg_activities a join public.cg_profiles p on p.id=a.owner_id order by starts_at limit 100
  ) x;return result;
 end if;
 if action='create' then
  if me.role<>'organizer' then raise exception '只有组织者可以发布活动';end if;
  if (payload->>'starts_at')::timestamptz<=now() or (payload->>'deadline')::timestamptz<=now() or (payload->>'deadline')::timestamptz>(payload->>'starts_at')::timestamptz then raise exception '请检查活动开始和截止时间';end if;
  insert into public.cg_activities(owner_id,title,description,location,category,starts_at,deadline,capacity) values(uid,trim(payload->>'title'),trim(payload->>'description'),trim(payload->>'location'),payload->>'category',(payload->>'starts_at')::timestamptz,(payload->>'deadline')::timestamptz,(payload->>'capacity')::integer) returning id into eid;return jsonb_build_object('id',eid);
 end if;
 eid:=(payload->>'id')::uuid;
 -- 所有报名变更先锁活动，再锁报名，跨连接遵守同一锁顺序。
 select * into event from public.cg_activities where id=eid for update;
 if not found then raise exception '活动不存在';end if;
 if action in ('attendees','checkin') then
  if me.role<>'organizer' or event.owner_id<>uid then raise exception '没有管理该活动的权限';end if;
  if action='attendees' then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from(select r.user_id,p.name,r.registered_at,r.checked_in_at from public.cg_registrations r join public.cg_profiles p on p.id=r.user_id where r.activity_id=eid and status='registered' order by registered_at) x;return result;
  end if;
  update public.cg_registrations set checked_in_at=coalesce(checked_in_at,now()) where activity_id=eid and user_id=payload->>'user' and status='registered';
  if not found then raise exception '没有找到有效报名';end if;
 elsif action='register' then
  if me.role<>'student' then raise exception '请使用学生身份报名';end if;
  if not exists(select 1 from auth.users where sub=uid and email_verified is true) then raise exception '请先验证邮箱，再报名活动';end if;
  select * into reg from public.cg_registrations where activity_id=eid and user_id=uid;
  if reg.status='registered' then raise exception '你已经报名此活动';end if;
  if event.deadline<=now() then raise exception '报名已经截止';end if;
  select count(*) into total from public.cg_registrations where activity_id=eid and status='registered';
  if total>=event.capacity then raise exception '名额已满';end if;
  insert into public.cg_registrations(activity_id,user_id) values(eid,uid) on conflict(activity_id,user_id) do update set status='registered',registered_at=now(),checked_in_at=null;
 elsif action='cancel' then
  select * into reg from public.cg_registrations where activity_id=eid and user_id=uid for update;
  if not found or reg.status<>'registered' then raise exception '你尚未报名此活动';end if;
  if reg.checked_in_at is not null then raise exception '已经签到，不能取消报名';end if;
  if event.starts_at<=now() then raise exception '活动已开始，不能取消报名';end if;
  update public.cg_registrations set status='cancelled' where activity_id=eid and user_id=uid;
 else raise exception '操作无效';end if;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.cg_call(text,jsonb) from public,anon;
grant execute on function public.cg_call(text,jsonb) to authenticated;
-- 无登录能力的虚构组织者，只用于初始演示活动；不授予任何真实账号新权限。
insert into public.cg_profiles(id,name,role) values('campus-example-host','集刻演示组织者','organizer');
insert into public.cg_activities(owner_id,title,description,location,category,starts_at,deadline,capacity) values
('campus-example-host','把想法，写成第一个网页','云端测试活动。带上电脑和好奇心，一起认识网页与数据库。','创客中心 · 302','技术',now()+interval '3 days',now()+interval '2 days',24),
('campus-example-host','周末，和胶片一起散步','校园摄影体验。此为功能测试活动，不是真实线下招募。','图书馆南门','艺术',now()+interval '4 days',now()+interval '3 days',18),
('campus-example-host','傍晚六点，操场见','测试活动：慢跑与晚风。时间和名额用于演示报名流程。','东区田径场','运动',now()+interval '5 days',now()+interval '4 days',30);
commit;
