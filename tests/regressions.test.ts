import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RuntimeStore } from '../src/store.js';
import { StreamDecoder } from '../src/transport.js';
import {
  businessFollowUp,
  formatDate,
  recipientFor,
  lintDraft,
  deadlineOverdue,
  scenarioInstant,
} from '../src/workflow.js';
import { sourceEnvelope, liveAnalysis, liveReply } from '../src/provider.js';
import { validateExtraction } from '../src/domain.js';
import { threads, recordedExtractions, recordedEvidence, appendScenario } from '../src/fixtures.js';
import { createApp } from '../src/api.js';
import OpenAI from 'openai';
import { createServer } from 'node:http';

const thread = threads[0];
const stores: RuntimeStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
const store = () => {
  const value = new RuntimeStore(':memory:');
  stores.push(value);
  return value;
};
const run = (session = 'one', mode = 'live') => ({
  id: randomUUID(),
  session,
  key: randomUUID(),
  hash: 'abc',
  kind: 'analyze',
  thread: thread.id,
  version: thread.version,
  mode,
});
const expected = { threadId: thread.id, threadVersion: thread.version, mode: 'recorded' as const };
const runId = randomUUID();
const frame = (sequence: number, type: string, overrides: Record<string, unknown> = {}) =>
  `event: ${type}\ndata: ${JSON.stringify({ protocolVersion: 1, runId, ...expected, sequence, payload: {}, ...overrides })}\n\n`;

