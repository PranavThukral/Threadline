// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { api, stream, setOffline } from '../src/transport.js';
import type { Thread, Extraction } from '../src/domain.js';
beforeEach(() => {
  localStorage.clear();
  setOffline(true);
});
afterEach(() => setOffline(false));
describe('Bundled recorded fallback', () => {
  it('works with no API, including evidence, drafts and the append scenario', async () => {
    const bootstrap = await api<{ liveEnabled: boolean }>('/api/v1/bootstrap');
    expect(bootstrap.liveEnabled).toBe(false);
    const list = await api<{ threads: Thread[] }>('/api/v1/threads');
    expect(list.threads).toHaveLength(10);
    const detail = await api<{ thread: Thread }>('/api/v1/threads/recruiter-coordination');
    const events: string[] = [];
    await stream(
      `/api/v1/threads/${detail.thread.id}/replies`,
      { threadVersion: detail.thread.version, mode: 'recorded', intent: 'acknowledge', facts: [] },
      (event) => {
        events.push(event.type);
      },
      new AbortController().signal,
    );
    expect(events.at(-1)).toBe('draft.completed');
    const waiting = await api<{ thread: Thread }>('/api/v1/threads/waiting-on-reply');
    const appended = await api<{ thread: Thread; extraction: Extraction }>(
      '/api/v1/threads/waiting-on-reply/append',
      {
        method: 'POST',
        body: JSON.stringify({ threadVersion: waiting.thread.version, scenario: 'reply_received' }),
      },
    );
    expect(appended.thread.version).not.toBe(waiting.thread.version);
    expect(appended.extraction.response.state).toBe('yes');
    const loaded = await api<{ thread: Thread }>('/api/v1/threads/waiting-on-reply');
    expect(loaded.thread.messages).toHaveLength(2);
    await expect(
      stream(
        `/api/v1/threads/${detail.thread.id}/replies`,
        {
          threadVersion: detail.thread.version,
          mode: 'recorded',
          intent: 'answer',
          facts: ['I can meet Tuesday.'],
        },
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('custom facts');
  });
});
