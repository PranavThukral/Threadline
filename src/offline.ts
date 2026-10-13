import bundle from './recorded-bundle.json' with { type: 'json' };
import type { Thread } from './domain.js';
import type { StreamEvent } from './transport.js';
import { recordedDraft, recipientFor, lintDraft } from './workflow.js';
import { viewer } from './viewer.js';
import { workspaceStorage } from './local-state.js';

const currentRows = () =>
  bundle.map((row) =>
    workspaceStorage.getItem(`threadline.append.${row.thread.id}`) === 'true' && row.appendScenario
      ? row.appendScenario
      : row,
  );
export function offlineApi(path: string, options?: RequestInit): unknown {
  if (path.endsWith('/reset')) {
    workspaceStorage.removeItem('threadline.append.waiting-on-reply');
    return { reset: true };
  }
  if (path.endsWith('/session')) return {};
  if (path.endsWith('/bootstrap'))
    return {
      viewer,
      liveEnabled: false,
      disabledReason: 'The API is unavailable. You can use the bundled recorded demo.',
      userTimezoneDefault: 'America/New_York',
      scenarioClockBase: '2026-10-05T10:00:00-04:00',
      modelSnapshot: 'offline',
    };
  if (path.endsWith('/threads'))
    return {
      threads: currentRows().map(({ thread }) => ({
        ...thread,
        messageCount: thread.messages.length,
      })),
    };
  const id = path.split('/')[4];
  const row = currentRows().find((item) => item.thread.id === id);
  if (!row) throw new Error('Thread not found in the recorded demo.');
  if (path.endsWith('/append')) {
    const original = bundle.find((item) => item.thread.id === id);
    if (
      !original?.appendScenario ||
      JSON.parse(String(options?.body ?? '{}')).threadVersion !== row.thread.version ||
      row.thread.version === original.appendScenario.thread.version
    )
      throw new Error('The scenario changed. Refresh the thread.');
    workspaceStorage.setItem(`threadline.append.${id}`, 'true');
    return original.appendScenario;
  }
  if (path.includes('/intelligence'))
    return { state: 'ready', extraction: row.extraction, evidence: row.evidence };
  return { thread: row.thread, evidence: row.evidence };
}
export async function offlineStream(
  path: string,
  body: { threadVersion: string; mode: string; intent?: string; facts?: string[] },
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  const row = currentRows().find((item) => item.thread.id === path.split('/')[4]);
  if (!row || row.thread.version !== body.threadVersion)
    throw new Error('Thread version mismatch.');
  if (body.mode !== 'recorded') throw new Error('Live AI requires the server.');
  if (body.facts?.length)
    throw new Error(
      'Recorded mode cannot generate custom facts. Edit the acknowledgment directly.',
    );
  const runId = crypto.randomUUID();
  let sequence = 0;
  const emit = (type: string, payload: Record<string, unknown>) => {
    signal.throwIfAborted();
    onEvent({
      type,
      payload,
      runId,
      threadId: row.thread.id,
      threadVersion: row.thread.version,
      mode: 'recorded',
      sequence: ++sequence,
    });
  };
  emit('run.started', { source: 'recorded', cacheLayer: 'recorded_bundle' });
  if (path.endsWith('/analyze')) {
    emit('analysis.completed', { extraction: row.extraction, evidence: row.evidence });
    return;
  }
  const thread = row.thread as Thread;
  if (!recipientFor(thread).length) throw new Error('Recipient identity is incomplete.');
  if (body.intent === 'answer')
    throw new Error('Add your facts and enable live AI to generate an answer.');
  const text = recordedDraft(thread, body.intent ?? 'acknowledge');
  for (let offset = 0; offset < text.length; offset += 28) {
    emit('draft.delta', { text: text.slice(offset, offset + 28) });
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 24);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  emit('draft.completed', { text, recipients: recipientFor(thread), lintFlags: lintDraft(text) });
}