describe('Stream protocol regressions', () => {
  it('handles UTF-8-independent chunk boundaries, CRLF, comments and multiline data', () => {
    const events: string[] = [];
    const parser = new StreamDecoder(expected, (e) => events.push(e.type));
    const data = `: heartbeat\r\n\r\n${frame(1, 'run.started').replaceAll('\n', '\r\n')}${frame(2, 'run.cancelled')}`;
    for (const char of data) parser.feed(char);
    parser.finish();
    expect(events).toEqual(['run.started', 'run.cancelled']);
  });
  it.each([
    ['sequence gap', frame(3, 'run.cancelled')],
    ['cross-thread', frame(2, 'run.cancelled', { threadId: 'other' })],
    ['cross-mode', frame(2, 'run.cancelled', { mode: 'live' })],
    ['cross-run', frame(2, 'run.cancelled', { runId: randomUUID() })],
    ['invalid delta', frame(2, 'draft.delta')],
    ['unknown event', frame(2, 'mystery')],
  ])('rejects %s', (_name, bad) => {
    const parser = new StreamDecoder(expected, () => {});
    parser.feed(frame(1, 'run.started'));
    expect(() => parser.feed(bad)).toThrow();
  });
  it('rejects EOF without a terminal instead of leaving a spinner', () => {
    const p = new StreamDecoder(expected, () => {});
    p.feed(frame(1, 'run.started'));
    expect(() => p.finish()).toThrow('STREAM_INTERRUPTED');
  });
  it('rejects duplicate terminal and oversized data', () => {
    const p = new StreamDecoder(expected, () => {});
    p.feed(frame(1, 'run.started') + frame(2, 'run.cancelled'));
    expect(() => p.feed(frame(3, 'run.failed'))).toThrow();
    expect(() => new StreamDecoder(expected, () => {}).feed('x'.repeat(256001))).toThrow();
  });
});
describe('Durable admission and recovery', () => {
  it('enforces two session calls and four global live calls', () => {
    const db = store();
    for (let i = 0; i < 2; i++) expect(db.begin(run(), 0.1)).toBeNull();
    expect(db.begin(run(), 0.1)).toBe('SESSION_CONCURRENCY');
    for (let i = 0; i < 2; i++) expect(db.begin(run('two'), 0.1)).toBeNull();
    expect(db.begin(run('three'), 0.1)).toBe('GLOBAL_CONCURRENCY');
  });
  it('reserves the full daily allowance before requests start and releases known usage', () => {
    const db = store(),
      a = run();
    expect(db.begin(a, 4.9)).toBeNull();
    expect(db.begin(run('two'), 0.2)).toBe('GLOBAL_BUDGET');
    db.finish(a.id, 'completed', null, 0.01);
    expect(db.begin(run('two'), 0.2)).toBeNull();
  });
  it('retains unknown costs and limits twelve hourly and twenty-four daily provider attempts', () => {
    const db = store();
    for (let i = 0; i < 24; i++) {
      if (i === 12) {
        expect(db.begin(run(), 0.1)).toBe('SESSION_HOURLY_ATTEMPTS');
        db.db.prepare('UPDATE runs SET started=?').run(Date.now() - 3600001);
      }
      const a = run();
      expect(db.begin(a, 0.1)).toBeNull();
      db.finish(a.id, 'cancelled', 'CANCELLED');
    }
    db.db.prepare('UPDATE runs SET started=?').run(Date.now() - 3600001);
    expect(db.begin(run(), 0.1)).toBe('SESSION_ATTEMPTS');
    expect(
      (db.db.prepare('SELECT sum(amount) AS n FROM costs').get() as { n: number }).n,
    ).toBeCloseTo(2.4);
    expect(db.retryAfter('SESSION_ATTEMPTS', 'one')).toBeGreaterThan(0);
    expect(db.retryAfter('SESSION_ATTEMPTS', 'one')).toBeLessThanOrEqual(86400);
  });
  it('does not count cached live runs against the hourly provider allowance', () => {
    const db = store();
    for (let i = 0; i < 20; i++) {
      const cached = run();
      expect(db.begin(cached, 0, false)).toBeNull();
      db.finish(cached.id, 'completed', null);
    }
    for (let i = 0; i < 12; i++) {
      const fresh = run();
      expect(db.begin(fresh, 0, true)).toBeNull();
      db.finish(fresh.id, 'completed', null, 0);
    }
    expect(db.begin(run(), 0, true)).toBe('SESSION_HOURLY_ATTEMPTS');
    expect(db.retryAfter('SESSION_HOURLY_ATTEMPTS', 'one')).toBeGreaterThan(0);
    expect(db.retryAfter('SESSION_HOURLY_ATTEMPTS', 'one')).toBeLessThanOrEqual(3600);
  });
  it('survives restart without losing session, cache, budget or idempotency', () => {
    const dir = mkdtempSync(join(tmpdir(), 'threadline-test-'));
    const path = join(dir, 'db.sqlite');
    const first = new RuntimeStore(path),
      a = run();
    first.createSession('one', Date.now() + 60000);
    first.begin(a, 4.9);
    first.cache('key', { valid: true });
    const secret = first.secret();
    first.close();
    const second = new RuntimeStore(path);
    expect(second.secret()).toBe(secret);
    expect(second.session('one')).toBeTruthy();
    expect(second.prior(a.key)?.status).toBe('failed');
    expect(second.cached('key')?.value).toEqual({ valid: true });
    expect(second.begin(run('two'), 0.2)).toBe('GLOBAL_BUDGET');
    second.close();
    rmSync(dir, { recursive: true });
  });
  it('bounds metrics and rejects corrupt cached JSON', () => {
    const db = store();
    db.addMetrics(
      'one',
      Array.from({ length: 2050 }, () => ({ id: randomUUID() })),
    );
    expect((db.db.prepare('SELECT count(*) AS n FROM metrics').get() as { n: number }).n).toBe(200);
    for (let index = 0; index < 10; index++)
      db.addMetrics(
        `session-${index}`,
        Array.from({ length: 200 }, () => ({ id: randomUUID() })),
      );
    expect((db.db.prepare('SELECT count(*) AS n FROM metrics').get() as { n: number }).n).toBe(
      2000,
    );
    db.db.prepare('INSERT INTO cache VALUES (?, ?, ?)').run('bad', '{bad', Date.now());
    expect(db.cached('bad')).toBeNull();
  });
});
describe('Calendar, evidence and reply safety', () => {
  it('derives overdue only from a known timezone/date and preserves the scenario wall clock through DST', () => {
    const date = { precision: 'date', localDate: '2026-10-09', instantUtc: null };
    expect(deadlineOverdue(date, scenarioInstant(4), 'America/New_York')).toBe(false);
    expect(deadlineOverdue(date, scenarioInstant(5), 'America/New_York')).toBe(true);
    expect(deadlineOverdue(date, scenarioInstant(5), null)).toBeNull();
    expect(
      deadlineOverdue(
        { precision: 'unresolved', localDate: null, instantUtc: null },
        scenarioInstant(5),
        'America/New_York',
      ),
    ).toBeNull();
    expect(scenarioInstant(28)).toBe('2026-11-02T15:00:00.000Z');
  });
  it('keeps date-only values independent of the display timezone', () => {
    expect(formatDate('2026-10-09', 'Pacific/Kiritimati')).toBe('Oct 9');
    expect(formatDate('2026-10-09', 'Pacific/Honolulu')).toBe('Oct 9');
  });
  it('uses two business days at 9 AM New York, including DST', () => {
    expect(businessFollowUp(0)).toBe('2026-10-07T13:00:00.000Z');
    expect(businessFollowUp(4)).toBe('2026-10-13T13:00:00.000Z');
    expect(businessFollowUp(25)).toBe('2026-11-03T14:00:00.000Z');
  });
  it('addresses outbound follow-ups and excludes the viewer', () => {
    expect(recipientFor(threads.find((t) => t.id === 'waiting-on-reply')!)).toEqual(['p_maya']);
    expect(recipientFor(thread)).toEqual(['p_recruiter']);
    expect(
      recipientFor({ ...thread, messages: [{ ...thread.messages[0], senderId: null }] }),
    ).toEqual([]);
  });
  it('blocks unsupported promises and empty/unsafe drafts', () => {
    expect(lintDraft('I will send the report tomorrow.').length).toBeGreaterThan(0);
    expect(lintDraft('')).not.toEqual([]);
    expect(lintDraft('<script>alert(1)</script>')).not.toEqual([]);
  });
  it('rejects malformed nested extraction, fabricated owners, omitted evidence and invalid dates', () => {
    const valid = recordedExtractions.get(thread.id)!;
    const evidence = recordedEvidence(thread.id);
    expect(
      validateExtraction(thread, { ...valid, actions: [null] as never }, evidence).length,
    ).toBeGreaterThan(0);
    const bad = structuredClone(valid);
    bad.actions[0].owner.participantIds = ['invented'];
    expect(validateExtraction(thread, bad, evidence)).toContain(
      'owner references unknown participant',
    );
    bad.coverage.included = [];
    expect(validateExtraction(thread, bad, evidence).length).toBeGreaterThan(0);
  });
  it('bounds source using whole contiguous recent messages', () => {
    const source = sourceEnvelope(threads.find((t) => t.id === 'long-project-history')!);
    expect(source.coverage.mode).toBe('partial');
    expect(source.messages.at(-1)?.id).toBe('m_long_44');
    expect(JSON.stringify(source.messages).length).toBeLessThan(12100);
    expect(() =>
      sourceEnvelope({ ...thread, messages: [{ ...thread.messages[0], body: 'x'.repeat(14000) }] }),
    ).toThrow('SOURCE_TOO_LARGE');
  });
});
describe('Provider boundary without paid requests', () => {
  it('propagates a real HTTP disconnect through the SDK and releases the run', async () => {
    let received!: () => void;
    let closed!: () => void;
    const providerReceived = new Promise<void>((resolve) => {
      received = resolve;
    });
    const providerClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const provider = createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(
          `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Hi Taylor', sequence_number: 1 })}\n\n`,
        );
        response.on('close', closed);
        received();
      });
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    const providerPort = (provider.address() as { port: number }).port;
    const database = new RuntimeStore(':memory:');
    const app = await createApp({
      store: database,
      logger: false,
      live: true,
      inputRate: 1,
      outputRate: 5,
      client: new OpenAI({
        apiKey: 'local-test-only',
        baseURL: `http://127.0.0.1:${providerPort}`,
        maxRetries: 0,
      }),
    });
    const base = await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const initial = await fetch(`${base}/api/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const cookie = initial.headers.get('set-cookie')!.split(';')[0];
      const controller = new AbortController();
      const reply = await fetch(`${base}/api/v1/threads/${thread.id}/replies`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({
          threadVersion: thread.version,
          mode: 'live',
          intent: 'acknowledge',
          facts: [],
        }),
      });
      const reader = reply.body!.getReader();
      await reader.read();
      await providerReceived;
      controller.abort();
      await reader.cancel().catch(() => undefined);
      await Promise.race([
        providerClosed,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Provider did not abort')), 2000),
        ),
      ]);
      for (let attempt = 0; attempt < 50; attempt++) {
        const row = database.db.prepare('SELECT status FROM runs LIMIT 1').get() as {
          status: string;
        };
        if (row.status === 'cancelled') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(
        (database.db.prepare('SELECT status FROM runs LIMIT 1').get() as { status: string }).status,
      ).toBe('cancelled');
      expect(
        (
          database.db.prepare('SELECT pending, amount FROM costs LIMIT 1').get() as {
            pending: number;
            amount: number;
          }
        ).pending,
      ).toBe(0);
    } finally {
      await app.close();
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    }
  }, 10000);
  it('passes cancellation in SDK options and accepts a separate validated live result', async () => {
    const controller = new AbortController();
    const source = sourceEnvelope(thread);
    const extraction = structuredClone(recordedExtractions.get(thread.id)!);
    const {
      id: _id,
      threadId: _tid,
      threadVersion: _ver,
      source: _source,
      createdAt: _created,
      ...semantic
    } = extraction;
    const client = {
      responses: {
        create: async (body: Record<string, unknown>, options: { signal: AbortSignal }) => {
          expect(options.signal).toBe(controller.signal);
          expect(body.signal).toBeUndefined();
          expect(body.text).toBeTruthy();
          return {
            status: 'completed',
            output_text: JSON.stringify({
              extraction: { ...semantic, coverage: source.coverage },
              evidence: recordedEvidence(thread.id),
            }),
            usage: { input_tokens: 100, output_tokens: 100 },
          };
        },
      },
    } as unknown as OpenAI;
    const result = await liveAnalysis(client, thread, controller.signal);
    expect(result.extraction.source).toBe('live');
    expect(result.extraction.id).not.toBe(extraction.id);
  });
  it('uses true provider deltas and rejects incomplete streams', async () => {
    const client = {
      responses: {
        create: async () =>
          (async function* () {
            yield { type: 'response.output_text.delta', delta: 'Hello' };
            yield {
              type: 'response.completed',
              response: { usage: { input_tokens: 1, output_tokens: 1 } },
            };
          })(),
      },
    } as unknown as OpenAI;
    const deltas: string[] = [];
    const result = await liveReply(
      client,
      thread,
      'acknowledge',
      [],
      new AbortController().signal,
      async (text) => {
        deltas.push(text);
      },
    );
    expect(deltas).toEqual(['Hello']);
    expect(result.text).toBe('Hello');
    const incomplete = {
      responses: {
        create: async () =>
          (async function* () {
            yield { type: 'response.output_text.delta', delta: 'partial' };
          })(),
      },
    } as unknown as OpenAI;
    await expect(
      liveReply(
        incomplete,
        thread,
        'acknowledge',
        [],
        new AbortController().signal,
        async () => {},
      ),
    ).rejects.toThrow('DRAFT_INCOMPLETE');
  });
});
describe('API contract regressions', () => {
  it('deduplicates live analysis and replays validated cache without another provider charge', async () => {
    let release!: () => void,
      started!: () => void,
      calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const {
      id: _id,
      threadId: _threadId,
      threadVersion: _version,
      source: _source,
      createdAt: _created,
      ...semantic
    } = recordedExtractions.get(thread.id)!;
    const client = {
      responses: {
        create: async () => {
          calls++;
          started();
          await gate;
          return {
            status: 'completed',
            output_text: JSON.stringify({
              extraction: semantic,
              evidence: recordedEvidence(thread.id),
            }),
            usage: { input_tokens: 100, output_tokens: 100 },
          };
        },
      },
    } as unknown as OpenAI;
    const db = new RuntimeStore(':memory:');
    const app = await createApp({
      store: db,
      client,
      inputRate: 1,
      outputRate: 1,
      live: true,
      logger: false,
    });
    try {
      const session = await app.inject({ method: 'POST', url: '/api/v1/session', payload: {} });
      const cookie = String(session.headers['set-cookie']).split(';')[0];
      const analyze = () =>
        app.inject({
          method: 'POST',
          url: `/api/v1/threads/${thread.id}/analyze`,
          headers: { cookie, 'idempotency-key': randomUUID() },
          payload: { mode: 'live', threadVersion: thread.version },
        });
      const first = analyze();
      await entered;
      const duplicate = await analyze();
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe('ANALYSIS_IN_PROGRESS');
      release();
      expect((await first).body).toContain('analysis.completed');
      const hit = await analyze();
      expect(hit.body).toContain('"cacheLayer":"sqlite"');
      expect(hit.body).toContain('analysis.completed');
      expect(calls).toBe(1);
      expect((db.db.prepare('SELECT count(*) AS n FROM costs').get() as { n: number }).n).toBe(1);
    } finally {
      release();
      await app.close();
    }
  });
  it('limits session creation and ordinary API requests and sets HTTPS headers', async () => {
    const db = new RuntimeStore(':memory:');
    const app = await createApp({
      store: db,
      logger: false,
      live: false,
      origin: 'https://demo.example',
    });
    try {
      const session = await app.inject({ method: 'POST', url: '/api/v1/session', payload: {} });
      const cookie = String(session.headers['set-cookie']).split(';')[0];
      expect(session.headers['set-cookie']).toContain('Secure');
      expect(session.headers['strict-transport-security']).toContain('max-age=');
      for (let index = 0; index < 30; index++)
        expect((await app.inject({ url: '/api/v1/threads', headers: { cookie } })).statusCode).toBe(
          200,
        );
      const limited = await app.inject({ url: '/api/v1/threads', headers: { cookie } });
      expect(limited.statusCode).toBe(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      for (let index = 1; index < 60; index++)
        expect(db.createSession(randomUUID(), Date.now() + 86400000)).toBe(true);
      expect(db.createSession(randomUUID(), Date.now() + 86400000)).toBe(false);
    } finally {
      await app.close();
    }
  });
  it('versions an appended reply, changes the action, and isolates the scenario by session', async () => {
    const app = await createApp({
      store: new RuntimeStore(':memory:'),
      logger: false,
      live: false,
    });
    try {
      const session = await app.inject({ method: 'POST', url: '/api/v1/session', payload: {} });
      const cookie = String(session.headers['set-cookie']).split(';')[0];
      const waiting = threads.find((t) => t.id === 'waiting-on-reply')!;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/threads/${waiting.id}/append`,
        headers: { cookie },
        payload: { threadVersion: waiting.version, scenario: 'reply_received' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().thread.version).not.toBe(waiting.version);
      expect(response.json().extraction.actions[0].title).toBe('Finish the report');
      expect(
        validateExtraction(
          appendScenario.thread,
          appendScenario.extraction,
          appendScenario.evidence,
        ),
      ).toEqual([]);
      expect(
        (await app.inject({ url: `/api/v1/threads/${waiting.id}`, headers: { cookie } })).json()
          .thread.messages,
      ).toHaveLength(2);
      expect(
        (await app.inject(`/api/v1/threads/${waiting.id}`)).json().thread.messages,
      ).toHaveLength(1);
      const stale = await app.inject({
        method: 'POST',
        url: `/api/v1/threads/${waiting.id}/analyze`,
        headers: { cookie, 'idempotency-key': randomUUID() },
        payload: { threadVersion: waiting.version, mode: 'recorded' },
      });
      expect(stale.statusCode).toBe(409);
      await app.inject({ method: 'POST', url: '/api/v1/reset', headers: { cookie }, payload: {} });
      expect(
        (await app.inject({ url: `/api/v1/threads/${waiting.id}`, headers: { cookie } })).json()
          .thread.messages,
      ).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
  it('covers session reuse, signed cookies, origins, versions, strict bodies, safe errors and SSE headers', async () => {
    const app = await createApp({
      store: new RuntimeStore(':memory:'),
      logger: false,
      live: false,
    });
    try {
      const post = async (url: string, payload: unknown, headers: Record<string, string> = {}) =>
        app.inject({ method: 'POST', url, payload: payload as object, headers });
      const initial = await post('/api/v1/session', {});
      const cookie = String(initial.headers['set-cookie']).split(';')[0];
      const headers = { cookie, 'idempotency-key': randomUUID() };
      expect((await post('/api/v1/session', {}, { cookie })).headers['set-cookie']).toBeUndefined();
      expect(
        (await post('/api/v1/session', {}, { origin: 'https://foreign.example' })).statusCode,
      ).toBe(403);
      const path = `/api/v1/threads/${thread.id}/analyze`;
      const body = { mode: 'recorded', threadVersion: thread.version };
      expect((await post(path, body)).statusCode).toBe(401);
      expect((await post(path, { ...body, threadVersion: 'old' }, headers)).statusCode).toBe(409);
      expect((await post(path, { ...body, unexpected: true }, headers)).statusCode).toBe(400);
      expect((await post(path, { ...body, mode: 'live' }, headers)).statusCode).toBe(503);
      const good = await post(path, body, headers);
      expect(good.statusCode).toBe(200);
      expect(good.headers['x-content-type-options']).toBe('nosniff');
      expect(good.headers['content-type']).toContain('text/event-stream');
      expect(good.body).toContain('analysis.completed');
      expect((await post(path, body, headers)).statusCode).toBe(410);
      expect((await post(path, { ...body, mode: 'live' }, headers)).statusCode).toBe(503);
      expect((await app.inject('/api/no-such-route')).statusCode).toBe(404);
      expect((await app.inject('/readyz')).json().database).toBe(true);
      const reply = await post(
        `/api/v1/threads/${thread.id}/replies`,
        { ...body, intent: 'acknowledge', facts: [] },
        { ...headers, 'idempotency-key': randomUUID() },
      );
      const textEvents = reply.body
        .split('\n\n')
        .map((part) => part.match(/^data: (.+)$/m)?.[1])
        .filter(Boolean)
        .map((value) => JSON.parse(value!));
      expect(
        textEvents
          .filter((e) => e.payload.text && e.sequence > 1 && !e.payload.recipients)
          .map((e) => e.payload.text)
          .join(''),
      ).toBe(textEvents.at(-1).payload.text);
      expect(
        (
          await post(
            `/api/v1/threads/${thread.id}/replies`,
            { ...body, intent: 'answer', facts: [] },
            headers,
          )
        ).statusCode,
      ).toBe(422);
      expect(
        (
          await post(
            '/api/v1/metrics',
            { events: [{ operation: 'spam', durationMs: 'bad' }] },
            headers,
          )
        ).statusCode,
      ).toBe(400);
      const oversized = await app.inject({
        method: 'POST',
        url: path,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: JSON.stringify({ big: 'x'.repeat(33000) }),
      });
      expect(oversized.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });
});
