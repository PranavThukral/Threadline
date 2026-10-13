import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { APICallError } from 'ai';
import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import {
  xaiReply,
  xaiAnalysis,
  createXaiModel,
  XAI_MODEL,
  XAI_PROMPT_VERSION,
  xaiReservation,
} from '../src/xai-provider.js';
import { RuntimeStore } from '../src/store.js';
import { TursoStore } from '../src/turso-store.js';
import { threads } from '../src/fixtures.js';
import { hashText } from '../src/domain.js';
import { createApp } from '../src/api.js';

afterEach(() => vi.unstubAllEnvs());
type Result = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type Part = Result['stream'] extends ReadableStream<infer T> ? T : never;
function streaming(text: string, fail?: unknown) {
  return new MockLanguageModelV4({
    provider: 'xai.responses',
    modelId: XAI_MODEL,
    doStream: async () => ({
      stream: new ReadableStream<Part>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          if (fail) controller.enqueue({ type: 'error', error: fail });
          else {
            controller.enqueue({ type: 'text-start', id: 'text' });
            controller.enqueue({ type: 'text-delta', id: 'text', delta: text.slice(0, 8) });
            controller.enqueue({ type: 'text-delta', id: 'text', delta: text.slice(8) });
            controller.enqueue({ type: 'text-end', id: 'text' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 1000, noCache: 500, cacheRead: 500, cacheWrite: 0 },
                outputTokens: { total: 200, text: 200, reasoning: 0 },
              },
            });
          }
          controller.close();
        },
      }),
    }),
  });
}
describe('Direct xAI integration', () => {
  it('streams only text, uses current notes, disables storage/reasoning and accounts for cached input', async () => {
    const model = streaming('Hi Taylor, I prefer phone. Alex');
    const deltas: string[] = [];
    const facts = ['I prefer phone.'];
    const result = await xaiReply(
      model,
      threads[0],
      'answer',
      facts,
      new AbortController().signal,
      async (text) => {
        deltas.push(text);
      },
    );
    expect(deltas).toHaveLength(2);
    expect(deltas.join('')).toBe(result.text);
    const call = model.doStreamCalls[0];
    expect(call.providerOptions?.xai).toEqual({
      reasoningEffort: 'none',
      store: false,
      serviceTier: 'default',
    });
    expect(call.maxOutputTokens).toBe(2000);
    expect(JSON.stringify(call.prompt)).toContain('I prefer phone.');
    expect(result.usage.cost).toBe(0.001225);
    expect(xaiReservation(threads[0], 'answer', facts)).toBeGreaterThan(result.usage.cost);
  });
  it('keeps source citations and Grok metadata separate from OpenRouter cached results', async () => {
    const mail = threads[0],
      message = mail.messages.at(-1)!;
    const quote = [{ messageId: message.id, quote: message.body.slice(0, 80) }];
    const model = streaming(
      JSON.stringify({
        summary: [{ text: 'A response is requested.', quotes: quote }],
        actions: [],
        questions: [],
        commitments: [],
        decisions: [],
        dates: [],
        response: { state: 'unclear', reason: 'Review the request.', quotes: [] },
        followUp: { state: 'not_needed', reason: 'Review first.', ownerId: null, quotes: [] },
        warnings: [],
      }),
    );
    const result = await xaiAnalysis(model, mail, new AbortController().signal);
    expect(result.extraction.promptVersion).toBe(XAI_PROMPT_VERSION);
    expect(result.extraction.modelConfigHash).toBe(hashText(`${XAI_MODEL}:none:standard`));
    expect(result.evidence[0].quote).toBe(message.body.slice(0, 80));
    expect(result.extraction.validationStatus).toBe('valid');
  });
  it('does not retry or replace a rejected paid request with a default draft', async () => {
    const model = streaming(
      '',
      new APICallError({
        message: 'No API credit',
        url: 'https://api.x.ai/v1/responses',
        requestBodyValues: {},
        statusCode: 402,
      }),
    );
    const deltas = vi.fn();
    await expect(
      xaiReply(
        model,
        threads[0],
        'answer',
        ['I prefer phone.'],
        new AbortController().signal,
        deltas,
      ),
    ).rejects.toThrow('XAI_CREDIT_LIMIT');
    expect(model.doStreamCalls).toHaveLength(1);
    expect(deltas).not.toHaveBeenCalled();
  });
  it('refuses a model change and missing API credentials rather than choosing another paid model', () => {
    vi.stubEnv('AI_PROVIDER', 'xai');
    vi.stubEnv('XAI_API_KEY', '');
    expect(createXaiModel()).toBeNull();
    vi.stubEnv('XAI_API_KEY', 'local-test-only');
    vi.stubEnv('XAI_MODEL', 'grok-latest');
    expect(() => createXaiModel()).toThrow('UNSUPPORTED_XAI_MODEL');
  });
  it('reports its configured model and budgets through bootstrap, and settles token costs', async () => {
    const db = new RuntimeStore(':memory:');
    const app = await createApp({
      store: db,
      xai: streaming('Hi Taylor, I prefer phone. Alex'),
      live: true,
      logger: false,
    });
    try {
      const bootstrap = (await app.inject('/api/v1/bootstrap')).json();
      expect(bootstrap).toMatchObject({
        provider: 'xai',
        modelSnapshot: XAI_MODEL,
        liveEnabled: true,
        limits: { dailyBudgetUSD: 0.25, totalBudgetUSD: 4 },
      });
      const cookie = String(
        (await app.inject({ method: 'POST', url: '/api/v1/session', payload: {} })).headers[
          'set-cookie'
        ],
      ).split(';')[0];
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/threads/${threads[0].id}/replies`,
        headers: { cookie, 'idempotency-key': randomUUID() },
        payload: {
          threadVersion: threads[0].version,
          mode: 'live',
          intent: 'answer',
          facts: ['I prefer phone.'],
        },
      });
      expect(response.body).toContain('event: draft.completed');
      expect(db.db.prepare('SELECT amount,pending FROM costs').get()).toMatchObject({
        amount: 0.001225,
        pending: 0,
      });
    } finally {
      await app.close();
    }
  });
});
describe.each(['native', 'shared'] as const)('Paid budget guard (%s)', (kind) => {
  it('reserves concurrent spend, releases unused reservation, and keeps total spend after pruning old runs', async () => {
    const store =
      kind === 'native'
        ? new RuntimeStore(':memory:')
        : new TursoStore(createClient({ url: ':memory:' }));
    if (store instanceof TursoStore) await store.initialize();
    const run = () => ({
      id: randomUUID(),
      session: randomUUID(),
      key: randomUUID(),
      hash: 'h',
      kind: 'reply',
      thread: threads[0].id,
      version: threads[0].version,
      mode: 'live',
    });
    try {
      const first = run(),
        second = run();
      expect(await store.begin(first, 0.2, true, 250, 0.25, 4)).toBeNull();
      expect(await store.begin(second, 0.1, true, 250, 0.25, 4)).toBe('GLOBAL_BUDGET');
      await store.finish(first.id, 'completed', null, 0.01);
      expect(await store.begin(second, 0.1, true, 250, 0.25, 4)).toBeNull();
      await store.finish(second.id, 'completed', null, 0.02);
      if (store instanceof RuntimeStore)
        store.db.prepare("INSERT INTO costs VALUES ('old','old','2000-01-01',3.95,0)").run();
      else await store.db.execute("INSERT INTO costs VALUES ('old','old','2000-01-01',3.95,0)");
      await store.prune();
      await store.prune();
      expect(await store.begin(run(), 0.03, true, 250, 0.25, 4)).toBe('GLOBAL_TOTAL_BUDGET');
      expect(await store.retryAfter('GLOBAL_TOTAL_BUDGET', 'unused')).toBeNull();
      expect(await store.begin(run(), 0, false, 250, 0.25, 4)).toBeNull();
      expect(await store.begin(run(), 0.01, true, 250, 0.25, 4)).toBeNull();
    } finally {
      store.close();
    }
  });
});
