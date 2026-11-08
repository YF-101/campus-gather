import { actors } from './model.ts';
import type { AccountUser } from './auth.ts';
export class Unauthorized extends Error {
    constructor() { super('请先登录账号'); }
}
export function sessionToken(request: Request) { return (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith('campus_session='))?.slice('campus_session='.length) || ''; }
export async function requestUser(request: Request, mode: string | undefined, auth: {
    session: (token: string) => Promise<AccountUser | null>;
}) {
    if (mode === 'accounts') {
        const user = await auth.session(sessionToken(request));
        if (!user)
            throw new Unauthorized();
        return user.id;
    }
    const id = request.headers.get('x-demo-user') || '';
    if (!actors.some(a => a.id === id))
        throw Error('演示身份无效');
    return id;
}
