import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { TursoStore } from '../src/turso-store.js';
import { createApp } from '../src/api.js';
import { threads } from '../src/fixtures.js';
import type { RouterClient } from '../src/openrouter-provider.js';

const stores: TursoStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
async function shared() {
  // Both app instances see the same SQL database. The manual network check uses
  // two separate cloud connections; CI needs no credentials or filesystem locks.
  const db = createClient({ url: ':memory:' });
  const first = new TursoStore(db),
    second = new TursoStore(db);
  stores.push(first, second);
  await first.initialize();
  return { first, second };
}
const run = (session = 'one') => ({
  id: randomUUID(),
  session,
  key: randomUUID(),
  hash: 'h',
  kind: 'analyze',
  thread: threads[0].id,
  version: threads[0].version,
  mode: 'live',
});

describe('Shared runtime storage', () => {
  it('preserves active runs and session secrets when a second function starts', async () => {
    const { first, second } = await shared(),
      request = run();
    await first.createSession('one', Date.now() + 86400000);
    const secret = await first.secret();
    expect(await first.begin(request, 0, true)).toBeNull();
    await second.initialize();
    expect(await second.secret()).toBe(secret);
    expect((await second.run(request.id, 'one'))?.status).toBe('running');
    expect(await second.begin(run('other'), 0, true)).toBe('ANALYSIS_CONCURRENCY');
    expect(await second.begin({ ...run(), kind: 'reply' }, 0, true)).toBeNull();
    expect(await first.begin({ ...run(), kind: 'reply' }, 0, true)).toBe('SESSION_CONCURRENCY');
  });
  it('charges only provider attempts, shares limits, and recovers expired leases', async () => {
    const { first, second } = await shared();
    await second.initialize();
    for (let i = 0; i < 14; i++) {
      const cached = run();
      expect(await first.begin(cached, 0, false)).toBeNull();
      await first.finish(cached.id, 'completed', null);
    }
    for (let i = 0; i < 12; i++) {
      const fresh = run();
      expect(await second.begin(fresh, 0, true)).toBeNull();
      await second.finish(fresh.id, 'completed', null, 0);
    }
    expect(await first.begin(run(), 0, true)).toBe('SESSION_HOURLY_ATTEMPTS');
    expect(await second.retryAfter('SESSION_HOURLY_ATTEMPTS', 'one')).toBeGreaterThan(0);
    expect(await second.begin(run('other'), 0, true, 12)).toBe('GLOBAL_ATTEMPTS');
    const abandoned = run('other');
    expect(await first.begin(abandoned, 0, false)).toBeNull();
    await first.db.execute({
      sql: 'UPDATE runs SET started=? WHERE id=?',
      args: [Date.now() - 120001, abandoned.id],
    });
    await second.prune();
    expect((await first.run(abandoned.id, 'other'))?.error).toBe('RUN_EXPIRED');
  });
  it('keeps added mail available across app instances while isolating and resetting visits', async () => {
    const { first, second } = await shared();
    await second.initialize();
    const a = await createApp({ store: first, live: false, logger: false }),
      b = await createApp({ store: second, live: false, logger: false });
    try {
      const start = await a.inject({ method: 'POST', url: '/api/v1/session', payload: {} });
      const cookie = String(start.headers['set-cookie']).split(';')[0];
      const added = await a.inject({
        method: 'POST',
        url: '/api/v1/threads',
        headers: { cookie },
        payload: {
          senderName: 'Casey Example',
          senderEmail: 'casey@example.com',
          subject: 'Format',
          body: 'Could you confirm video or phone?',
        },
      });
      expect(added.statusCode).toBe(201);
      const mail = added.json().thread;
      expect(
        (await b.inject({ url: `/api/v1/threads/${mail.id}`, headers: { cookie } })).json().thread
          .id,
      ).toBe(mail.id);
      expect((await b.inject({ url: `/api/v1/threads/${mail.id}` })).statusCode).toBe(404);
      expect(
        (await b.inject({ url: '/api/v1/threads', headers: { cookie } })).json().threads[0].id,
      ).toBe(mail.id);
      await b.inject({ method: 'POST', url: '/api/v1/reset', headers: { cookie }, payload: {} });
      expect(
        (await a.inject({ url: `/api/v1/threads/${mail.id}`, headers: { cookie } })).statusCode,
      ).toBe(404);
    } finally {
      await a.close();
      await b.close();
      stores.splice(stores.indexOf(first), 1);
      stores.splice(stores.indexOf(second), 1);
    }
  });
  it('returns a retry time at the hourly limit without calling the model', async () => {
    const { first } = await shared();
    const send = vi.fn();
    const app = await createApp({
      store: first,
      live: true,
      logger: false,
      openrouter: { chat: { send } } as unknown as RouterClient,
    });
    try {
      const start = await app.inject({ method: 'POST', url: '/api/v1/session', payload: {} });
      const cookie = String(start.headers['set-cookie']).split(';')[0];
      const session = String((await first.db.execute('SELECT id FROM sessions')).rows[0].id);
      for (let i = 0; i < 12; i++) {
        const request = run(session);
        await first.begin(request, 0, true);
        await first.finish(request.id, 'completed', null, 0);
      }
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/threads/${threads[0].id}/replies`,
        headers: { cookie, 'Idempotency-Key': randomUUID() },
        payload: {
          threadVersion: threads[0].version,
          mode: 'live',
          intent: 'acknowledge',
          facts: [],
        },
      });
      expect(response.statusCode).toBe(429);
      expect(response.json().error).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
      expect(response.json().error.message).toContain('12 live requests');
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await app.close();
      stores.splice(stores.indexOf(first), 1);
    }
  });
});
