import { spawn } from 'node:child_process';

const port = 3217;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist/api/src/server.js'], {
  env: {
    ...process.env,
    PORT: String(port),
    APP_ORIGIN: base,
    LIVE_AI_ENABLED: 'false',
    DATABASE_PATH: ':memory:',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const stop = () => {
  if (!child.killed) child.kill('SIGTERM');
};
process.on('exit', stop);

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return;
    } catch {
      // The packaged server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Packaged server did not become healthy.');
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  await waitForHealth();
  const home = await fetch(`${base}/`, { headers: { Accept: 'text/html' } });
  const html = await home.text();
  assert(home.ok && html.includes('Threadline'), 'Built page is unavailable.');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((match) => match[1]);
  assert(assets.length >= 2, 'Built asset links are missing.');
  for (const path of assets)
    assert((await fetch(`${base}${path}`)).ok, `Missing built asset: ${path}`);
  const ready = await (await fetch(`${base}/readyz`)).json();
  assert(
    ready.database === true && ready.liveEnabled === false,
    'Database readiness is incorrect.',
  );
  const session = await fetch(`${base}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: '{}',
  });
  assert(session.ok, 'Session bootstrap failed.');
  const cookie = session.headers.get('set-cookie')?.split(';')[0];
  assert(cookie, 'Session cookie was not issued.');
  const headers = { Origin: base, Cookie: cookie };
  const threads = await (await fetch(`${base}/api/v1/threads`)).json();
  assert(threads.threads.length === 10, 'Expected ten fixture threads.');
  for (const thread of threads.threads) {
    const brief = await (
      await fetch(
        `${base}/api/v1/threads/${thread.id}/intelligence?source=recorded&version=${thread.version}`,
      )
    ).json();
    assert(
      brief.state === 'ready' && brief.extraction.threadVersion === thread.version,
      `Invalid recorded brief: ${thread.id}`,
    );
  }
  const detail = await (await fetch(`${base}/api/v1/threads/recruiter-coordination`)).json();
  const intelligence = await (
    await fetch(
      `${base}/api/v1/threads/recruiter-coordination/intelligence?source=recorded&version=${detail.thread.version}`,
    )
  ).json();
  assert(intelligence.extraction?.source === 'recorded', 'Recorded intelligence is unavailable.');
  const analyze = await fetch(`${base}/api/v1/threads/recruiter-coordination/analyze`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'smoke-analyze',
    },
    body: JSON.stringify({ threadVersion: detail.thread.version, mode: 'recorded' }),
  });
  const analyzeText = await analyze.text();
  assert(analyze.ok && analyzeText.includes('analysis.completed'), 'Recorded analysis SSE failed.');
  const reply = await fetch(`${base}/api/v1/threads/recruiter-coordination/replies`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'smoke-reply',
    },
    body: JSON.stringify({
      threadVersion: detail.thread.version,
      mode: 'recorded',
      intent: 'acknowledge',
      facts: [],
    }),
  });
  const replyText = await reply.text();
  assert(reply.ok && replyText.includes('draft.completed'), 'Recorded reply SSE failed.');
  console.log(
    'Built smoke passed: health, session, ten threads, recorded analysis, recorded reply.',
  );
} finally {
  stop();
}
