// Manual check only: makes two real requests to the configured free model.
// Run against the compiled, locally running server; never include credentials here.
import { randomUUID } from 'node:crypto';
import { StreamDecoder, type StreamEvent } from '../src/transport.js';
import { validateExtraction, type Thread } from '../src/domain.js';
import { extractionSchema, evidenceSchema } from '../src/contracts.js';
import { FREE_MODEL } from '../src/openrouter-provider.js';
import { lintDraft } from '../src/workflow.js';

const base = process.argv[2] ?? 'http://localhost:3000';
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
try {
  const bootstrap = await (await fetch(`${base}/api/v1/bootstrap`)).json();
  assert(bootstrap.liveEnabled && bootstrap.modelSnapshot === FREE_MODEL, 'LIVE_NOT_READY');
  const initial = await fetch(`${base}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: '{}',
  });
  const cookie = initial.headers.get('set-cookie')!.split(';')[0];
  const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
  const added = await fetch(`${base}/api/v1/threads`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      senderName: 'Casey Example',
      senderEmail: 'casey@example.com',
      subject: 'Choose your interview format',
      body: 'Hi Alex,\n\nCould you confirm whether you prefer video or phone for our conversation? Our team can offer either format.\n\nThe conversation is a chance to hear about a recent project and the decisions behind it. There is no assignment to prepare beforehand. We keep the initial conversation focused on your experience so it is useful for both you and the team.\n\nThanks,\nCasey',
    }),
  });
  assert(added.status === 201, 'MAIL_ADD_FAILED');
  const mail: Thread = (await added.json()).thread;
  const invoke = async (kind: 'analyze' | 'replies', extra: Record<string, unknown> = {}) => {
    const started = performance.now(),
      events: StreamEvent[] = [];
    let firstDeltaMs: number | null = null;
    const response = await fetch(`${base}/api/v1/threads/${mail.id}/${kind}`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ threadVersion: mail.version, mode: 'live', ...extra }),
      signal: AbortSignal.timeout(105000),
    });
    assert(response.ok, `API_${response.status}`);
    const decoder = new StreamDecoder(
      { threadId: mail.id, threadVersion: mail.version, mode: 'live' },
      (event) => {
        events.push(event);
        if (event.type === 'draft.delta' && firstDeltaMs === null)
          firstDeltaMs = Math.round(performance.now() - started);
      },
    );
    const reader = response.body!.getReader(),
      utf8 = new TextDecoder();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      decoder.feed(utf8.decode(chunk.value, { stream: true }));
    }
    decoder.feed(utf8.decode());
    decoder.finish();
    const terminal = events.at(-1)!;
    assert(
      terminal.type === (kind === 'analyze' ? 'analysis.completed' : 'draft.completed'),
      String(terminal.payload.code ?? 'LIVE_FAILED'),
    );
    assert(
      (await (await fetch(`${base}/api/v1/runs/${terminal.runId}`, { headers })).json()).status ===
        'completed',
      'RUN_NOT_SETTLED',
    );
    return { terminal, events, durationMs: Math.round(performance.now() - started), firstDeltaMs };
  };
  const overview = await invoke('analyze');
  const extraction = extractionSchema.parse(overview.terminal.payload.extraction);
  const evidence = evidenceSchema.array().parse(overview.terminal.payload.evidence);
  assert(
    !validateExtraction(mail, extraction, evidence).length && extraction.source === 'live',
    'INVALID_EXTRACTION',
  );
  assert(
    extraction.response.state === 'yes' &&
      extraction.actions.length + extraction.questions.length > 0,
    'REQUEST_NOT_FOUND',
  );
  const cached = await (
    await fetch(`${base}/api/v1/threads/${mail.id}/intelligence?source=live`, { headers })
  ).json();
  assert(
    cached.state === 'ready' && ['memory', 'sqlite'].includes(cached.cache.layer),
    'PRIVATE_CACHE_FAILED',
  );
  const replay = await invoke('analyze');
  assert(replay.events[0].payload.cacheLayer === cached.cache.layer, 'CACHE_REPLAY_FAILED');
  const facts = ['I prefer video.'];
  const reply = await invoke('replies', { intent: 'answer', facts });
  const text = String(reply.terminal.payload.text);
  assert(/\bvideo\b/i.test(text), 'SUPPLIED_FACT_NOT_USED');
  assert(!lintDraft(text, facts).length, 'UNSAFE_GENERATED_REPLY');
  assert(
    reply.events.some((event) => event.type === 'draft.delta'),
    'NO_REAL_DELTAS',
  );
  assert(reply.terminal.payload.recipients[0] === mail.messages[0].senderId, 'WRONG_RECIPIENT');
  const otherSession = await fetch(`${base}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: '{}',
  });
  const otherCookie = otherSession.headers.get('set-cookie')!.split(';')[0];
  assert(
    (await fetch(`${base}/api/v1/threads/${mail.id}`, { headers: { Cookie: otherCookie } }))
      .status === 404,
    'PRIVATE_MAIL_NOT_ISOLATED',
  );
  const reset = await fetch(`${base}/api/v1/reset`, { method: 'POST', headers, body: '{}' });
  assert(
    reset.ok && (await fetch(`${base}/api/v1/threads/${mail.id}`, { headers })).status === 404,
    'RESET_NOT_COMPLETE',
  );
  console.log(
    JSON.stringify({
      status: 'verified',
      model: bootstrap.modelSnapshot,
      overviewMs: overview.durationMs,
      replyMs: reply.durationMs,
      firstReplyDeltaMs: reply.firstDeltaMs,
      cacheReplayMs: replay.durationMs,
      actions: extraction.actions.length,
      questions: extraction.questions.length,
      evidence: evidence.length,
      suppliedFactsUsed: true,
      privateCacheLayer: cached.cache.layer,
      crossSessionIsolation: true,
      resetVerified: true,
      runsSettled: true,
    }),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  console.error(
    JSON.stringify({
      status: 'failed',
      code: /^[A-Z_0-9]+$/.test(message) ? message : 'LIVE_CHECK_FAILED',
    }),
  );
  process.exitCode = 1;
}
