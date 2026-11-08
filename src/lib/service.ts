import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { authSchema, createAuth } from './auth.ts';
import { actors, categories } from './model.ts';
import type { Activity, ActivityInput, Attendee } from './model.ts';
const schema = `
create table if not exists people(id text primary key,name text not null,role text not null check(role in ('student','organizer')));
create table if not exists activities(id text primary key,owner_id text not null references people(id),title text not null,description text not null,location text not null,category text not null,starts_at timestamptz not null,deadline timestamptz not null,capacity integer not null check(capacity between 1 and 500),check(deadline<=starts_at));
alter table activities add column if not exists cancelled_at timestamptz;
alter table activities add column if not exists cancellation_reason text;
create table if not exists registrations(activity_id text references activities(id),user_id text references people(id),status text not null default 'registered' check(status in ('registered','cancelled')),registered_at timestamptz not null default now(),checked_in_at timestamptz,primary key(activity_id,user_id));
create index if not exists registrations_active on registrations(activity_id,status);
`;
export async function createService(path?: string) {
    const db = new PGlite(path);
    await db.exec(schema + authSchema);
    for (const actor of actors)
        await db.query('insert into people values($1,$2,$3) on conflict do nothing', [actor.id, actor.name, actor.role]);
    let tail: Promise<unknown> = Promise.resolve();
    function serialize<T>(fn: () => Promise<T>): Promise<T> { const result = tail.then(fn); tail = result.catch(() => { }); return result; }
    async function actor(id: string) { const a = (await db.query<{
        id: string;
        name: string;
        role: 'student' | 'organizer';
    }>('select id,name,role from people where id=$1', [id])).rows[0]; if (!a)
        throw Error('身份无效'); return a; }
    async function owned(uid: string, id: string) {
        await actor(uid);
        const row = (await db.query<{
            owner_id: string; cancelled_at: string | null;
        }>('select owner_id,cancelled_at from activities where id=$1', [id])).rows[0];
        if (!row)
            throw Error('活动不存在');
        if (row.owner_id !== uid)
            throw Error('没有管理该活动的权限');
        return row;
    }
    async function list(uid: string, own = false): Promise<Activity[]> { await actor(uid); return (await db.query<Activity>(`select a.*,p.name as organizer,(select count(*)::int from registrations r where r.activity_id=a.id and r.status='registered') as enrolled,exists(select 1 from registrations r where r.activity_id=a.id and r.user_id=$1 and r.status='registered') as registered,(select checked_in_at from registrations r where r.activity_id=a.id and r.user_id=$1 and r.status='registered') as checked_in_at from activities a join people p on p.id=a.owner_id where ($2::boolean=false or a.owner_id=$1) order by starts_at`, [uid, own])).rows; }
    async function create(uid: string, input: ActivityInput) {
        await actor(uid);
        if (!input || typeof input !== 'object')
            throw Error('活动信息无效');
        const { title, description, location, category, capacity, starts_at, deadline } = input;
        if (typeof title !== 'string' || title.trim().length < 2 || title.length > 60 || typeof description !== 'string' || !description.trim() || description.length > 2000 || typeof location !== 'string' || !location.trim() || location.length > 80)
            throw Error('请填写完整的标题、介绍和地点');
        if (!categories.includes(category as typeof categories[number]))
            throw Error('活动分类无效');
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
            throw Error('活动名额应为 1–500 人');
        if (!Number.isFinite(Date.parse(starts_at)) || Date.parse(starts_at) <= Date.now())
            throw Error('活动时间应晚于现在');
        if (!Number.isFinite(Date.parse(deadline)) || Date.parse(deadline) <= Date.now() || Date.parse(deadline) > Date.parse(starts_at))
            throw Error('报名截止时间应在现在之后、活动开始之前');
        const id = randomUUID();
        await serialize(() => db.query('insert into activities(id,owner_id,title,description,location,category,starts_at,deadline,capacity) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, uid, title.trim(), description.trim(), location.trim(), category, starts_at, deadline, capacity]));
        return { id };
    }
    async function register(uid: string, id: string) {
        await actor(uid);
        return serialize(() => db.transaction(async (tx) => {
            const a = (await tx.query<{
                capacity: number; cancelled_at: string | null;
                deadline: string;
                starts_at: string;
            }>('select * from activities where id=$1 for update', [id])).rows[0];
            if (!a)
                throw Error('活动不存在');
            if(a.cancelled_at)throw Error('活动已取消');
            const existing = (await tx.query<{
                status: string; cancelled_at: string | null;
            }>('select status from registrations where activity_id=$1 and user_id=$2', [id, uid])).rows[0];
            if (existing?.status === 'registered')
                throw Error('你已经报名此活动');
            if (Date.parse(a.deadline) <= Date.now() || Date.parse(a.starts_at) <= Date.now())
                throw Error('报名已经截止');
            const count = (await tx.query<{
                n: number;
            }>("select count(*)::int as n from registrations where activity_id=$1 and status='registered'", [id])).rows[0].n;
            if (count >= a.capacity)
                throw Error('名额已满，看看其他活动吧');
            await tx.query("insert into registrations(activity_id,user_id) values($1,$2) on conflict(activity_id,user_id) do update set status='registered',registered_at=now(),checked_in_at=null", [id, uid]);
        }));
    }
    async function cancel(uid: string, id: string) {
        await actor(uid);
        return serialize(() => db.transaction(async (tx) => {
            const r = (await tx.query<{
                checked_in_at: string | null;
                starts_at: string;
                status: string; cancelled_at: string | null;
            }>(`select r.*,a.starts_at,a.cancelled_at from registrations r join activities a on a.id=r.activity_id where r.activity_id=$1 and r.user_id=$2 for update`, [id, uid])).rows[0];
            if (!r || r.status !== 'registered')
                throw Error('你尚未报名此活动');
            if (r.checked_in_at)
                throw Error('已经签到，不能取消报名');
            if (Date.parse(r.starts_at) <= Date.now() && !r.cancelled_at)
                throw Error('活动已开始，不能取消报名');
            await tx.query("update registrations set status='cancelled' where activity_id=$1 and user_id=$2", [id, uid]);
        }));
    }
    async function attendees(uid: string, id: string): Promise<Attendee[]> { await owned(uid, id); return (await db.query<Attendee>("select r.user_id,p.name,r.registered_at,r.checked_in_at from registrations r join people p on p.id=r.user_id where r.activity_id=$1 and status='registered' order by registered_at", [id])).rows; }
    async function checkIn(uid: string, id: string, target: string) {
        return serialize(async () => {
            const event=await owned(uid, id);
            if(event.cancelled_at)throw Error('活动已取消');
            return db.transaction(async (tx) => {
                const rows = await tx.query("update registrations set checked_in_at=coalesce(checked_in_at,now()) where activity_id=$1 and user_id=$2 and status='registered' returning user_id", [id, target]);
                if (!rows.rows.length)
                    throw Error('没有找到有效报名');
            });
        });
    }
    async function cancelEvent(uid:string,id:string,reason=''){
        if(typeof reason!=='string'||reason.length>200)throw Error('取消原因最多 200 字');
        return serialize(async()=>{await owned(uid,id);await db.query("update activities set cancellation_reason=case when cancelled_at is null then $2 else cancellation_reason end,cancelled_at=coalesce(cancelled_at,now()) where id=$1",[id,reason.trim()||'发布者取消了活动']);});
    }
    return { cancelEvent, auth: createAuth(db, serialize), create, list, register, cancel, attendees, checkIn, mine: async (uid: string) => (await list(uid)).filter(a => a.registered), close: async () => { await tail; await db.close(); }, seed: async () => {
            if ((await db.query<{
                n: number;
            }>('select count(*)::int as n from activities')).rows[0].n)
                return;
            const data = [['把想法，写成第一个网页', '一次轻松的创作工作坊。从一个小想法开始，用代码让它成为可交互的作品。欢迎零基础同学，带上电脑和好奇心。', '技术', '创客中心 · 302', 24, 2], ['周末，和胶片一起散步', '在校园寻找光与影，学习构图，也分享你镜头里的日常。相机、手机都可以。', '艺术', '图书馆南门集合', 18, 4], ['傍晚六点，操场见', '一起慢跑三公里。不比速度，只享受运动后的晚风。请穿舒适的运动鞋。', '运动', '东区田径场', 30, 3], ['让旧书，遇见新朋友', '整理闲置书籍，分享一本改变过你的书。你带来的每一本，都可能开启另一段故事。', '公益', '学生中心 · 共享客厅', 20, 5], ['咖啡与灵感交换所', '和不同专业的同学聊聊正在做的事。每人准备一个问题，一起发现新的可能。', '生活', '校园咖啡馆 · 二层', 12, 6], ['从零认识设计系统', '拆解颜色、字体和组件，让一个页面拥有一致的表达。适合对界面设计感兴趣的同学。', '技术', '设计学院 · B203', 16, 7]];
            for (let i = 0; i < data.length; i++) {
                const [title, description, category, location, capacity, day] = data[i];
                const start = new Date(Date.now() + Number(day) * 86400000);
                start.setUTCHours(10, 0, 0, 0);
                const end = new Date(start.getTime() - 6 * 3600000);
                const a = await create(i === 5 ? 'other-organizer' : 'organizer', { title: String(title), description: String(description), category: String(category), location: String(location), capacity: Number(capacity), starts_at: start.toISOString(), deadline: end.toISOString() });
                for (let j = 0; j < (i === 0 ? 17 : i === 4 ? 12 : i + 3); j++) {
                    const u = `seed-${i}-${j}`;
                    await db.query("insert into people values($1,$2,'student')", [u, `体验同学 ${j + 1}`]);
                    await db.query('insert into registrations(activity_id,user_id) values($1,$2)', [a.id, u]);
                }
            }
        } };
}
