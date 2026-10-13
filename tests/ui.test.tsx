// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import App from '../src/app.js';
import { workspaceStorage } from '../src/local-state.js';
import { recordedEvidence, recordedExtractions, threads } from '../src/fixtures.js';
import { recordedDraft } from '../src/workflow.js';
import { createCustomMail, pendingBrief } from '../src/custom-mail.js';
import type { StreamEvent } from '../src/transport.js';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  stream: vi.fn(),
  setOffline: vi.fn(),
  isOffline: vi.fn(() => false),
}));
vi.mock('../src/transport.js', () => mocks);
const callbacks: Array<(event: StreamEvent) => void> = [];
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  for (const key of workspaceStorage.keys()) workspaceStorage.removeItem(key);
  callbacks.length = 0;
  document.documentElement.lang = 'en';
  document.title = 'Threadline';
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.api.mockImplementation(async (path: string) => {
    if (path.endsWith('/session')) return {};
    if (path.endsWith('/bootstrap'))
      return { liveEnabled: false, scenarioClockBase: '2026-10-05T10:00:00-04:00' };
    if (path.endsWith('/threads'))
      return {
        threads: threads.map((t) => ({
          ...t,
          messageCount: t.messages.length,
          responseState: recordedExtractions.get(t.id)!.response.state,
        })),
      };
    const t = threads.find((t) => t.id === path.split('/')[4])!;
    if (path.includes('intelligence'))
      return {
        extraction: recordedExtractions.get(t.id),
        evidence: recordedEvidence(t.id),
        state: 'ready',
      };
    return { thread: t, evidence: recordedEvidence(t.id) };
  });
  mocks.stream.mockImplementation(
    async (_path: string, _body: unknown, callback: (event: StreamEvent) => void) => {
      callbacks.push(callback);
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function open() {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'Next step: Summer 2027 conversation' });
  return { user, view };
}
const event = (type: string, payload: Record<string, unknown>): StreamEvent => ({
  type,
  payload,
  runId: 'test',
  threadId: threads[0].id,
  threadVersion: threads[0].version,
  mode: 'recorded',
  sequence: 1,
});

