import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/lib/service.ts';
const future = '2099-11-20T10:00:00+08:00', deadline = '2099-11-19T10:00:00+08:00';
const input = { title: '一起学习数据库', description: '带上电脑，一起完成小练习。', location: '创新楼 301', category: '技术', starts_at: future, deadline, capacity: 1 };
test('activity registration and organizer rules', async (t) => {
    const s = await createService();
    try {
        const activity = await s.create('organizer', input);
        await t.test('student cannot publish, other organizer cannot manage', async () => {
            await assert.rejects(s.create('student', input), /组织者/);
            await assert.rejects(s.attendees('other-organizer', activity.id), /权限/);
        });
        await t.test('concurrent final-seat requests produce exactly one successful registration', async () => {
            const results = await Promise.allSettled([s.register('student', activity.id), s.register('friend', activity.id)]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            const rows = await s.attendees('organizer', activity.id);
            assert.equal(rows.length, 1);
            const winner = rows[0].user_id;
            await assert.rejects(s.register(winner, activity.id), /已经报名/);
            await s.cancel(winner, activity.id);
            await s.register('friend', activity.id);
        });
        await t.test('check-in requires organizer ownership and is idempotent', async () => {
            await assert.rejects(s.checkIn('other-organizer', activity.id, 'friend'), /权限/);
            await s.checkIn('organizer', activity.id, 'friend');
            await s.checkIn('organizer', activity.id, 'friend');
            assert.ok((await s.attendees('organizer', activity.id))[0].checked_in_at);
            await assert.rejects(s.cancel('friend', activity.id), /签到/);
        });
        await t.test('closed and unknown events reject registration; invalid dates and capacity reject publishing', async () => {
            const closed = await s.create('organizer', { ...input, starts_at: '2020-11-20T10:00:00+08:00', deadline: '2020-11-19T10:00:00+08:00' }).catch(() => null);
            assert.equal(closed, null);
            await assert.rejects(s.register('student', 'missing'), /不存在/);
            await assert.rejects(s.create('organizer', { ...input, capacity: 0 }), /名额/);
            await assert.rejects(s.create('organizer', { ...input, deadline: '2099-11-21T10:00:00+08:00' }), /截止/);
        });
        await t.test('registration after deadline is rejected even when the page previously showed availability', async () => {
            const a = await s.create('organizer', { ...input, title: '截止边界验证' });
            const now = Date.now;
            try {
                Date.now = () => Date.parse(deadline) + 60000;
                await assert.rejects(s.register('student', a.id), /截止/);
            }
            finally {
                Date.now = now;
            }
        });
        await t.test('users only see their own registrations and organizer lists only owned activities', async () => {
            assert.equal((await s.mine('student')).length, 0);
            assert.equal((await s.mine('friend')).length, 1);
            assert.equal((await s.list('other-organizer', true)).length, 0);
            await assert.rejects(s.mine('unknown'), /身份/);
        });
    }
    finally {
        await s.close();
    }
});
test('same-origin validation uses the received Host when Next canonicalizes the internal URL', async () => {
    const { sameOrigin } = await import('../src/lib/http.ts');
    assert.equal(sameOrigin(new Request('http://localhost:3010/api/activities', { headers: { host: '127.0.0.1:3010', origin: 'http://127.0.0.1:3010' } })), true);
    assert.equal(sameOrigin(new Request('http://localhost:3010/api/activities', { headers: { host: '127.0.0.1:3010', origin: 'https://evil.example' } })), false);
});
