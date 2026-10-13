import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { OpenRouter } from '@openrouter/sdk';
import { createApp } from '../src/api.js';
import { RuntimeStore } from '../src/store.js';
import { createCustomMail, pendingBrief } from '../src/custom-mail.js';
import { threads } from '../src/fixtures.js';
import { validateExtraction, type Thread } from '../src/domain.js';
import { businessFollowUpFrom } from '../src/workflow.js';
import {
  createRouterClient,
  FREE_MODEL,
  groundedRouterBrief,
  routerAnalysis,
  routerReply,
  type RouterClient,
} from '../src/openrouter-provider.js';

afterEach(() => vi.unstubAllEnvs());
const input = {
  subject: 'Confirm the format',
  senderName: 'Casey Example',
  senderEmail: 'casey@example.com',
  body: 'Please confirm the video format. Can you attend by video?',
};
function brief(thread: Thread) {
  const quotes = [
    { messageId: thread.messages.at(-1)!.id, quote: thread.messages.at(-1)!.body.slice(0, 120) },
  ];
  return {
    summary: [{ text: 'A response is requested.', quotes }],
    actions: [{ title: 'Confirm the format', ownerId: 'p_alex', quotes }],
    questions: [],
    commitments: [],
    decisions: [],
    dates: [],
    response: { state: 'yes', reason: 'The sender asks for confirmation.', quotes },
    followUp: { state: 'not_needed', reason: 'Reply first.', ownerId: null, quotes: [] },
    warnings: [],
  };
}
function clientFor(text: string, finish = 'stop', cost = 0) {
  const send = vi.fn(async () =>
    (async function* () {
      yield {
        choices: [
          {
            delta: { reasoning: 'PRIVATE REASONING', content: text.slice(0, 7) },
            finishReason: null,
          },
        ],
      };
      yield {
        choices: [{ delta: { content: text.slice(7) }, finishReason: finish }],
        usage: {
          promptTokens: 30,
          completionTokens: 20,
          completionTokensDetails: { reasoningTokens: 10 },
          cost,
        },
      };
    })(),
  );
  return { client: { chat: { send } } as unknown as RouterClient, send };
}
describe('OpenRouter grounding and streaming', () => {
  it('computes exact offsets and identity itself and rejects fabricated quotes and owners', () => {
    const mail = createCustomMail(input),
      body = brief(mail);
    const result = groundedRouterBrief(mail, JSON.stringify(body));
    expect(validateExtraction(mail, result.extraction, result.evidence)).toEqual([]);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].start).toBe(0);
    expect(result.extraction.actions[0].owner.kind).toBe('viewer');
    expect(result.extraction.source).toBe('live');
    const fakeQuote = structuredClone(body);
    fakeQuote.actions[0].quotes[0].quote = 'A request that was never sent';
    expect(() => groundedRouterBrief(mail, JSON.stringify(fakeQuote))).toThrow(
      'INVALID_EXTRACTION',
    );
    const fakeOwner = structuredClone(body);
    fakeOwner.actions[0].ownerId = 'unknown-person';
    expect(() => groundedRouterBrief(mail, JSON.stringify(fakeOwner))).toThrow(
      'INVALID_EXTRACTION',
    );
    const missingCitation = structuredClone(body);
    missingCitation.response.quotes = [];
    missingCitation.actions = [];
    expect(() => groundedRouterBrief(mail, JSON.stringify(missingCitation))).toThrow(
      'INVALID_EXTRACTION',
    );
  });
  it('resolves reply need from a grounded current viewer request, without treating quoted or outbound requests as new obligations', () => {
    const mail = createCustomMail(input),
      value = brief(mail);
    const confused = {
      ...value,
      response: { state: 'unclear', reason: 'No reply yet.', quotes: [] },
    };
    const resolved = groundedRouterBrief(mail, JSON.stringify(confused));
    expect(resolved.extraction.response.state).toBe('yes');
    expect(resolved.extraction.response.evidenceIds.length).toBeGreaterThan(0);
    const outbound = { ...mail, messages: [{ ...mail.messages[0], senderId: 'p_alex' }] };
    expect(groundedRouterBrief(outbound, JSON.stringify(confused)).extraction.response.state).toBe(
      'unclear',
    );
    const quoted = {
      ...mail,
      messages: [{ ...mail.messages[0], body: `> ${mail.messages[0].body}` }],
    };
    expect(groundedRouterBrief(quoted, JSON.stringify(confused)).extraction.response.state).toBe(
      'unclear',
    );
  });
  it('does not turn an incoming viewer request into a reminder for its sender, but preserves a separate pending commitment', () => {
    const mail = createCustomMail({
      ...input,
      body: `${input.body}\nI will send the meeting details tomorrow.`,
    });
    const wire = {
      ...brief(mail),
      followUp: {
        state: 'recommended',
        reason: 'Waiting on sender.',
        ownerId: mail.messages[0].senderId,
        quotes: brief(mail).response.quotes,
      },
    };
    expect(groundedRouterBrief(mail, JSON.stringify(wire)).extraction.followUp.state).toBe(
      'not_needed',
    );
    const waitingOnSelf = { ...wire, followUp: { ...wire.followUp, ownerId: 'p_alex' } };
    expect(groundedRouterBrief(mail, JSON.stringify(waitingOnSelf)).extraction.followUp.state).toBe(
      'not_needed',
    );
    const priorRequestMail = {
      ...mail,
      messages: [
        {
          ...mail.messages[0],
          id: 'earlier-outgoing',
          senderId: 'p_alex',
          to: [mail.messages[0].senderId!],
          body: 'Could you send the meeting details?',
          order: 0,
        },
        { ...mail.messages[0], order: 1 },
      ],
    };
    const priorWaiting = {
      ...wire,
      followUp: {
        ...wire.followUp,
        quotes: [{ messageId: 'earlier-outgoing', quote: 'Could you send the meeting details?' }],
      },
    };
    expect(
      groundedRouterBrief(priorRequestMail, JSON.stringify(priorWaiting)).extraction.followUp.state,
    ).toBe('recommended');
    const withPromise = {
      ...wire,
      commitments: [
        {
          text: 'Send the meeting details',
          ownerId: mail.messages[0].senderId,
          quotes: [
            { messageId: mail.messages[0].id, quote: 'I will send the meeting details tomorrow.' },
          ],
        },
      ],
    };
    expect(groundedRouterBrief(mail, JSON.stringify(withPromise)).extraction.followUp.state).toBe(
      'recommended',
    );
  });
  it('distinguishes a recipient’s open request in an outbound mail from a response the viewer needs to send', () => {
    const mail = threads.find((item) => item.id === 'waiting-on-reply')!;
    const confused = brief(mail);
    confused.actions[0].ownerId = 'p_maya';
    confused.actions[0].title = 'Confirm the revised numbers';
    const normalized = groundedRouterBrief(mail, JSON.stringify(confused));
    expect(normalized.extraction.response.state).toBe('no');
    expect(normalized.extraction.response.evidenceIds.length).toBeGreaterThan(0);
    const waitingOnly = {
      ...confused,
      actions: [],
      followUp: {
        state: 'recommended',
        reason: 'Awaiting Maya.',
        ownerId: 'p_maya',
        quotes: confused.response.quotes,
      },
    };
    expect(groundedRouterBrief(mail, JSON.stringify(waitingOnly)).extraction.response.state).toBe(
      'no',
    );
    const quoted = {
      ...mail,
      messages: [{ ...mail.messages[0], body: `> ${mail.messages[0].body}` }],
    };
    expect(groundedRouterBrief(quoted, JSON.stringify(confused)).extraction.response.state).toBe(
      'yes',
    );
    expect(groundedRouterBrief(quoted, JSON.stringify(waitingOnly)).extraction.response.state).toBe(
      'yes',
    );
  });
  it('pins the free model and zero price ceiling; forwards cancellation and excludes reasoning from displayed text', async () => {
    const { client, send } = clientFor(JSON.stringify(brief(threads[0])));
    const controller = new AbortController();
    const analyzed = await routerAnalysis(client, threads[0], controller.signal);
    expect(analyzed.extraction.response.state).toBe('yes');
    const [body, options] = send.mock.calls[0] as unknown as [
      { chatRequest: Record<string, unknown> },
      { signal: AbortSignal },
    ];
    expect(body.chatRequest.model).toBe(FREE_MODEL);
    expect(body.chatRequest.reasoning).toEqual({ effort: 'none' });
    const source = JSON.stringify(body.chatRequest.messages);
    expect(source).not.toContain('taylor@talent.example');
    expect(source).not.toContain(threads[0].version);
    expect(body.chatRequest.provider).toEqual({
      sort: 'latency',
      maxPrice: { prompt: '0', completion: '0', request: '0' },
    });
    expect(options.signal).toBe(controller.signal);
    const replyClient = clientFor('Hi Casey, I prefer video.\nAlex');
    const deltas: string[] = [];
    const reply = await routerReply(
      replyClient.client,
      threads[0],
      'answer',
      ['I prefer video.'],
      controller.signal,
      async (delta) => {
        deltas.push(delta);
      },
    );
    expect(deltas.join('')).toBe(reply.text);
    expect(reply.text).not.toContain('PRIVATE REASONING');
    expect(reply.usage).toEqual({
      input_tokens: 30,
      output_tokens: 20,
      reasoning_tokens: 10,
      cost: 0,
    });
    await expect(
      routerReply(
        clientFor('partial', 'length').client,
        threads[0],
        'acknowledge',
        [],
        controller.signal,
        async () => {},
      ),
    ).rejects.toThrow('DRAFT_INCOMPLETE');
    await expect(
      routerReply(
        clientFor('Unexpected paid result', 'stop', 0.1).client,
        threads[0],
        'acknowledge',
        [],
        controller.signal,
        async () => {},
      ),
    ).rejects.toThrow('FREE_MODEL_REQUIRED');
  });
  it('refuses paid model configuration and starts without a catalog network dependency', async () => {
    vi.stubEnv('AI_PROVIDER', 'openrouter');
    vi.stubEnv('OPENROUTER_API_KEY', 'local-test-only');
    vi.stubEnv('OPENROUTER_MODEL', 'a-paid-model');
    await expect(createRouterClient()).rejects.toThrow('FREE_MODEL_REQUIRED');
    vi.stubEnv('OPENROUTER_MODEL', FREE_MODEL);
    expect(await createRouterClient()).toBeInstanceOf(OpenRouter);
  });
  it('aborts a real SDK HTTP stream when the caller cancels', async () => {
    let received!: () => void, closed!: () => void;
    const entered = new Promise<void>((resolve) => {
      received = resolve;
    });
    const disconnected = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const server = createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(
          `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', model: FREE_MODEL, created: 1, choices: [{ index: 0, delta: { content: 'Hi Casey' }, finish_reason: null }] })}\n\n`,
        );
        response.on('close', closed);
        received();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const controller = new AbortController();
      const sdk = new OpenRouter({
        apiKey: 'local-test-only',
        serverURL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        retryConfig: { strategy: 'none' },
      });
      const call = routerReply(
        sdk,
        threads[0],
        'acknowledge',
        [],
        controller.signal,
        async () => {},
      );
      const rejected = expect(call).rejects.toThrow();
      await entered;
      controller.abort();
      await rejected;
      await Promise.race([
        disconnected,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SDK failed to disconnect')), 2000),
        ),
      ]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10000);
});
describe('User mail privacy and free-call accounting', () => {
  it('isolates added mail by signed session, caches only in memory, and settles real free usage at zero', async () => {
    const db = new RuntimeStore(':memory:');
    let calls = 0;
    const router = {
      chat: {
        send: async (request: { chatRequest: { messages: Array<{ content: string }> } }) => {
          calls++;
          const source = JSON.parse(request.chatRequest.messages[1].content);
          const mail = { ...threads[0], messages: source.messages };
          return clientFor(JSON.stringify(brief(mail))).client.chat.send({} as never);
        },
      },
    } as unknown as RouterClient;
    const app = await createApp({ store: db, openrouter: router, live: true, logger: false });
    try {
      const session = async () =>
        String(
          (await app.inject({ method: 'POST', url: '/api/v1/session', payload: {} })).headers[
            'set-cookie'
          ],
        ).split(';')[0];
      const cookie = await session(),
        other = await session();
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/threads', payload: input })).statusCode,
      ).toBe(401);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/threads',
        headers: { cookie },
        payload: input,
      });
      expect(created.statusCode).toBe(201);
      const mail = created.json().thread as Thread;
      expect(
        validateExtraction(mail, pendingBrief(mail).extraction, pendingBrief(mail).evidence),
      ).toEqual([]);
      expect(
        (await app.inject({ url: `/api/v1/threads/${mail.id}`, headers: { cookie: other } }))
          .statusCode,
      ).toBe(404);
      expect((await app.inject({ url: `/api/v1/threads/${mail.id}` })).statusCode).toBe(404);
      const analyze = () =>
        app.inject({
          method: 'POST',
          url: `/api/v1/threads/${mail.id}/analyze`,
          headers: { cookie, 'idempotency-key': randomUUID() },
          payload: { threadVersion: mail.version, mode: 'live' },
        });
      expect((await analyze()).body).toContain('analysis.completed');
      expect((await analyze()).body).toContain('"cacheLayer":"memory"');
      expect(calls).toBe(1);
      expect(db.db.prepare('SELECT amount,pending FROM costs').all()).toEqual([
        expect.objectContaining({ amount: 0, pending: 0 }),
      ]);
      expect(db.db.prepare('SELECT * FROM cache').all()).toHaveLength(0);
      expect(
        (await app.inject({ url: '/api/v1/threads', headers: { cookie } })).json().threads[0]
          .responseState,
      ).toBe('yes');
      expect(
        (await app.inject({ url: '/api/v1/threads', headers: { cookie: other } }))
          .json()
          .threads.some((row: Thread) => row.id === mail.id),
      ).toBe(false);
      await app.inject({ method: 'POST', url: '/api/v1/reset', headers: { cookie }, payload: {} });
      expect(
        (await app.inject({ url: `/api/v1/threads/${mail.id}`, headers: { cookie } })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
  it('limits provider attempts even when the tariff is zero', () => {
    const db = new RuntimeStore(':memory:');
    try {
      const next = (session: string) => ({
        id: randomUUID(),
        session,
        key: randomUUID(),
        hash: 'h',
        kind: 'analyze',
        thread: threads[0].id,
        version: threads[0].version,
        mode: 'live',
      });
      for (let index = 0; index < 3; index++) {
        const run = next(`session-${index}`);
        expect(db.begin(run, 0, true, 3)).toBeNull();
        db.finish(run.id, 'completed', null, 0);
      }
      expect(db.begin(next('next-session'), 0, true, 3)).toBe('GLOBAL_ATTEMPTS');
      expect(db.begin(next('cache-reader'), 0, false, 3)).toBeNull();
    } finally {
      db.close();
    }
  });
  it('uses the actual New York date for user mail reminders, across weekends and DST', () => {
    expect(businessFollowUpFrom('2026-10-12T15:00:00Z')).toBe('2026-10-14T13:00:00.000Z');
    expect(businessFollowUpFrom('2026-10-31T02:00:00Z')).toBe('2026-11-03T14:00:00.000Z');
  });
});
