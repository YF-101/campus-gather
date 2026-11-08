import { database } from '@/lib/database';
import { sameOrigin } from '@/lib/http';
import { sessionToken } from '@/lib/request-user';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function reply(data: unknown, status = 200, cookie?: string) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } }); }
export async function GET(req: Request) { if (process.env.CAMPUS_MODE !== 'accounts')
    return reply({ mode: 'demo', user: null }); return reply({ mode: 'accounts', user: await (await database()).auth.session(sessionToken(req)) }); }
export async function POST(req: Request) {
    if (process.env.CAMPUS_MODE !== 'accounts')
        return reply({ error: '当前是模拟身份演示，请打开独立账号版本。' }, 400);
    if (!sameOrigin(req))
        return reply({ error: '请求来源无效' }, 403);
    try {
        const s = await database(), body = await req.json();
        const attributes = `Path=/; HttpOnly; SameSite=Lax${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
        if (body.action === 'logout') {
            await s.auth.signOut(sessionToken(req));
            return reply({ ok: true }, 200, `campus_session=; ${attributes}; Max-Age=0`);
        }
        if (body.action !== 'login' && body.action !== 'register')
            return reply({ error: '操作无效' }, 400);
        const result = body.action === 'register' ? await s.auth.signUp(body) : await s.auth.signIn(body.email, body.password);
        return reply({ user: result.user }, 200, `campus_session=${result.token}; ${attributes}; Max-Age=28800`);
    }
    catch (e) {
        return reply({ error: e instanceof Error ? e.message : '操作失败，请稍后重试' }, 400);
    }
}
