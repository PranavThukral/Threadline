import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/api.js';

export function createHandler(factory: () => Promise<FastifyInstance> = () => createApp()) {
  let startup: Promise<FastifyInstance> | undefined;
  return async function handler(request: IncomingMessage, response: ServerResponse) {
    try {
      const app = await (startup ??= factory()
        .then(async (value) => {
          await value.ready();
          return value;
        })
        .catch((error) => {
          startup = undefined;
          throw error;
        }));
      // Keep the function alive until the streamed response finishes or disconnects.
      await new Promise<void>((resolve) => {
        const done = () => {
          response.off('finish', done);
          response.off('close', done);
          resolve();
        };
        response.once('finish', done);
        response.once('close', done);
        app.server.emit('request', request, response);
      });
    } catch {
      if (!response.headersSent) {
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(
          JSON.stringify({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'The demo is temporarily unavailable. Please retry shortly.',
              retryable: true,
            },
          }),
        );
      } else response.end();
    }
  };
}
export default createHandler();
