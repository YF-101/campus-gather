import { database } from '@/lib/database';
import { sameOrigin } from '@/lib/http';
import { requestUser, Unauthorized } from '@/lib/request-user';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
    try {
        const s = await database();
        const uid = await requestUser(req, process.env.CAMPUS_MODE, s.auth);
        const url = new URL(req.url);
        const id = url.searchParams.get('attendees');
        return Response.json({ data: id ? await s.attendees(uid, id) : await s.list(uid, url.searchParams.get('own') === '1') }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : '加载失败' }, { status: e instanceof Unauthorized ? 401 : 400 });
    }
}
export async function POST(req: Request) {
    try {
        if (!sameOrigin(req))
            return Response.json({ error: '请求来源无效' }, { status: 403 });
        const s = await database();
        const uid = await requestUser(req, process.env.CAMPUS_MODE, s.auth);
        const data = await req.json();
        let result;
        switch (data.action) {
            case 'create':
                result = await s.create(uid, data.input);
                break;
            case 'cancel_activity':
                await s.cancelEvent(uid,data.id,data.input?.reason);
                break;
            case 'register':
                await s.register(uid, data.id);
                break;
            case 'cancel':
                await s.cancel(uid, data.id);
                break;
            case 'checkin':
                await s.checkIn(uid, data.id, data.user);
                break;
            default: throw Error('操作无效');
        }
        return Response.json({ data: result || { ok: true } });
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : '操作失败' }, { status: e instanceof Unauthorized ? 401 : 400 });
    }
}
