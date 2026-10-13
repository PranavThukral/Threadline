// Manual check against the provisioned database. Example content only; no model calls.
import { randomUUID } from 'node:crypto';
import { TursoStore } from '../src/turso-store.js';
import { createCustomMail } from '../src/custom-mail.js';

process.loadEnvFile('.env.local');
const id = `verify-${randomUUID()}`,
  cacheKey = `verify-${randomUUID()}`;
let first: TursoStore | undefined, second: TursoStore | undefined;
try {
  first = await TursoStore.connect();
  const secret = await first.secret();
  await first.createSession(id, Date.now() + 60000);
  const request = {
    id: randomUUID(),
    session: id,
    key: randomUUID(),
    hash: 'example',
    kind: 'analyze',
    thread: 'verification',
    version: '1',
    mode: 'recorded',
  };
  if (await first.begin(request, 0, false)) throw new Error('ADMISSION_FAILED');
  const thread = createCustomMail({
    senderName: 'Casey Example',
    senderEmail: 'casey@example.com',
    subject: 'Verify shared storage',
    body: 'Could you confirm video or phone for our conversation?',
  });
  if (!(await first.addMail({ session: id, thread, expires: Date.now() + 60000 })))
    throw new Error('MAIL_CREATE_FAILED');
  await first.cache(cacheKey, { example: true });
  second = await TursoStore.connect();
  if ((await second.secret()) !== secret) throw new Error('SECRET_NOT_SHARED');
  if ((await second.run(request.id, id))?.status !== 'running') throw new Error('ACTIVE_RUN_LOST');
  if ((await second.mail(thread.id, id))?.thread.id !== thread.id)
    throw new Error('MAIL_NOT_SHARED');
  if (await second.mail(thread.id, 'other-session')) throw new Error('MAIL_NOT_ISOLATED');
  if (!(await second.cached(cacheKey))?.value) throw new Error('CACHE_NOT_SHARED');
  await second.finish(request.id, 'completed', null);
  await second.resetMails(id);
  if (await first.mail(thread.id, id)) throw new Error('RESET_NOT_SHARED');
  console.log(
    JSON.stringify({
      status: 'verified',
      sessionSecretShared: true,
      activeRunPreserved: true,
      mailSharedAndIsolated: true,
      cacheShared: true,
      resetShared: true,
    }),
  );
} catch {
  console.error(JSON.stringify({ status: 'failed', code: 'SHARED_STORE_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  const cleanup = second ?? first;
  if (cleanup) {
    await cleanup.resetMails(id);
    await cleanup.deleteCache(cacheKey);
    await cleanup.db.batch(
      [
        { sql: 'DELETE FROM runs WHERE session=?', args: [id] },
        { sql: 'DELETE FROM sessions WHERE id=?', args: [id] },
      ],
      'write',
    );
  }
  first?.close();
  second?.close();
}
