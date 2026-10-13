import { createParser } from 'eventsource-parser';
import { z } from 'zod';
import type { SourceMode } from './domain.js';

export type StreamEvent = {
  type: string;
  payload: Record<string, any>;
  runId: string;
  threadId: string;
  threadVersion: string;
  mode: SourceMode;
  sequence: number;
};
const envelopeSchema = z.strictObject({
  protocolVersion: z.literal(1),
  runId: z.uuid(),
  threadId: z.string().min(1),
  threadVersion: z.string().min(1),
  mode: z.enum(['recorded', 'live']),
  sequence: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
});
const names = new Set([
  'run.started',
  'analysis.phase',
  'analysis.completed',
  'draft.delta',
  'draft.completed',
  'run.failed',
  'run.cancelled',
]);
const terminals = new Set(['analysis.completed', 'draft.completed', 'run.failed', 'run.cancelled']);
export class StreamDecoder {
  private sequence = 0;
  private runId: string | null = null;
  private terminal = false;
  private bufferSize = 0;
  private parser;
  constructor(
    expected: { threadId: string; threadVersion: string; mode: SourceMode },
    onEvent: (event: StreamEvent) => void,
  ) {
    this.parser = createParser({
      onEvent: (frame) => {
        this.bufferSize = 0;
        if (!frame.event || !names.has(frame.event)) throw new Error('Unknown stream event');
        const value = envelopeSchema.parse(JSON.parse(frame.data));
        if (
          value.threadId !== expected.threadId ||
          value.threadVersion !== expected.threadVersion ||
          value.mode !== expected.mode ||
          value.sequence !== this.sequence + 1 ||
          (this.runId && value.runId !== this.runId)
        )
          throw new Error('Stream identity or sequence mismatch');
        if (this.terminal) throw new Error('STREAM_MULTIPLE_TERMINALS');
        if (!this.sequence && frame.event !== 'run.started')
          throw new Error('Stream must start with run.started');
        if (frame.event === 'draft.delta' && typeof value.payload.text !== 'string')
          throw new Error('Invalid draft delta');
        if (
          frame.event === 'draft.completed' &&
          (typeof value.payload.text !== 'string' ||
            !Array.isArray(value.payload.lintFlags) ||
            !Array.isArray(value.payload.recipients))
        )
          throw new Error('Invalid draft completion');
        if (frame.event === 'analysis.completed' && !value.payload.extraction)
          throw new Error('Invalid analysis completion');
        this.runId = value.runId;
        this.sequence = value.sequence;
        this.terminal = terminals.has(frame.event);
        onEvent({ ...value, type: frame.event });
      },
      onError: () => {
        throw new Error('Malformed event stream');
      },
    });
  }
  feed(chunk: string) {
    this.bufferSize += chunk.length;
    if (this.bufferSize > 256000) throw new Error('STREAM_FRAME_TOO_LARGE');
    this.parser.feed(chunk);
  }
  finish() {
    if (!this.terminal) throw new Error('STREAM_INTERRUPTED');
  }
}

let offline = false;
export const isOffline = () => offline;
export const setOffline = (value: boolean) => {
  offline = value;
};
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (offline) return (await import('./offline.js')).offlineApi(path, options) as T;
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: AbortSignal.any([
      ...(options?.signal ? [options.signal] : []),
      AbortSignal.timeout(10000),
    ]),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error?.message ?? 'The request could not be completed.');
  }
  return response.json() as Promise<T>;
}
export async function stream(
  path: string,
  body: { threadVersion: string; mode: SourceMode; intent?: string; facts?: string[] },
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  if (offline) return (await import('./offline.js')).offlineStream(path, body, onEvent, signal);
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(120000)]);
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
    signal: combined,
  });
  if (!response.ok || !response.body) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error?.message ?? 'Generation is unavailable.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new StreamDecoder(
    { threadId: path.split('/')[4], threadVersion: body.threadVersion, mode: body.mode },
    onEvent,
  );
  try {
    for (;;) {
      const timer = setTimeout(
        () => controller.abort(new Error('Stream timed out. Please retry.')),
        15000,
      );
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } finally {
        clearTimeout(timer);
      }
      parser.feed(decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done }));
      if (result.done) break;
    }
    parser.finish();
  } finally {
    controller.abort();
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
