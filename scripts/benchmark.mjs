import { performance } from 'node:perf_hooks';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createApp } from '../dist/api/src/api.js';
import { RuntimeStore } from '../dist/api/src/store.js';
import {
  threads,
  recordedExtractions,
  recordedEvidence,
  appendScenario,
} from '../dist/api/src/fixtures.js';
import { validateExtraction } from '../dist/api/src/domain.js';

const app = await createApp({ store: new RuntimeStore(':memory:'), live: false, logger: false });
const base = await app.listen({ port: 0, host: '127.0.0.1' });
const output = 'deliverables/verification';
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
try {
  const response = await fetch(`${base}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  let cookie = response.headers.get('set-cookie').split(';')[0];
  const read = async (path) => {
    const result = await fetch(`${base}${path}`, { headers: { cookie } });
    if (!result.ok) throw new Error(`${path}: ${result.status}`);
    return result.json();
  };
  const samples = [];
  for (let pass = 0; pass < 4; pass += 1) {
    if (pass > 0) {
      const session = await fetch(`${base}/api/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!session.ok) throw new Error('Benchmark session capacity');
      cookie = session.headers.get('set-cookie').split(';')[0];
    }
    for (const thread of threads) {
      const started = performance.now();
      await read(`/api/v1/threads/${thread.id}`);
      await read(
        `/api/v1/threads/${thread.id}/intelligence?version=${encodeURIComponent(thread.version)}&source=recorded`,
      );
      samples.push({ pass, thread: thread.id, durationMs: performance.now() - started });
    }
  }
  const runs = [];
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now();
    const response = await fetch(`${base}/api/v1/threads/${threads[0].id}/replies`, {
      method: 'POST',
      headers: {
        cookie,
        'Content-Type': 'application/json',
        'Idempotency-Key': `benchmark-${index}`,
      },
      body: JSON.stringify({
        threadVersion: threads[0].version,
        mode: 'recorded',
        intent: 'acknowledge',
        facts: [],
      }),
    });
    if (!response.ok) throw new Error(`Reply: ${response.status}`);
    let body = '',
      firstDeltaMs = null;
    for await (const bytes of response.body) {
      body += new TextDecoder().decode(bytes);
      if (firstDeltaMs === null && body.includes('draft.delta'))
        firstDeltaMs = performance.now() - started;
    }
    if (!body.includes('draft.completed') || firstDeltaMs === null)
      throw new Error('Missing terminal draft');
    runs.push({ firstDeltaMs, terminalMs: performance.now() - started });
  }
  const corpus = threads.map((thread) => ({
    thread,
    extraction: recordedExtractions.get(thread.id),
    evidence: recordedEvidence(thread.id),
  }));
  corpus.push(appendScenario);
  const evaluations = corpus.map(({ thread, extraction, evidence }) => ({
    threadId: thread.id,
    version: thread.version,
    messageCount: thread.messages.length,
    coverage: extraction.coverage.mode,
    evidenceSpans: evidence.length,
    errors: validateExtraction(thread, extraction, evidence),
  }));
  if (evaluations.some((row) => row.errors.length)) throw new Error('Corpus validation failed');
  const manifest = {};
  for (const folder of ['src', 'scripts', 'tests']) {
    for (const name of (await readdir(folder)).sort()) {
      if (/\.(ts|tsx|css|json|mjs)$/.test(name))
        manifest[`${folder}/${name}`] = createHash('sha256')
          .update(await readFile(`${folder}/${name}`))
          .digest('hex');
    }
  }
  const warm = samples.filter((row) => row.pass > 0).map((row) => row.durationMs);
  const results = {
    measuredAt: new Date().toISOString(),
    runtime: process.version,
    profile:
      'Windows localhost, one Node process, SQLite in memory, four independent anonymous sessions (one per pass), recorded corpus, no network shaping',
    methodology:
      'Two sequential HTTP requests and JSON parsing per switch; no React paint, provider latency, or user time saved measured. Pass 0 is excluded from warm percentiles. Recorded reply pacing is artificial playback.',
    threadSwitch: {
      samples: samples.length,
      warmSamples: warm.length,
      warmP50Ms: percentile(warm, 0.5),
      warmP95Ms: percentile(warm, 0.95),
      raw: samples,
    },
    recordedReply: runs,
    corpus: evaluations,
    sourceSha256: manifest,
  };
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/local-benchmark.json`, JSON.stringify(results, null, 2) + '\n');
  await writeFile(
    `${output}/Local-Benchmark.md`,
    `# Local verification benchmark\n\nMeasured ${results.measuredAt}, ${process.version}.\n\n${results.profile}.\n\n${results.methodology}\n\n- Warm source + brief: p50 ${results.threadSwitch.warmP50Ms.toFixed(2)} ms; p95 ${results.threadSwitch.warmP95Ms.toFixed(2)} ms; 30 samples.\n- Recorded replies: ${runs.map((run) => `${run.firstDeltaMs.toFixed(1)} ms first delta / ${run.terminalMs.toFixed(1)} ms terminal`).join('; ')}.\n- Corpus: ${evaluations.length}/${evaluations.length} pass structural and evidence validation, including the appended reply. This does not measure live-model semantic accuracy.\n\n[Raw samples, corpus checks and source hashes](local-benchmark.json).\n`,
  );
  console.log(
    `Benchmark saved; ${evaluations.length} corpus variants valid, warm p95 ${results.threadSwitch.warmP95Ms.toFixed(2)} ms.`,
  );
} finally {
  await app.close();
}
