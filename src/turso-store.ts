import { createClient } from '@libsql/client/web';
import type { Client, InValue, Transaction } from '@libsql/client/web';
import { randomBytes } from 'node:crypto';
import type { RuntimeStore } from './store.js';
import type { Thread } from './domain.js';

type Connection = Client | Transaction;
type Run = Parameters<RuntimeStore['begin']>[0];
type PrivateMail = { session: string; thread: Thread; expires: number };

/** Shared storage for stateless hosts. Local development retains native SQLite. */
export class TursoStore {
  constructor(readonly db: Client) {}
  static async connect() {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)
      throw new Error('TURSO_NOT_CONFIGURED');
    const store = new TursoStore(
      createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
    );
    await store.initialize();
    return store;
  }
  private async rows<T>(sql: string, args: InValue[] = [], connection: Connection = this.db) {
    const result = await connection.execute({ sql, args });
    return result.rows.map(
      (row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])) as T,
    );
  }
  private async one<T>(sql: string, args: InValue[] = [], connection: Connection = this.db) {
    return (await this.rows<T>(sql, args, connection))[0];
  }
  async initialize() {
    await this.db.batch(
      [
        'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, session TEXT NOT NULL, key TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, kind TEXT NOT NULL, thread TEXT NOT NULL, version TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER, error TEXT)',
        'CREATE TABLE IF NOT EXISTS costs (run TEXT PRIMARY KEY, session TEXT NOT NULL, day TEXT NOT NULL, amount REAL NOT NULL, pending INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, session TEXT NOT NULL, value TEXT NOT NULL, created INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS scenarios (session TEXT NOT NULL, thread TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY(session, thread))',
        'CREATE TABLE IF NOT EXISTS private_mails (id TEXT PRIMARY KEY, session TEXT NOT NULL, value TEXT NOT NULL, expires INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS private_cache (key TEXT PRIMARY KEY, session TEXT NOT NULL, value TEXT NOT NULL, created INTEGER NOT NULL)',
        'CREATE INDEX IF NOT EXISTS runs_session ON runs(session,status)',
        'CREATE INDEX IF NOT EXISTS costs_day ON costs(day)',
        'CREATE INDEX IF NOT EXISTS private_mails_session ON private_mails(session)',
      ],
      'write',
    );
    // Another warm function may still be serving these runs. Only expired leases recover.
    await this.prune();
  }
  async secret() {
    await this.db.execute({
      sql: "INSERT OR IGNORE INTO meta VALUES ('session_secret', ?)",
      args: [randomBytes(32).toString('hex')],
    });
    return (await this.one<{ value: string }>("SELECT value FROM meta WHERE key='session_secret'"))!
      .value;
  }
  async prune() {
    const now = Date.now(),
      cutoff = now - 7 * 86400000;
    await this.db.batch(
      [
        {
          sql: "UPDATE costs SET pending=0 WHERE run IN (SELECT id FROM runs WHERE status='running' AND started<?)",
          args: [now - 120000],
        },
        {
          sql: "UPDATE runs SET status='failed',error='RUN_EXPIRED',ended=? WHERE status='running' AND started<?",
          args: [now, now - 120000],
        },
        { sql: 'DELETE FROM sessions WHERE expires<?', args: [now] },
        'DELETE FROM scenarios WHERE session NOT IN (SELECT id FROM sessions)',
        { sql: "DELETE FROM runs WHERE started<? AND status!='running'", args: [cutoff] },
        { sql: 'DELETE FROM cache WHERE created<?', args: [cutoff] },
        { sql: 'DELETE FROM metrics WHERE created<?', args: [now - 86400000] },
        {
          sql: 'DELETE FROM costs WHERE day<?',
          args: [new Date(cutoff).toISOString().slice(0, 10)],
        },
        { sql: 'DELETE FROM private_mails WHERE expires<?', args: [now] },
        {
          sql: 'DELETE FROM private_cache WHERE created<? OR session NOT IN (SELECT id FROM sessions)',
          args: [now - 3600000],
        },
      ],
      'write',
    );
  }
  async createSession(id: string, expires: number) {
    const tx = await this.db.transaction('write');
    try {
      const count = await this.one<{ total: number; hourly: number }>(
        'SELECT count(*) AS total,sum(CASE WHEN expires>? THEN 1 ELSE 0 END) AS hourly FROM sessions WHERE expires>?',
        [Date.now() + 23 * 3600000, Date.now()],
        tx,
      );
      if (Number(count?.total) >= 1000 || Number(count?.hourly) >= 60) {
        await tx.rollback();
        return false;
      }
      await tx.execute({ sql: 'INSERT INTO sessions VALUES (?,?)', args: [id, expires] });
      await tx.commit();
      return true;
    } finally {
      tx.close();
    }
  }
  session(id: string) {
    return this.one<{ id: string; expires: number }>(
      'SELECT * FROM sessions WHERE id=? AND expires>?',
      [id, Date.now()],
    );
  }
  async scenario(session: string, thread: string) {
    return (
      await this.one<{ version: string }>(
        'SELECT version FROM scenarios WHERE session=? AND thread=?',
        [session, thread],
      )
    )?.version;
  }
  async append(session: string, thread: string, version: string) {
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO scenarios VALUES (?,?,?)',
      args: [session, thread, version],
    });
  }
  async resetScenarios(session: string) {
    await this.db.execute({ sql: 'DELETE FROM scenarios WHERE session=?', args: [session] });
  }
  prior(key: string) {
    return this.one<Record<string, string>>('SELECT * FROM runs WHERE key=?', [key]);
  }
  run(id: string, session: string) {
    return this.one<Record<string, string | number | null>>(
      'SELECT * FROM runs WHERE id=? AND session=?',
      [id, session],
    );
  }
  async begin(
    run: Run,
    maxCost: number,
    providerAttempt = run.mode === 'live' && maxCost > 0,
    dailyProviderLimit = 250,
  ) {
    const tx = await this.db.transaction('write'),
      now = Date.now(),
      day = new Date(now).toISOString().slice(0, 10);
    try {
      await tx.execute({
        sql: "UPDATE runs SET status='failed',error='RUN_EXPIRED',ended=? WHERE status='running' AND started<?",
        args: [now, now - 120000],
      });
      const counts = await this.one<{
        sessionActive: number;
        globalActive: number;
        analysisActive: number;
        daily: number;
        hourly: number;
        globalDaily: number;
        spend: number;
        retained: number;
      }>(
        `SELECT
        (SELECT count(*) FROM runs WHERE session=? AND status='running') AS sessionActive,
        (SELECT count(*) FROM runs JOIN costs ON costs.run=runs.id WHERE runs.status='running') AS globalActive,
        (SELECT count(*) FROM runs JOIN costs ON costs.run=runs.id WHERE runs.kind='analyze' AND runs.thread=? AND runs.version=? AND runs.status='running') AS analysisActive,
        (SELECT count(*) FROM costs WHERE session=? AND day=?) AS daily,
        (SELECT count(*) FROM runs JOIN costs ON costs.run=runs.id WHERE costs.session=? AND runs.started>?) AS hourly,
        (SELECT count(*) FROM costs WHERE day=?) AS globalDaily,
        (SELECT COALESCE(sum(amount),0) FROM costs WHERE day=?) AS spend,
        (SELECT count(*) FROM runs WHERE session=?) AS retained`,
        [
          run.session,
          run.thread,
          run.version,
          run.session,
          day,
          run.session,
          now - 3600000,
          day,
          day,
          run.session,
        ],
        tx,
      );
      let error: string | null = null;
      if (Number(counts!.sessionActive) >= 2) error = 'SESSION_CONCURRENCY';
      if (providerAttempt) {
        if (Number(counts!.globalActive) >= 4) error = 'GLOBAL_CONCURRENCY';
        if (run.kind === 'analyze' && Number(counts!.analysisActive) >= 1)
          error = 'ANALYSIS_CONCURRENCY';
        if (Number(counts!.daily) >= 24) error = 'SESSION_ATTEMPTS';
        if (Number(counts!.hourly) >= 12) error = 'SESSION_HOURLY_ATTEMPTS';
        if (Number(counts!.globalDaily) >= dailyProviderLimit) error = 'GLOBAL_ATTEMPTS';
        if (Number(counts!.spend) + maxCost > 5) error = 'GLOBAL_BUDGET';
      }
      if (Number(counts!.retained) >= 500) error = 'SESSION_RUN_LIMIT';
      if (error) {
        await tx.rollback();
        return error;
      }
      await tx.execute({
        sql: 'INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL)',
        args: [
          run.id,
          run.session,
          run.key,
          run.hash,
          run.kind,
          run.thread,
          run.version,
          run.mode,
          'running',
          now,
        ],
      });
      if (providerAttempt)
        await tx.execute({
          sql: 'INSERT INTO costs VALUES (?,?,?,?,1)',
          args: [run.id, run.session, day, maxCost],
        });
      await tx.commit();
      return null;
    } finally {
      tx.close();
    }
  }
  async retryAfter(code: string, session: string) {
    if (code === 'SESSION_HOURLY_ATTEMPTS') {
      const row = await this.one<{ started: number | null }>(
        'SELECT min(runs.started) AS started FROM runs JOIN costs ON costs.run=runs.id WHERE costs.session=? AND runs.started>?',
        [session, Date.now() - 3600000],
      );
      return Math.max(
        1,
        Math.ceil(((Number(row?.started) || Date.now()) + 3600000 - Date.now()) / 1000),
      );
    }
    if (['SESSION_ATTEMPTS', 'GLOBAL_ATTEMPTS', 'GLOBAL_BUDGET'].includes(code))
      return Math.max(
        1,
        Math.ceil(
          (Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) +
            86400000 -
            Date.now()) /
            1000,
        ),
      );
    return code.includes('CONCURRENCY') ? 2 : null;
  }
  async finish(id: string, status: string, error: string | null, actualCost?: number) {
    await this.db.batch(
      [
        {
          sql: 'UPDATE runs SET status=?,error=?,ended=? WHERE id=?',
          args: [status, error, Date.now(), id],
        },
        actualCost === undefined
          ? { sql: 'UPDATE costs SET pending=0 WHERE run=?', args: [id] }
          : { sql: 'UPDATE costs SET amount=?,pending=0 WHERE run=?', args: [actualCost, id] },
      ],
      'write',
    );
  }
  async cached(key: string) {
    const row = await this.one<{ value: string; created: number }>(
      'SELECT value,created FROM cache WHERE key=? AND created>?',
      [key, Date.now() - 7 * 86400000],
    );
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value) as unknown, created: Number(row.created) };
    } catch {
      await this.deleteCache(key);
      return null;
    }
  }
  async cache(key: string, value: unknown) {
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO cache VALUES (?,?,?)',
      args: [key, JSON.stringify(value), Date.now()],
    });
  }
  async deleteCache(key: string) {
    await this.db.execute({ sql: 'DELETE FROM cache WHERE key=?', args: [key] });
  }
  async addMetrics(session: string, events: { id: string }[]) {
    await this.db.batch(
      [
        ...events.map((event) => ({
          sql: 'INSERT OR IGNORE INTO metrics VALUES (?,?,?,?)',
          args: [event.id, session, JSON.stringify(event), Date.now()],
        })),
        {
          sql: 'DELETE FROM metrics WHERE session=? AND id NOT IN (SELECT id FROM metrics WHERE session=? ORDER BY created DESC LIMIT 200)',
          args: [session, session],
        },
        'DELETE FROM metrics WHERE id NOT IN (SELECT id FROM metrics ORDER BY created DESC LIMIT 2000)',
      ],
      'write',
    );
  }
  async metrics(session: string) {
    return (
      await this.rows<{ value: string }>(
        'SELECT value FROM metrics WHERE session=? ORDER BY created DESC LIMIT 200',
        [session],
      )
    ).map((row) => JSON.parse(row.value) as Record<string, unknown>);
  }
  async ready() {
    return Boolean(await this.one('SELECT 1'));
  }
  close() {
    this.db.close();
  }
  async mails(session: string) {
    return (
      await this.rows<{ value: string; expires: number }>(
        'SELECT value,expires FROM private_mails WHERE session=? AND expires>?',
        [session, Date.now()],
      )
    ).map((row) => ({
      session,
      thread: JSON.parse(row.value) as Thread,
      expires: Number(row.expires),
    }));
  }
  async mail(id: string, session: string) {
    const row = await this.one<{ value: string; expires: number }>(
      'SELECT value,expires FROM private_mails WHERE id=? AND session=? AND expires>?',
      [id, session, Date.now()],
    );
    return row
      ? { session, thread: JSON.parse(row.value) as Thread, expires: Number(row.expires) }
      : undefined;
  }
  async addMail(entry: PrivateMail) {
    const tx = await this.db.transaction('write');
    try {
      const counts = await this.one<{ total: number; own: number }>(
        'SELECT count(*) AS total,sum(CASE WHEN session=? THEN 1 ELSE 0 END) AS own FROM private_mails WHERE expires>?',
        [entry.session, Date.now()],
        tx,
      );
      if (Number(counts?.total) >= 200 || Number(counts?.own) >= 10) {
        await tx.rollback();
        return false;
      }
      await tx.execute({
        sql: 'INSERT INTO private_mails VALUES (?,?,?,?)',
        args: [entry.thread.id, entry.session, JSON.stringify(entry.thread), entry.expires],
      });
      await tx.commit();
      return true;
    } finally {
      tx.close();
    }
  }
  async resetMails(session: string) {
    await this.db.batch(
      [
        { sql: 'DELETE FROM private_cache WHERE session=?', args: [session] },
        { sql: 'DELETE FROM private_mails WHERE session=?', args: [session] },
      ],
      'write',
    );
  }
  async cachedPrivate(key: string) {
    const row = await this.one<{ value: string; created: number }>(
      'SELECT value,created FROM private_cache WHERE key=? AND created>?',
      [key, Date.now() - 3600000],
    );
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value) as unknown, created: Number(row.created) };
    } catch {
      return null;
    }
  }
  async cachePrivate(key: string, session: string, value: unknown) {
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO private_cache VALUES (?,?,?,?)',
      args: [key, session, JSON.stringify(value), Date.now()],
    });
  }
  async deletePrivateCache(key: string) {
    await this.db.execute({ sql: 'DELETE FROM private_cache WHERE key=?', args: [key] });
  }
}
