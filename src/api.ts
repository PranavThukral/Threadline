import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import OpenAI from 'openai';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { recordedEvidence, recordedExtractions, threads, appendScenario } from './fixtures.js';
import {
  validateExtraction,
  viewer,
  type Extraction,
  type Evidence,
  type Thread,
} from './domain.js';
import {
  analyzeRequestSchema,
  replyRequestSchema,
  metricSchema,
  extractionSchema,
} from './contracts.js';
import { recipientFor, lintDraft, recordedDraft } from './workflow.js';
import { RuntimeStore } from './store.js';
import { TursoStore } from './turso-store.js';
import {
  createRouterClient,
  routerModel,
  routerAnalysis,
  routerReply,
  ROUTER_PROMPT_VERSION,
  type RouterClient,
} from './openrouter-provider.js';
import { createCustomMail, newMailSchema, pendingBrief } from './custom-mail.js';
import {
  liveAnalysis,
  liveReply,
  model,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  sourceEnvelope,
  MAX_OUTPUT,
  type ProviderUsage,
} from './provider.js';

type AppOptions = {
  store?: RuntimeStore | TursoStore;
  client?: OpenAI;
  openrouter?: RouterClient;
  live?: boolean;
  inputRate?: number;
  outputRate?: number;
  origin?: string;
  logger?: boolean;
  serveStatic?: boolean;
};
export async function createApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 32 * 1024,
    forceCloseConnections: true,
  });
  if (process.env.VERCEL && !options.store && !process.env.TURSO_DATABASE_URL)
    throw new Error('TURSO_NOT_CONFIGURED');
  const store =
    options.store ??
    (process.env.TURSO_DATABASE_URL
      ? await TursoStore.connect()
      : new RuntimeStore(
          process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'threadline.sqlite'),
        ));
  const origin =
    options.origin ??
    process.env.APP_ORIGIN ??
    ((process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL}`
      : 'http://localhost:3000');
  const allowed = new Set([
    origin,
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173'] : []),
  ]);
  const secret = process.env.SESSION_SECRET?.trim() || (await store.secret());
  const client =
    options.client ??
    (process.env.AI_PROVIDER !== 'openrouter' && process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 45000 })
      : null);
  const router = options.openrouter ?? (options.client ? null : await createRouterClient());
  const configuredModel = router ? routerModel() : model();
  const inputRate = router
    ? 0
    : (options.inputRate ?? Number(process.env.OPENAI_INPUT_USD_PER_MILLION));
  const outputRate = router
    ? 0
    : (options.outputRate ?? Number(process.env.OPENAI_OUTPUT_USD_PER_MILLION));
  const pricingReady = [inputRate, outputRate].every(
    (rate) => Number.isFinite(rate) && rate > 0 && rate <= 1000,
  );
  const liveEnabled =
    (options.live ?? process.env.LIVE_AI_ENABLED === 'true') &&
    Boolean(router || (client && pricingReady));
  const publicDir = join(process.cwd(), 'dist', 'web');
  const active = new Map<string, AbortController>();
  const pendingAnalyses = new Set<string>();
  const customMails = new Map<string, { session: string; thread: Thread; expires: number }>();
  const privateCache = new Map<
    string,
    { extraction: Extraction; evidence: Evidence[]; created: number }
  >();
  const settled = new Map<string, Promise<void>>();
  const cleanup = setInterval(async () => {
    try {
      await store.prune();
      for (const [id, entry] of customMails) if (entry.expires < Date.now()) customMails.delete(id);
      for (const [id, entry] of privateCache)
        if (Date.now() - entry.created > 3600000) privateCache.delete(id);
    } catch {
      app.log.error('Database cleanup failed');
    }
  }, 3600000);
  cleanup.unref();
  const requestWindows = new Map<string, { started: number; count: number }>();
  await app.register(cors, { origin: [...allowed], credentials: true });
  if (options.serveStatic !== false && existsSync(publicDir)) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, { root: publicDir, wildcard: false });
  }
  const error = (
    reply: FastifyReply,
    request: FastifyRequest,
    status: number,
    code: string,
    message: string,
    retryable = false,
  ) => reply.code(status).send({ error: { code, message, retryable }, requestId: request.id });
  app.addHook('onRequest', async (request, reply) => {
    reply.headers({
      'X-Request-Id': request.id,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'",
    });
    if (origin.startsWith('https://'))
      reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (
      request.method === 'POST' &&
      ((request.headers.origin && !allowed.has(request.headers.origin)) ||
        request.headers['sec-fetch-site'] === 'cross-site')
    )
      return error(reply, request, 403, 'ORIGIN_REJECTED', 'Origin is not allowed.');
    if (request.url.startsWith('/api/')) {
      const current = await session(request);
      if (current) {
        const now = Date.now();
        for (const [id, window] of requestWindows)
          if (now - window.started >= 60000) requestWindows.delete(id);
        const window = requestWindows.get(current.id) ?? { started: now, count: 0 };
        window.count += 1;
        requestWindows.set(current.id, window);
        if (window.count > 30) {
          reply.header('Retry-After', Math.ceil((60000 - now + window.started) / 1000));
          return error(
            reply,
            request,
            429,
            'RATE_LIMITED',
            'Pause briefly before making more requests.',
            true,
          );
        }
      }
    }
  });
  app.setErrorHandler((caught, request, reply) => {
    const status = (caught as { statusCode?: number }).statusCode;
    if (status === 413)
      return error(reply, request, 413, 'PAYLOAD_TOO_LARGE', 'Request exceeds 32 KiB.');
    if (status === 415)
      return error(reply, request, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
    if (status === 400)
      return error(reply, request, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
    request.log.error({ code: (caught as Error).name }, 'Request failed');
    return error(
      reply,
      request,
      500,
      'INTERNAL_ERROR',
      'The request could not be completed.',
      true,
    );
  });
  const sign = (id: string, expires: number) =>
    `${id}.${expires}.${createHmac('sha256', secret).update(`${id}.${expires}`).digest('hex')}`;
  const sessionLookups = new WeakMap<
    FastifyRequest,
    Promise<{ id: string; expires: number } | null>
  >();
  const session = async (request: FastifyRequest) => {
    if (sessionLookups.has(request)) return sessionLookups.get(request)!;
    const cookie = request.headers.cookie
      ?.split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('threadline_session='))
      ?.slice('threadline_session='.length);
    if (!cookie) return null;
    const parts = cookie.split('.');
    if (parts.length !== 3 || !/^[a-f0-9]{64}$/.test(parts[2])) return null;
    const [id, expiry, signature] = parts;
    const expires = Number(expiry);
    if (!Number.isFinite(expires) || expires <= Date.now()) return null;
    const expected = sign(id, expires).split('.')[2];
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const lookup = Promise.resolve(store.session(id)).then((value) => value ?? null);
    sessionLookups.set(request, lookup);
    return lookup;
  };
  const requireSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const value = await session(request);
    if (!value)
      error(reply, request, 401, 'SESSION_REQUIRED', 'Refresh to create a local session.');
    return value;
  };
  app.post('/api/v1/session', async (request, reply) => {
    if (!z.strictObject({}).safeParse(request.body).success)
      return error(reply, request, 400, 'INVALID_INPUT', 'Session body must be an empty object.');
    const current = await session(request);
    if (current)
      return {
        expiresAt: current.expires,
        limits: { maxLiveAttempts: 24, maxLiveHourlyAttempts: 12, maxActiveCalls: 2 },
      };
    const id = randomUUID(),
      expires = Date.now() + 86400000;
    if (!(await store.createSession(id, expires)))
      return error(
        reply,
        request,
        429,
        'RATE_LIMITED',
        'The demo has reached its session capacity.',
        true,
      );
    reply.header(
      'Set-Cookie',
      `threadline_session=${sign(id, expires)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin.startsWith('https:') ? '; Secure' : ''}`,
    );
    return {
      expiresAt: expires,
      limits: { maxLiveAttempts: 24, maxLiveHourlyAttempts: 12, maxActiveCalls: 2 },
    };
  });
  app.get('/healthz', async () => ({
    status: 'ok',
    buildSha: process.env.BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  }));
  app.get('/readyz', async (_request, reply) => {
    try {
      await store.ready();
      return { status: 'ready', database: true, liveEnabled };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: false, liveEnabled: false });
    }
  });
  app.get('/api/v1/bootstrap', async () => ({
    viewer,
    scenarioClockBase: '2026-10-05T10:00:00-04:00',
    userTimezoneDefault: 'America/New_York',
    modelSnapshot: configuredModel,
    provider: router ? 'openrouter' : 'openai',
    liveEnabled,
    disabledReason: liveEnabled
      ? null
      : 'Live AI is unavailable. Check the server key and free model availability; example mails remain usable.',
    limits: { maxMessages: 80, maxLiveAttempts: 24, maxLiveHourlyAttempts: 12 },
    fixtureManifestVersion: '2026-10-06.2',
  }));
  const currentThread = async (request: FastifyRequest, thread: (typeof threads)[number]) => {
    const current = await session(request);
    return current &&
      thread.id === appendScenario.thread.id &&
      (await store.scenario(current.id, thread.id)) === appendScenario.thread.version
      ? appendScenario.thread
      : thread;
  };
  app.get('/api/v1/threads', async (request) => {
    const current = await session(request);
    const added: { session: string; thread: Thread; expires: number }[] =
      store instanceof TursoStore
        ? current
          ? await store.mails(current.id)
          : []
        : Array.from(customMails.values()).filter(
            (entry) => entry.session === current?.id && entry.expires > Date.now(),
          );
    const source = await Promise.all(
      [...added.map((entry) => entry.thread), ...threads].map((t) => currentThread(request, t)),
    );
    return {
      threads: await Promise.all(
        source.map(async (t) => ({
          id: t.id,
          version: t.version,
          subject: t.subject,
          latestSender: t.latestSender,
          messageCount: t.messages.length,
          preview: t.preview,
          category: t.category,
          responseState: ((await cachedAnalysis(t)) ?? recorded(t)).extraction.response.state,
        })),
      ),
      fixtureManifestVersion: '2026-10-06.2',
    };
  });
  const threadFor = async (request: FastifyRequest) => {
    const id = (request.params as { id: string }).id;
    if (store instanceof TursoStore && id.startsWith('mail-')) {
      const current = await session(request);
      return current ? (await store.mail(id, current.id))?.thread : undefined;
    }
    const custom = customMails.get(id);
    if (custom)
      return custom.session === (await session(request))?.id && custom.expires > Date.now()
        ? custom.thread
        : undefined;
    const thread = threads.find((t) => t.id === id);
    return thread ? currentThread(request, thread) : undefined;
  };
  const recorded = (thread: (typeof threads)[number]) => {
    if (thread.id.startsWith('mail-')) return pendingBrief(thread);
    if (thread.version === appendScenario.thread.version) return appendScenario;
    const extraction = recordedExtractions.get(thread.id)!;
    const evidence = recordedEvidence(thread.id);
    if (validateExtraction(thread, extraction, evidence).length)
      throw new Error('INVALID_RECORDING');
    return { extraction, evidence };
  };
  const cacheKey = (thread: (typeof threads)[number]) =>
    createHmac('sha256', secret)
      .update(
        [
          thread.id,
          thread.version,
          'live',
          SCHEMA_VERSION,
          router ? ROUTER_PROMPT_VERSION : PROMPT_VERSION,
          'normalizer.v1',
          configuredModel,
        ].join(':'),
      )
      .digest('hex');
  const cachedAnalysis = async (thread: (typeof threads)[number]) => {
    const key = cacheKey(thread),
      row = thread.id.startsWith('mail-')
        ? store instanceof TursoStore
          ? await store.cachedPrivate(key)
          : (() => {
              const cached = privateCache.get(key);
              return cached && Date.now() - cached.created < 3600000
                ? {
                    value: { extraction: cached.extraction, evidence: cached.evidence },
                    created: cached.created,
                  }
                : null;
            })()
        : await store.cached(key);
    const value = row?.value as { extraction: Extraction; evidence: Evidence[] } | undefined;
    try {
      if (
        value &&
        extractionSchema.safeParse(value.extraction).success &&
        Array.isArray(value.evidence) &&
        !validateExtraction(thread, value.extraction, value.evidence).length &&
        value.extraction.source === 'live'
      )
        return {
          ...value,
          cache: {
            layer:
              thread.id.startsWith('mail-') && !(store instanceof TursoStore) ? 'memory' : 'sqlite',
            fresh: true,
            ageMs: Date.now() - row!.created,
          },
        };
    } catch {
      /* Corrupt results are evicted. */
    }
    if (row) {
      if (thread.id.startsWith('mail-')) {
        if (store instanceof TursoStore) await store.deletePrivateCache(key);
        else privateCache.delete(key);
      } else await store.deleteCache(key);
    }
    return null;
  };
  app.get('/api/v1/threads/:id', async (request, reply) => {
    const thread = await threadFor(request);
    if (!thread) return error(reply, request, 404, 'NOT_FOUND', 'Thread not found.');
    const tag = `"${thread.version}"`;
    reply.header('ETag', tag);
    if (request.headers['if-none-match'] === tag) return reply.code(304).send();
    return { thread, evidence: recorded(thread).evidence };
  });
  app.post('/api/v1/threads/:id/append', async (request, reply) => {
    const current = await requireSession(request, reply);
    if (!current) return;
    const thread = await threadFor(request);
    const body = z
      .strictObject({ threadVersion: z.string(), scenario: z.literal('reply_received') })
      .safeParse(request.body);
    if (!thread || thread.id !== appendScenario.thread.id)
      return error(reply, request, 404, 'NOT_FOUND', 'This thread has no append scenario.');
    if (!body.success)
      return error(reply, request, 400, 'INVALID_INPUT', 'Choose the supported reply scenario.');
    if (
      body.data.threadVersion !== thread.version ||
      thread.version === appendScenario.thread.version
    )
      return error(
        reply,
        request,
        409,
        'VERSION_CONFLICT',
        'The scenario has already changed. Refresh the thread.',
      );
    await store.append(current.id, thread.id, appendScenario.thread.version);
    return appendScenario;
  });
  app.post('/api/v1/threads', async (request, reply) => {
    const current = await requireSession(request, reply);
    if (!current) return;
    const parsed = newMailSchema.safeParse(request.body);
    if (!parsed.success)
      return error(
        reply,
        request,
        400,
        'INVALID_INPUT',
        'Supply a sender, valid email address, subject and mail text (up to 10,000 characters).',
      );
    if (parsed.data.senderEmail.toLowerCase() === viewer.email?.toLowerCase())
      return error(
        reply,
        request,
        422,
        'INVALID_SENDER',
        'Choose the sender of the incoming mail.',
      );
    for (const [id, entry] of customMails) if (entry.expires < Date.now()) customMails.delete(id);
    if (
      customMails.size >= 200 ||
      Array.from(customMails.values()).filter((entry) => entry.session === current.id).length >= 10
    )
      return error(
        reply,
        request,
        429,
        'MAIL_LIMIT',
        'This preview can hold up to ten added mails per visit.',
      );
    const thread = createCustomMail(parsed.data);
    const entry = { session: current.id, thread, expires: current.expires };
    if (store instanceof TursoStore) {
      if (!(await store.addMail(entry)))
        return error(
          reply,
          request,
          429,
          'MAIL_LIMIT',
          'This preview can hold up to ten added mails per visit.',
        );
    } else customMails.set(thread.id, entry);
    return reply.code(201).send({ thread });
  });
  app.post('/api/v1/reset', async (request, reply) => {
    const current = await requireSession(request, reply);
    if (!current) return;
    if (!z.strictObject({}).safeParse(request.body).success)
      return error(reply, request, 400, 'INVALID_INPUT', 'Reset body must be empty.');
    await store.resetScenarios(current.id);
    if (store instanceof TursoStore) await store.resetMails(current.id);
    for (const [id, entry] of customMails)
      if (entry.session === current.id) {
        privateCache.delete(cacheKey(entry.thread));
        customMails.delete(id);
      }
    return { reset: true };
  });
  app.get('/api/v1/threads/:id/intelligence', async (request, reply) => {
    const thread = await threadFor(request);
    if (!thread) return error(reply, request, 404, 'NOT_FOUND', 'Thread not found.');
    const query = z
      .strictObject({
        version: z.string().optional(),
        source: z.enum(['recorded', 'live']).default('recorded'),
      })
      .safeParse(request.query);
    if (!query.success)
      return error(reply, request, 400, 'INVALID_INPUT', 'Invalid intelligence query.');
    if (query.data.version && query.data.version !== thread.version)
      return error(
        reply,
        request,
        409,
        'VERSION_CONFLICT',
        'This thread changed. Refresh the brief.',
      );
    if (query.data.source === 'recorded')
      return {
        state: 'ready',
        ...recorded(thread),
        cache: { layer: 'recorded_bundle', fresh: true, ageMs: 0 },
      };
    const cached = await cachedAnalysis(thread);
    if (cached) return { state: 'ready', ...cached };
    return {
      state: 'missing',
      extraction: null,
      evidence: [],
      cache: { layer: 'none', fresh: false, ageMs: null },
    };
  });
  const handleRun = async (
    kind: 'analyze' | 'reply',
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const thread = await threadFor(request);
    if (!thread) return error(reply, request, 404, 'NOT_FOUND', 'Thread not found.');
    const current = await requireSession(request, reply);
    if (!current) return;
    const parsed = (kind === 'analyze' ? analyzeRequestSchema : replyRequestSchema).safeParse(
      request.body,
    );
    if (!parsed.success)
      return error(
        reply,
        request,
        400,
        'INVALID_INPUT',
        'Invalid request. Supply the current version, mode, and supported draft facts.',
      );
    const body = parsed.data,
      mode = body.mode;
    if (body.threadVersion !== thread.version)
      return error(
        reply,
        request,
        409,
        'VERSION_CONFLICT',
        'This thread changed. Refresh before continuing.',
      );
    if (mode === 'live' && !liveEnabled)
      return error(
        reply,
        request,
        503,
        'LIVE_DISABLED',
        'Live AI is unavailable. Use recorded mode.',
      );
    const replyBody = kind === 'reply' ? replyRequestSchema.parse(body) : null;
    if (replyBody && !recipientFor(thread).length)
      return error(
        reply,
        request,
        422,
        'RECIPIENT_UNAVAILABLE',
        'Sender identity is incomplete. Review the source before drafting.',
      );
    if (replyBody && replyBody.intent === 'answer' && !replyBody.facts.length)
      return error(
        reply,
        request,
        422,
        'FACTS_REQUIRED',
        'Add your facts before generating an answer.',
      );
    if (replyBody && replyBody.intent !== 'answer' && replyBody.facts.length)
      return error(
        reply,
        request,
        400,
        'INVALID_INPUT',
        'Facts are only used for the answer intent.',
      );
    if (replyBody && mode === 'recorded' && replyBody.facts.length)
      return error(
        reply,
        request,
        422,
        'RECORDED_FACTS_UNSUPPORTED',
        'Recorded mode cannot generate custom facts. Edit the acknowledgment directly, or enable live drafting.',
      );
    const rawKey = request.headers['idempotency-key'];
    if (typeof rawKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(rawKey))
      return error(reply, request, 400, 'INVALID_INPUT', 'A valid Idempotency-Key is required.');
    const key = `${current.id}:${kind}:${rawKey}`,
      hash = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    const prior = await store.prior(key);
    if (prior)
      return error(
        reply,
        request,
        prior.hash !== hash || prior.status === 'running' ? 409 : 410,
        prior.hash !== hash
          ? 'IDEMPOTENCY_CONFLICT'
          : prior.status === 'running'
            ? 'RUN_IN_PROGRESS'
            : 'RESULT_NOT_REPLAYABLE',
        'This request has already been accepted. Start a new run to regenerate.',
      );
    const analysisKey = kind === 'analyze' && mode === 'live' ? cacheKey(thread) : null;
    const cached = analysisKey ? await cachedAnalysis(thread) : null;
    if (analysisKey && !cached && pendingAnalyses.has(analysisKey)) {
      reply.header('Retry-After', '2');
      return error(
        reply,
        request,
        409,
        'ANALYSIS_IN_PROGRESS',
        'This source is already being analyzed. Keep the existing brief and retry shortly.',
        true,
      );
    }
    let maxCost = 0;
    if (mode === 'live' && !cached) {
      try {
        sourceEnvelope(thread);
      } catch {
        return error(
          reply,
          request,
          422,
          'SOURCE_TOO_LARGE',
          'The latest message exceeds the source budget.',
        );
      }
      // Reserve the specification's conservative input allowance, rounded
      // upward to micro-dollars. Provider requests are separately capped at 96 KiB.
      maxCost = router
        ? 0
        : Math.ceil(100000 * inputRate + (kind === 'reply' ? 500 : MAX_OUTPUT) * outputRate) / 1e6;
    }
    if (active.size >= 30)
      return error(
        reply,
        request,
        429,
        'RATE_LIMITED',
        'The demo has reached its stream capacity.',
        true,
      );
    const runId = randomUUID();
    const admission = await store.begin(
      {
        id: runId,
        session: current.id,
        key,
        hash,
        kind,
        thread: thread.id,
        version: thread.version,
        mode,
      },
      maxCost,
      mode === 'live' && !cached,
      router ? 40 : 250,
    );
    if (admission) {
      const retrySeconds = await store.retryAfter(admission, current.id);
      if (retrySeconds) reply.header('Retry-After', retrySeconds);
      const retryMinutes = retrySeconds ? Math.max(1, Math.ceil(retrySeconds / 60)) : null;
      const message = admission.includes('CONCURRENCY')
        ? 'Too many active runs. Try again after they finish.'
        : admission === 'SESSION_HOURLY_ATTEMPTS'
          ? `This browser has used its 12 live requests for the hour. Try again in about ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`
          : admission === 'SESSION_ATTEMPTS'
            ? `This browser has used its 24 live requests for today. The allowance resets in about ${retryMinutes} minutes.`
            : admission === 'GLOBAL_ATTEMPTS'
              ? `The shared free-model allowance is used for today. It resets in about ${retryMinutes} minutes.`
              : admission === 'GLOBAL_BUDGET'
                ? `The shared spending ceiling is reached for today. It resets in about ${retryMinutes} minutes.`
                : 'This browser has reached its session request limit.';
      return error(
        reply,
        request,
        429,
        admission.includes('CONCURRENCY') || admission === 'SESSION_HOURLY_ATTEMPTS'
          ? 'RATE_LIMITED'
          : 'BUDGET_EXHAUSTED',
        message,
        admission !== 'SESSION_RUN_LIMIT',
      );
    }
    const controller = new AbortController();
    if (analysisKey && !cached) pendingAnalyses.add(analysisKey);
    active.set(runId, controller);
    let resolveRun!: () => void;
    settled.set(
      runId,
      new Promise<void>((resolve) => {
        resolveRun = resolve;
      }),
    );
    let timedOut = false;
    const deadline = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      router ? 90000 : 45000,
    );
    let finished = false,
      sequence = 0,
      status = 'completed',
      errorCode: string | null = null,
      actualCost: number | undefined;
    const started = performance.now();
    reply.raw.on('close', () => {
      if (!finished) controller.abort();
    });
    for (const [name, value] of Object.entries(reply.getHeaders()))
      if (value !== undefined) reply.raw.setHeader(name, value);
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-store, no-transform');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();
    const emit = async (type: string, payload: Record<string, unknown>) => {
      controller.signal.throwIfAborted();
      const frame = `id: ${runId}:${sequence + 1}\nevent: ${type}\ndata: ${JSON.stringify({ protocolVersion: 1, runId, threadId: thread.id, threadVersion: thread.version, mode, sequence: ++sequence, payload })}\n\n`;
      if (!reply.raw.write(frame)) await once(reply.raw, 'drain', { signal: controller.signal });
    };
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed && !controller.signal.aborted) reply.raw.write(': heartbeat\n\n');
    }, 10000);
    const charge = (usage: ProviderUsage | null | undefined) => {
      if (
        usage &&
        Number.isSafeInteger(usage.input_tokens) &&
        usage.input_tokens >= 0 &&
        Number.isSafeInteger(usage.output_tokens) &&
        usage.output_tokens >= 0
      )
        actualCost =
          Math.ceil(usage.input_tokens * inputRate + usage.output_tokens * outputRate) / 1e6;
    };
    try {
      await emit('run.started', {
        kind,
        source: mode,
        startedAt: Date.now(),
        cacheLayer:
          mode === 'recorded' ? 'recorded_bundle' : cached ? cached.cache.layer : 'provider',
      });
      if (kind === 'analyze') {
        const result =
          cached ??
          (mode === 'live'
            ? router
              ? await routerAnalysis(router, thread, controller.signal)
              : await liveAnalysis(client!, thread, controller.signal)
            : recorded(thread));
        if ('usage' in result) charge(result.usage as ProviderUsage | null);
        controller.signal.throwIfAborted();
        if (mode === 'live' && !cached) {
          if (thread.id.startsWith('mail-')) {
            if (store instanceof TursoStore)
              await store.cachePrivate(cacheKey(thread), current.id, {
                extraction: result.extraction,
                evidence: result.evidence,
              });
            else
              privateCache.set(cacheKey(thread), {
                extraction: result.extraction,
                evidence: result.evidence,
                created: Date.now(),
              });
          } else
            await store.cache(cacheKey(thread), {
              extraction: result.extraction,
              evidence: result.evidence,
            });
        }
        await emit('analysis.phase', { phase: 'validating' });
        await emit('analysis.completed', {
          extraction: result.extraction,
          evidence: result.evidence,
          serverMetrics: { serverDurationMs: performance.now() - started },
        });
      } else {
        const intent = replyBody!.intent,
          facts = replyBody!.facts;
        let text: string;
        if (mode === 'live') {
          const result = await (router ? routerReply : liveReply)(
            (router ?? client!) as RouterClient & OpenAI,
            thread,
            intent,
            facts,
            controller.signal,
            (delta) => emit('draft.delta', { text: delta }),
          );
          text = result.text;
          charge(result.usage);
        } else {
          text = recordedDraft(thread, intent);
          for (let offset = 0; offset < text.length; offset += 28) {
            await emit('draft.delta', { text: text.slice(offset, offset + 28) });
            await delay(24, undefined, { signal: controller.signal });
          }
        }
        await emit('draft.completed', {
          text,
          recipients: recipientFor(thread),
          lintFlags: lintDraft(text, facts),
          serverMetrics: { serverDurationMs: performance.now() - started },
        });
      }
    } catch (caught) {
      status = controller.signal.aborted && !timedOut ? 'cancelled' : 'failed';
      const safeCodes = new Set([
        'SOURCE_TOO_LARGE',
        'PROMPT_TOO_LARGE',
        'ANALYSIS_INCOMPLETE',
        'INVALID_EXTRACTION',
        'INVALID_COVERAGE',
        'DRAFT_INCOMPLETE',
        'UNSAFE_DRAFT',
      ]);
      errorCode = timedOut
        ? 'PROVIDER_TIMEOUT'
        : controller.signal.aborted
          ? 'CANCELLED'
          : typeof caught === 'object' &&
              caught !== null &&
              (('status' in caught && caught.status === 429) ||
                ('statusCode' in caught && caught.statusCode === 429))
            ? 'PROVIDER_RATE_LIMITED'
            : safeCodes.has((caught as Error).message)
              ? (caught as Error).message
              : 'PROVIDER_FAILED';
      if (!reply.raw.destroyed)
        reply.raw.write(
          `id: ${runId}:${sequence + 1}\nevent: ${status === 'cancelled' ? 'run.cancelled' : 'run.failed'}\ndata: ${JSON.stringify({ protocolVersion: 1, runId, threadId: thread.id, threadVersion: thread.version, mode, sequence: ++sequence, payload: { code: errorCode, message: status === 'cancelled' ? 'Generation cancelled.' : timedOut ? 'The free model is taking too long. Try Fetch again shortly; your mail remains available.' : errorCode === 'PROVIDER_RATE_LIMITED' ? 'OpenRouter has temporarily limited free requests. Try again later; your mail and previous overview remain available.' : 'The model could not return a verified result. Try again shortly; your existing overview remains available.', retryable: status !== 'cancelled' } })}\n\n`,
        );
    } finally {
      finished = true;
      clearTimeout(deadline);
      clearInterval(heartbeat);
      active.delete(runId);
      if (analysisKey && !cached) pendingAnalyses.delete(analysisKey);
      try {
        await store.finish(runId, status, errorCode, actualCost);
      } finally {
        reply.raw.end();
        resolveRun();
        settled.delete(runId);
      }
    }
  };
  app.post('/api/v1/threads/:id/analyze', (request, reply) => handleRun('analyze', request, reply));
  app.post('/api/v1/threads/:id/replies', (request, reply) => handleRun('reply', request, reply));
  app.get('/api/v1/runs/:id', async (request, reply) => {
    const current = await requireSession(request, reply);
    if (!current) return;
    const run = await store.run((request.params as { id: string }).id, current.id);
    return run ?? error(reply, request, 404, 'NOT_FOUND', 'Run not found.');
  });
  app.post('/api/v1/metrics', async (request, reply) => {
    const current = await requireSession(request, reply);
    if (!current) return;
    const parsed = z
      .strictObject({ events: z.array(metricSchema).max(50) })
      .safeParse(request.body);
    if (!parsed.success) return error(reply, request, 400, 'INVALID_INPUT', 'Invalid metrics.');
    await store.addMetrics(current.id, parsed.data.events);
    return reply.code(202).send({ acceptedCount: parsed.data.events.length });
  });
  app.get('/api/v1/metrics', async (request, reply) => {
    const current = await requireSession(request, reply);
    if (!current) return;
    return {
      sessionSamples: await store.metrics(current.id),
      buildSha: process.env.BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    };
  });
  app.setNotFoundHandler((request, reply) => {
    if (
      !request.url.startsWith('/api/') &&
      request.method === 'GET' &&
      String(request.headers.accept).includes('text/html') &&
      !request.url.includes('.') &&
      existsSync(join(publicDir, 'index.html'))
    )
      return reply.sendFile('index.html');
    return error(reply, request, 404, 'NOT_FOUND', 'Not found.');
  });
  app.addHook('preClose', async () => {
    for (const controller of active.values()) controller.abort();
    await Promise.all(settled.values());
  });
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    await store.close();
  });
  return app;
}
