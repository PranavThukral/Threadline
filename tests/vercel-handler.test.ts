import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createHandler } from '../api/index.js';
import { createApp } from '../src/api.js';
import { RuntimeStore } from '../src/store.js';
import { threads } from '../src/fixtures.js';

describe('Hosted HTTP adapter', () => {
  it('shares its warm session and preserves progressive SSE responses', async () => {
    const app = await createApp({
      store: new RuntimeStore(':memory:'),
      live: false,
      logger: false,
    });
    let starts = 0;
    const handler = createHandler(async () => {
      starts++;
      return app;
    });
    const server = createServer((request, response) => {
      void handler(request, response);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const session = await fetch(`${base}/api/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const cookie = session.headers.get('set-cookie')!.split(';')[0];
      expect(session.status).toBe(200);
      const response = await fetch(`${base}/api/v1/threads/${threads[0].id}/replies`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({
          threadVersion: threads[0].version,
          mode: 'recorded',
          intent: 'acknowledge',
          facts: [],
        }),
      });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      let text = '',
        chunks = 0;
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        chunks++;
        text += decoder.decode(chunk.value, { stream: true });
      }
      expect(chunks).toBeGreaterThan(1);
      expect(text).toContain('draft.delta');
      expect(text).toContain('draft.completed');
      expect((await fetch(`${base}/readyz`)).status).toBe(200);
      expect(starts).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.close();
    }
  });
  it('returns a safe error for startup failure and allows a later retry', async () => {
    const app = await createApp({
      store: new RuntimeStore(':memory:'),
      live: false,
      logger: false,
    });
    let starts = 0;
    const handler = createHandler(async () => {
      if (!starts++) throw new Error('private database detail');
      return app;
    });
    const server = createServer((request, response) => {
      void handler(request, response);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const failed = await fetch(`${base}/readyz`);
      expect(failed.status).toBe(503);
      const body = await failed.text();
      expect(body).toContain('SERVICE_UNAVAILABLE');
      expect(body).not.toContain('private database detail');
      expect((await fetch(`${base}/readyz`)).status).toBe(200);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.close();
    }
  });
});
