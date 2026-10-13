// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('Browser decision persistence', () => {
  it('keeps the current in-memory decision when fallback writes fail and surfaces the failure', async () => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', undefined);
    const storage = (await import('../src/local-state.js')).workspaceStorage;
    await storage.ready();
    storage.setItem('threadline.action', 'old');
    const failed = vi.fn();
    window.addEventListener('threadline-storage-failed', failed);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => storage.setItem('threadline.action', 'current')).toThrow('quota');
    expect(storage.getItem('threadline.action')).toBe('current');
    expect(failed).toHaveBeenCalledOnce();
    window.removeEventListener('threadline-storage-failed', failed);
  });
  it('migrates fallback decisions, persists through a fresh adapter, and removes without resurrection', async () => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.setItem('threadline.followups.v1', '{"waiting":"2026-10-07"}');
    const first = (await import('../src/local-state.js')).workspaceStorage;
    await first.ready();
    expect(first.getItem('threadline.followups.v1')).toContain('waiting');
    first.setItem('threadline.done.fixture.version', '["action"]');
    vi.resetModules();
    const second = (await import('../src/local-state.js')).workspaceStorage;
    await second.ready();
    expect(second.getItem('threadline.done.fixture.version')).toBe('["action"]');
    second.removeItem('threadline.followups.v1');
    vi.resetModules();
    const third = (await import('../src/local-state.js')).workspaceStorage;
    await third.ready();
    expect(third.getItem('threadline.followups.v1')).toBeNull();
  });
  it('does not let a stalled IndexedDB open leave the application loading forever', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', { open: () => ({}) });
    const storage = (await import('../src/local-state.js')).workspaceStorage;
    const ready = storage.ready();
    await vi.advanceTimersByTimeAsync(3000);
    await ready;
    storage.setItem('threadline.test', 'fallback');
    expect(localStorage.getItem('threadline.test')).toBe('fallback');
  });
});
