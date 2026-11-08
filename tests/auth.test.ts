import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/lib/service.ts';
import { hashPassword, verifyPassword } from '../src/lib/auth.ts';
test('passwords use distinct salted hashes and reject incorrect values', async () => {
    const a = await hashPassword('learning-test-password'), b = await hashPassword('learning-test-password');
    assert.notEqual(a, b);
    assert.ok(!a.includes('learning-test-password'));
    assert.equal(await verifyPassword('learning-test-password', a), true);
    assert.equal(await verifyPassword('incorrect-password', a), false);
    assert.equal(await verifyPassword('anything', 'malformed'), false);
});
test('accounts and server sessions', async () => {
    const s = await createService();
    try {
        const a = await s.auth.signUp({ name: '测试同学', email: ' STUDENT@example.test ', password: 'learning-test-password' });
        assert.equal(a.user.role, 'student');
        assert.equal(a.user.email, 'student@example.test');
        assert.ok(!JSON.stringify(a.user).includes('password'));
        assert.equal((await s.auth.session(a.token))?.id, a.user.id);
        assert.equal(await s.auth.session('forged-token'), null);
        await assert.rejects(s.auth.signUp({ name: '重复', email: 'student@example.test', password: 'learning-test-password' }), /已注册/);
        await assert.rejects(s.auth.signIn('student@example.test', 'wrong-password'), /邮箱或密码/);
        const b = await s.auth.signIn('student@example.test', 'learning-test-password');
        assert.notEqual(a.token, b.token);
        await s.auth.signOut(b.token);
        assert.equal(await s.auth.session(b.token), null);
        const now = Date.now;
        try {
            Date.now = () => now() + 9 * 3600000;
            assert.equal(await s.auth.session(a.token), null);
        }
        finally {
            Date.now = now;
        }
        await assert.rejects(s.create(a.user.id, { title: '不完整活动' } as never), /标题/);
        await assert.rejects(s.auth.signUp({ name: '', email: 'bad', password: 'short' }));
        await assert.rejects(s.auth.signUp({name:'错误邮箱',email:'a@b@c.example',password:'learning-test-password'}));
    }
    finally {
        await s.close();
    }
});
test('account mode ignores spoofed demo identity headers', async () => {
    const { requestUser, Unauthorized } = await import('../src/lib/request-user.ts');
    const forged = new Request('http://localhost/api/activities', { headers: { 'x-demo-user': 'organizer' } });
    await assert.rejects(requestUser(forged, 'accounts', { session: async () => null }), Unauthorized);
    const signed = new Request('http://localhost/api/activities', { headers: { 'x-demo-user': 'organizer', cookie: 'campus_session=valid' } });
    assert.equal(await requestUser(signed, 'accounts', { session: async () => ({ id: 'real-student', name: '测试', role: 'student', email: 'a@example.test' }) }), 'real-student');
    assert.equal(await requestUser(forged, 'demo', { session: async () => null }), 'organizer');
});
test('repeated incorrect passwords are throttled for the account in this process', async () => {
    const s = await createService();
    try {
        await s.auth.signUp({ name: '限流验证', email: 'throttle@example.test', password: 'learning-test-password' });
        for (let i = 0; i < 5; i++)
            await assert.rejects(s.auth.signIn('throttle@example.test', 'wrong-password'), /邮箱或密码/);
        await assert.rejects(s.auth.signIn('throttle@example.test', 'learning-test-password'), /15 分钟/);
    }
    finally {
        await s.close();
    }
});