describe('Workbench workflows', () => {
  it('keeps a failed Fetch visible, preserves the overview, and supports an explicit retry', async () => {
    const { user } = await open();
    await user.keyboard('l');
    callbacks[0](event('run.failed', { message: 'The free model is busy. Please try again.' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The free model is busy');
    expect(screen.getByText('Share two interview windows')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    callbacks[1](
      event('analysis.completed', {
        extraction: recordedExtractions.get(threads[0].id),
        evidence: recordedEvidence(threads[0].id),
      }),
    );
    expect(screen.getByText('Response needed')).toBeTruthy();
  });
  it('starts with three unread mails at the top and persists reading one across reload', async () => {
    const { user, view } = await open();
    const rows = [...view.container.querySelectorAll('.thread-row')];
    expect(rows.slice(0, 3).every((row) => row.classList.contains('unread'))).toBe(true);
    expect(rows.slice(3).every((row) => !row.classList.contains('unread'))).toBe(true);
    expect(view.container.querySelectorAll('.unread-dot')).toHaveLength(3);
    expect(rows[0].getAttribute('aria-label')).toContain('Unread');
    await user.click(rows[0] as HTMLButtonElement);
    await screen.findByRole('heading', { name: 'Pick a time for the product review' });
    expect(view.container.querySelectorAll('.unread-dot')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /Maya Chen: Pick a time/ }).classList.contains('unread'),
    ).toBe(false);
    view.unmount();
    const reloaded = render(<App />);
    await screen.findByRole('heading', { name: threads[0].subject });
    expect(reloaded.container.querySelectorAll('.unread-dot')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Next Step' })).toBeTruthy();
    expect(screen.queryByText('Your next step')).toBeNull();
    expect(screen.queryByText('Overview')).toBeNull();
  });
  it('expands a detailed mail by its preview and can collapse after inspecting a source', async () => {
    const { user, view } = await open();
    const preview = screen.getByRole('button', { name: 'Read full mail from Taylor Morgan' });
    const body = view.container.querySelector<HTMLElement>('#body-m_recruiter_2')!;
    expect(body.hidden).toBe(true);
    expect(preview.textContent).toContain('Read full mail');
    await user.click(preview);
    expect(body.hidden).toBe(false);
    expect(body.textContent).toContain('There is no take-home assignment to prepare.');
    await user.click(screen.getByRole('button', { name: 'Collapse message from Taylor Morgan' }));
    expect(body.hidden).toBe(true);
    await user.click(screen.getByRole('button', { name: 'View source e_windows' }));
    expect(body.hidden).toBe(false);
    expect(body.querySelector('mark')?.textContent).toContain('Could you share two windows');
    await user.click(screen.getByRole('button', { name: 'Collapse message from Taylor Morgan' }));
    expect(body.hidden).toBe(true);
    expect(body.querySelector('mark')).toBeNull();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('requires fresh review after supplied facts change', async () => {
    const { user, view } = await open();
    await user.click(screen.getByRole('button', { name: 'Draft reply' }));
    callbacks[0](
      event('draft.completed', {
        text: recordedDraft(threads[0], 'acknowledge'),
        lintFlags: [],
        recipients: ['p_recruiter'],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Answer with facts' }));
    expect(screen.queryByRole('button', { name: 'Review draft' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Update draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(
      screen.getByRole('textbox', { name: 'Facts for this reply' }),
      'I prefer a video interview.',
    );
    expect(screen.queryByRole('button', { name: 'Copy reply' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Update draft' }));
    expect(mocks.stream.mock.calls[1][1]).toMatchObject({
      intent: 'answer',
      facts: ['I prefer a video interview.'],
    });
    callbacks[1](
      event('draft.completed', {
        text: 'Hi Taylor,\nI prefer a video interview.\nAlex',
        lintFlags: [],
        recipients: ['p_recruiter'],
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Review draft' }));
    expect(screen.getByRole('button', { name: 'Copy reply' })).toBeTruthy();
    await user.type(
      screen.getByRole('textbox', { name: 'Facts for this reply' }),
      ' Early mornings are better.',
    );
    expect(screen.queryByRole('button', { name: 'Copy reply' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Update draft' })).toBeTruthy();
    expect(Object.keys(localStorage).some((key) => key.startsWith('threadline.draft.'))).toBe(
      false,
    );
    view.unmount();
    render(<App />);
    await screen.findByRole('heading', { name: threads[0].subject });
    await user.keyboard('{Shift>}r{/Shift}');
    expect(
      (screen.getByRole('textbox', { name: 'Facts for this reply' }) as HTMLTextAreaElement).value,
    ).toBe('');
  });
  it('reproduces the screenshot and requires the changed morning notes to generate a new draft', async () => {
    const originalApi = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation((path: string, options?: RequestInit) =>
      path.endsWith('/bootstrap')
        ? Promise.resolve({ liveEnabled: true })
        : originalApi(path, options),
    );
    const { user } = await open();
    const meeting = threads.find((mail) => mail.id === 'meeting-coordination')!;
    await user.click(screen.getByRole('button', { name: /Maya Chen: Pick a time/ }));
    await screen.findByRole('heading', { name: meeting.subject });
    await user.keyboard('{Shift>}r{/Shift}');
    const notes = screen.getByRole('textbox', { name: 'Facts for this reply' });
    await user.type(notes, 'Tuesday at 2pm ET works for me.');
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    const complete = (text: string) => ({
      ...event('draft.completed', { text, lintFlags: [], recipients: ['p_maya'] }),
      threadId: meeting.id,
      threadVersion: meeting.version,
      mode: 'live' as const,
    });
    callbacks[0](complete('Hi Maya,\n\nI prefer Tuesday at 2pm ET.\n\nAlex'));
    await screen.findByRole('button', { name: 'Review draft' });
    await user.clear(notes);
    const currentNotes =
      'I am busy mostly this week and will probably have to take it early in the morning';
    await user.type(notes, currentNotes);
    expect(screen.queryByRole('button', { name: 'Review draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy reply' })).toBeNull();
    expect(screen.getByText(/Your notes or reply type changed/)).toBeTruthy();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Update draft' }));
    expect(mocks.stream.mock.calls[1][1]).toMatchObject({
      facts: [currentNotes],
      intent: 'answer',
      mode: 'live',
    });
    callbacks[1](
      complete(
        'Hi Maya,\n\nEarly mornings would probably work better. Do you have an early-morning option?\n\nAlex',
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Review draft' }));
    await user.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(await navigator.clipboard.readText()).toContain('early-morning option');
    expect(await navigator.clipboard.readText()).not.toContain('Tuesday at 2pm');
  }, 10000);
  it('keeps the synthetic clock stable across reloads', async () => {
    const { user, view } = await open();
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    await user.click(await screen.findByRole('button', { name: 'Advance scenario clock' }));
    expect(localStorage.getItem('threadline.clock.v1')).toBe('1');
    view.unmount();
    render(<App />);
    await screen.findByRole('heading', { name: threads[0].subject });
    await user.click(screen.getByRole('button', { name: /Alex Rivera: Waiting/ }));
    await screen.findByRole('heading', { name: /Waiting on the revised numbers/ });
    await user.keyboard('f');
    expect((screen.getByLabelText('Follow-up date') as HTMLInputElement).value).toBe('2026-10-08');
  });
  it('requires review, invalidates it on edits, copies only reviewed text, and retains a closed draft', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Draft reply' }));
    const text = recordedDraft(threads[0], 'acknowledge');
    callbacks[0](event('draft.completed', { text, lintFlags: [], recipients: ['p_recruiter'] }));
    const editor = screen.getByRole('textbox', { name: 'Reply draft' });
    await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe(text));
    await user.click(screen.getByRole('button', { name: 'Review draft' }));
    expect(screen.getByRole('button', { name: 'Copy reply' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(await navigator.clipboard.readText()).toBe(text);
    await user.type(editor, ' Thank you.');
    expect(screen.queryByRole('button', { name: 'Copy reply' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close reply' }));
    await user.keyboard('r');
    expect(
      (screen.getByRole('textbox', { name: 'Reply draft' }) as HTMLTextAreaElement).value,
    ).toContain('Thank you.');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });
  it('rejects stale replies and analyses after switching threads even if a transport ignores abort', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Draft reply' }));
    const lateReply = callbacks[0];
    await user.click(screen.getByRole('button', { name: /Sam Okafor: FYI/ }));
    await screen.findByRole('heading', {
      name: threads.find((t) => t.id === 'informational-update')!.subject,
    });
    lateReply(event('draft.completed', { text: 'WRONG THREAD', lintFlags: [], recipients: [] }));
    expect(screen.queryByText('WRONG THREAD')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Reply draft' })).toBeNull();
    await user.keyboard('l');
    const lateAnalysis = callbacks.at(-1)!;
    await user.click(screen.getByRole('button', { name: /Taylor Morgan: Next step/ }));
    await screen.findByRole('heading', { name: threads[0].subject });
    const info = threads.find((t) => t.id === 'informational-update')!;
    lateAnalysis(
      event('analysis.completed', {
        extraction: recordedExtractions.get(info.id),
        evidence: recordedEvidence(info.id),
      }),
    );
    expect(screen.getByText('Response needed')).toBeTruthy();
  });
  it('makes follow-up preview reachable by keyboard, persists, removes and undoes it', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Alex Rivera: Waiting/ }));
    await screen.findByRole('heading', { name: /Waiting on the revised numbers/ });
    await user.keyboard('f');
    await user.click(screen.getByRole('button', { name: 'Confirm follow-up' }));
    expect(JSON.parse(localStorage.getItem('threadline.followups.v1')!)['waiting-on-reply']).toBe(
      '2026-10-07T13:00:00.000Z',
    );
    await user.click(screen.getByRole('button', { name: 'Remove follow-up' }));
    expect(JSON.parse(localStorage.getItem('threadline.followups.v1')!)).toEqual({});
    await user.click(screen.getByRole('button', { name: 'Undo last local change' }));
    await screen.findByRole('button', { name: 'Remove follow-up' });
  });
  it('focuses facts without a paid request and keeps an incomplete draft blocked until edited', async () => {
    const { user } = await open();
    await user.keyboard('{Shift>}r{/Shift}');
    const facts = await screen.findByRole('textbox', { name: 'Facts for this reply' });
    expect(document.activeElement).toBe(facts);
    expect(mocks.stream).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    callbacks[0](event('draft.delta', { text: 'Partial draft' }));
    await user.click(screen.getByRole('button', { name: 'Cancel generation' }));
    expect(
      (screen.getByRole('button', { name: 'Review draft' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Reply draft' }), ' now completed.');
    expect(
      (screen.getByRole('button', { name: 'Review draft' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
  it('traps modal focus, restores it, and has no automated semantic accessibility violations', async () => {
    const { user, view } = await open();
    const initial = await axe.run(view.container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(initial.violations.map((v) => v.id)).toEqual([]);
    const button = screen.getByRole('button', { name: 'Open command palette' });
    await user.click(button);
    const input = screen.getByRole('textbox', { name: 'Find a command' });
    expect(document.activeElement).toBe(input);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement?.textContent).toContain('Show shortcuts');
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(input);
    const palette = await axe.run(view.container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(palette.violations.map((v) => v.id)).toEqual([]);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(button);
    await user.keyboard('p');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('dismisses the guide permanently across reload and reset, and prioritizes populated sections', async () => {
    const { user, view } = await open();
    const sections = () => [...view.container.querySelectorAll('.brief-section > button')];
    expect(sections()[0].textContent).toContain('Your next actions');
    expect(sections()[1].textContent).toContain('Open questions');
    expect(
      sections()
        .slice(2)
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Demo guide' }));
    await user.click(screen.getByRole('button', { name: 'Close demo guide' }));
    expect(localStorage.getItem('threadline.guide.closed.v1')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Demo guide' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    await user.click(screen.getByRole('button', { name: /Reset demo/ }));
    await waitFor(() => expect(localStorage.getItem('threadline.guide.closed.v1')).toBe('true'));
    view.unmount();
    const next = render(<App />);
    await screen.findByRole('heading', { name: threads[0].subject });
    expect(screen.queryByRole('button', { name: 'Demo guide' })).toBeNull();
    await user.keyboard('?');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Alex Rivera: Waiting/ }));
    await screen.findByRole('heading', { name: /Waiting on the revised numbers/ });
    const waitingSections = [...next.container.querySelectorAll('.brief-section > button')];
    expect(waitingSections[0].textContent).toContain('Waiting on');
    expect((waitingSections[0] as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Synthetic email')).toBeNull();
    expect(screen.queryByText('Recorded demo')).toBeNull();
  });
  it('filters mails by reply need and saved follow-ups, with useful empty states', async () => {
    const { user, view } = await open();
    await user.click(screen.getByRole('button', { name: 'Needs a reply' }));
    const rows = [...view.container.querySelectorAll('.thread-row')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.textContent?.includes('For your awareness'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Follow-ups' }));
    expect(screen.getByText('Saved follow-ups will appear here.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Inbox' }));
    await user.type(screen.getByRole('textbox', { name: 'Search mails' }), 'no-such-mail');
    expect(screen.getByText('No mails match your search.')).toBeTruthy();
    expect(view.container.querySelectorAll('.thread-row')).toHaveLength(0);
  });
  it('adds user-written mail, fetches it live once, and leaves private content out of durable browser storage', async () => {
    const originalApi = mocks.api.getMockImplementation()!;
    let custom: ReturnType<typeof createCustomMail> | undefined;
    mocks.api.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith('/bootstrap')) return { liveEnabled: true };
      if (path.endsWith('/threads') && options?.method === 'POST') {
        custom = createCustomMail(JSON.parse(String(options.body)));
        return { thread: custom };
      }
      if (custom && path.endsWith('/threads')) return { threads: [custom, ...threads] };
      if (custom && path.includes(custom.id))
        return path.includes('intelligence')
          ? { ...pendingBrief(custom), state: 'ready' }
          : { thread: custom, evidence: pendingBrief(custom).evidence };
      return originalApi(path, options);
    });
    const { user, view } = await open();
    expect(mocks.stream).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'New mail' }));
    const audit = await axe.run(view.container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(audit.violations.map((v) => v.id)).toEqual([]);
    await user.type(screen.getByRole('textbox', { name: 'From' }), 'Casey Example');
    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'casey@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'A new interview request');
    await user.type(
      screen.getByRole('textbox', { name: 'Message' }),
      'Can you confirm the video format?',
    );
    await user.click(screen.getByRole('button', { name: 'Add mail & fetch overview' }));
    await screen.findByRole('heading', { name: 'A new interview request' });
    await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
    expect(mocks.stream.mock.calls[0][0]).toBe(`/api/v1/threads/${custom!.id}/analyze`);
    expect(mocks.stream.mock.calls[0][1]).toEqual({ threadVersion: custom!.version, mode: 'live' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain('casey@example.com');
    expect(
      workspaceStorage
        .keys()
        .map((key) => workspaceStorage.getItem(key))
        .join(''),
    ).not.toContain('video format');
  });
});
