// Two real free-model requests through the running local API; example content only.
import { randomUUID } from 'node:crypto';
import { StreamDecoder, type StreamEvent } from '../src/transport.js';
import { FREE_MODEL } from '../src/openrouter-provider.js';
const base = 'http://localhost:3000';
const assert = (condition: unknown, code: string) => {
  if (!condition) throw new Error(code);
};
try {
  const bootstrap = await (await fetch(`${base}/api/v1/bootstrap`)).json();
  assert(bootstrap.liveEnabled && bootstrap.modelSnapshot === FREE_MODEL, 'LIVE_NOT_READY');
  const session = await fetch(`${base}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: '{}',
  });
  const headers = {
    'Content-Type': 'application/json',
    Origin: base,
    Cookie: session.headers.get('set-cookie')!.split(';')[0],
  };
  const mail = (
    await (await fetch(`${base}/api/v1/threads/meeting-coordination`, { headers })).json()
  ).thread;
  for (const [name, note] of [
    [
      'morning-constraint',
      'I am busy mostly this week and will probably have to take it early in the morning',
    ],
    ['confirmed-wednesday', 'Wednesday at 11am ET works for me.'],
  ]) {
    const started = performance.now(),
      events: StreamEvent[] = [];
    const response = await fetch(`${base}/api/v1/threads/${mail.id}/replies`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({
        threadVersion: mail.version,
        mode: 'live',
        intent: 'answer',
        facts: [note],
      }),
      signal: AbortSignal.timeout(100000),
    });
    assert(response.ok, `API_${response.status}`);
    const decoder = new StreamDecoder(
      { threadId: mail.id, threadVersion: mail.version, mode: 'live' },
      (event) => events.push(event),
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
    assert(terminal.type === 'draft.completed', String(terminal.payload.code ?? 'DRAFT_FAILED'));
    assert(terminal.payload.lintFlags.length === 0, 'REPLY_BLOCKED');
    const text = String(terminal.payload.text);
    assert(
      name === 'morning-constraint'
        ? /morning/i.test(text) &&
            /probably|might|likely|could|would/i.test(text) &&
            !/I prefer Tuesday|Tuesday.*works for me/i.test(text)
        : /Wednesday/i.test(text) && /11\s*am/i.test(text),
      'NOTES_IGNORED',
    );
    assert(terminal.payload.recipients[0] === 'p_maya', 'WRONG_RECIPIENT');
    assert(
      (await (await fetch(`${base}/api/v1/runs/${terminal.runId}`, { headers })).json()).status ===
        'completed',
      'RUN_NOT_SETTLED',
    );
    console.log(
      JSON.stringify({
        case: name,
        passed: true,
        durationMs: Math.round(performance.now() - started),
        lintFlags: terminal.payload.lintFlags,
        exampleReply: text,
      }),
    );
  }
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
