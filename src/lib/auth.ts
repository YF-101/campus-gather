import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
export type AccountUser = {
    id: string;
    name: string;
    role: 'student' | 'organizer';
    email: string;
};
const derive = (value: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(value, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
export async function hashPassword(value: string) { const salt = randomBytes(16).toString('hex'); return `scrypt$32768$${salt}$${(await derive(value, salt)).toString('hex')}`; }
export async function verifyPassword(value: string, encoded: string) { if (!/^scrypt\$32768\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded))
    return false; const parts = encoded.split('$'); return timingSafeEqual(await derive(value, parts[2]), Buffer.from(parts[3], 'hex')); }
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const authSchema = `
create table if not exists accounts(user_id text primary key references people(id),email text not null unique,password_hash text not null);
create table if not exists sessions(token_hash text primary key,user_id text not null references accounts(user_id),expires_at timestamptz not null);
create index if not exists sessions_user on sessions(user_id);
`;
export function createAuth(db: PGlite, serialize: <T>(fn: () => Promise<T>) => Promise<T>) {
    const failures = new Map<string, {
        count: number;
        until: number;
    }>();
    async function issue(user: AccountUser) { const token = randomBytes(32).toString('hex'); await db.query('delete from sessions where expires_at<$1', [new Date(Date.now()).toISOString()]); await db.query('insert into sessions values($1,$2,$3)', [digest(token), user.id, new Date(Date.now() + 8 * 3600000).toISOString()]); return { user, token }; }
    return {
        async signUp(input: {
            name: string;
            email: string;
            password: string;
        }) {
            if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 24 || typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 128)
                throw Error('请填写昵称、有效邮箱和 10–128 位密码');
            const email = input.email.trim().toLowerCase(), user: AccountUser = { id: randomUUID(), name: input.name.trim(), email, role: 'student' };
            const hash = await hashPassword(input.password);
            await serialize(() => db.transaction(async (tx) => { if ((await tx.query('select user_id from accounts where email=$1', [email])).rows.length)
                throw Error('该邮箱已注册，请直接登录'); await tx.query("insert into people values($1,$2,'student')", [user.id, user.name]); await tx.query('insert into accounts values($1,$2,$3)', [user.id, email, hash]); }));
            return issue(user);
        },
        async signIn(value: string, password: string) {
            if (typeof value !== 'string' || typeof password !== 'string' || value.length > 254 || password.length > 128)
                throw Error('邮箱或密码不正确');
            const email = value.trim().toLowerCase();
            const limit = failures.get(email);
            if (limit && limit.until > Date.now() && limit.count >= 5)
                throw Error('尝试次数较多，请 15 分钟后重试');
            const row = (await db.query<AccountUser & {
                password_hash: string;
            }>('select p.id,p.name,p.role,a.email,a.password_hash from accounts a join people p on p.id=a.user_id where a.email=$1', [email])).rows[0];
            const valid = await verifyPassword(password, row?.password_hash || `scrypt$32768$${'0'.repeat(32)}$${'0'.repeat(128)}`);
            if (!row || !valid) {
                if (failures.size > 1000)
                    failures.clear();
                failures.set(email, { count: limit && limit.until > Date.now() ? limit.count + 1 : 1, until: limit && limit.until > Date.now() ? limit.until : Date.now() + 15 * 60000 });
                throw Error('邮箱或密码不正确');
            }
            failures.delete(email);
            const { password_hash: _, ...user } = row;
            return issue(user);
        },
        async session(token: string): Promise<AccountUser | null> {
            if (!/^[a-f0-9]{64}$/.test(token))
                return null;
            const row = (await db.query<AccountUser & {
                expires_at: string;
            }>('select p.id,p.name,p.role,a.email,s.expires_at from sessions s join accounts a on a.user_id=s.user_id join people p on p.id=s.user_id where s.token_hash=$1', [digest(token)])).rows[0];
            if (!row || Date.parse(row.expires_at) <= Date.now())
                return null;
            const { expires_at: _, ...user } = row;
            return user;
        },
        async signOut(token: string) { if (token)
            await db.query('delete from sessions where token_hash=$1', [digest(token)]); },
    };
}
