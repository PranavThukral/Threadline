import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export class RuntimeStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, session TEXT NOT NULL, key TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, kind TEXT NOT NULL, thread TEXT NOT NULL, version TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER, error TEXT);
      CREATE TABLE IF NOT EXISTS costs (run TEXT PRIMARY KEY, session TEXT NOT NULL, day TEXT NOT NULL, amount REAL NOT NULL, pending INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, session TEXT NOT NULL, value TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS scenarios (session TEXT NOT NULL, thread TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY(session, thread));
      CREATE INDEX IF NOT EXISTS runs_session ON runs(session, status);
      CREATE INDEX IF NOT EXISTS costs_day ON costs(day);
      CREATE INDEX IF NOT EXISTS metrics_session ON metrics(session, created);`);
    // Unknown usage from an interrupted process retains its maximum reservation.
    this.db.exec(
      "UPDATE costs SET pending=0 WHERE pending=1; UPDATE runs SET status='failed', error='SERVER_RESTART', ended=strftime('%s','now')*1000 WHERE status='running';",
    );
    this.prune();
  }
  secret() {
    this.db
      .prepare("INSERT OR IGNORE INTO meta VALUES ('session_secret', ?)")
      .run(randomBytes(32).toString('hex'));
    return (
      this.db.prepare("SELECT value FROM meta WHERE key='session_secret'").get() as {
        value: string;
      }
    ).value;
  }
  prune() {
    const cutoff = Date.now() - 7 * 86400000;
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    this.db.exec('DELETE FROM scenarios WHERE session NOT IN (SELECT id FROM sessions)');
    this.db.prepare("DELETE FROM runs WHERE started < ? AND status != 'running'").run(cutoff);
    this.db.prepare('DELETE FROM cache WHERE created < ?').run(cutoff);
    this.db.prepare('DELETE FROM metrics WHERE created < ?').run(Date.now() - 86400000);
    this.db
      .prepare('DELETE FROM costs WHERE day < ?')
      .run(new Date(cutoff).toISOString().slice(0, 10));
  }
  createSession(id: string, expires: number) {
    this.prune();
    if (
      Number((this.db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n) >=
      1000
    )
      return false;
    if (
      Number(
        (
          this.db
            .prepare('SELECT count(*) AS n FROM sessions WHERE expires > ?')
            .get(Date.now() + 23 * 3600000) as { n: number }
        ).n,
      ) >= 60
    )
      return false;
    this.db.prepare('INSERT INTO sessions VALUES (?, ?)').run(id, expires);
    return true;
  }
  session(id: string) {
    return this.db
      .prepare('SELECT * FROM sessions WHERE id=? AND expires > ?')
      .get(id, Date.now()) as { id: string; expires: number } | undefined;
  }
  scenario(session: string, thread: string) {
    return (
      this.db
        .prepare('SELECT version FROM scenarios WHERE session=? AND thread=?')
        .get(session, thread) as { version: string } | undefined
    )?.version;
  }
  append(session: string, thread: string, version: string) {
    this.db
      .prepare('INSERT OR REPLACE INTO scenarios VALUES (?, ?, ?)')
      .run(session, thread, version);
  }
  resetScenarios(session: string) {
    this.db.prepare('DELETE FROM scenarios WHERE session=?').run(session);
  }
  prior(key: string) {
    return this.db.prepare('SELECT * FROM runs WHERE key=?').get(key) as
      Record<string, string> | undefined;
  }
  run(id: string, session: string) {
    return this.db.prepare('SELECT * FROM runs WHERE id=? AND session=?').get(id, session);
  }
  begin(
    run: {
      id: string;
      session: string;
      key: string;
      hash: string;
      kind: string;
      thread: string;
      version: string;
      mode: string;
    },
    maxCost: number,
    providerAttempt = run.mode === 'live' && maxCost > 0,
    dailyProviderLimit = 250,
  ) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const count = (sql: string, ...args: (string | number)[]) =>
        Number((this.db.prepare(sql).get(...args) as { n: number }).n);
      const day = new Date().toISOString().slice(0, 10);
      let error: string | null = null;
      if (
        count("SELECT count(*) AS n FROM runs WHERE session=? AND status='running'", run.session) >=
        2
      )
        error = 'SESSION_CONCURRENCY';
      if (providerAttempt) {
        if (
          count(
            "SELECT count(*) AS n FROM runs JOIN costs ON costs.run=runs.id WHERE runs.status='running'",
          ) >= 4
        )
          error = 'GLOBAL_CONCURRENCY';
        if (
          count('SELECT count(*) AS n FROM costs WHERE session=? AND day=?', run.session, day) >= 24
        )
          error = 'SESSION_ATTEMPTS';
        if (
          count(
            'SELECT count(*) AS n FROM runs INNER JOIN costs ON costs.run=runs.id WHERE costs.session=? AND runs.started>?',
            run.session,
            Date.now() - 3600000,
          ) >= 12
        )
          error = 'SESSION_HOURLY_ATTEMPTS';
        if (count('SELECT count(*) AS n FROM costs WHERE day=?', day) >= dailyProviderLimit)
          error = 'GLOBAL_ATTEMPTS';
        if (count('SELECT COALESCE(sum(amount),0) AS n FROM costs WHERE day=?', day) + maxCost > 5)
          error = 'GLOBAL_BUDGET';
      }
      if (count('SELECT count(*) AS n FROM runs WHERE session=?', run.session) >= 500)
        error = 'SESSION_RUN_LIMIT';
      if (error) {
        this.db.exec('ROLLBACK');
        return error;
      }
      this.db
        .prepare('INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
        .run(
          run.id,
          run.session,
          run.key,
          run.hash,
          run.kind,
          run.thread,
          run.version,
          run.mode,
          'running',
          Date.now(),
        );
      if (providerAttempt)
        this.db
          .prepare('INSERT INTO costs VALUES (?, ?, ?, ?, 1)')
          .run(run.id, run.session, day, maxCost);
      this.db.exec('COMMIT');
      return null;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  retryAfter(code: string, session: string) {
    if (code === 'SESSION_HOURLY_ATTEMPTS') {
      const row = this.db
        .prepare(
          'SELECT min(runs.started) AS started FROM runs INNER JOIN costs ON costs.run=runs.id WHERE costs.session=? AND runs.started>?',
        )
        .get(session, Date.now() - 3600000) as { started: number | null };
      return Math.max(1, Math.ceil(((row.started ?? Date.now()) + 3600000 - Date.now()) / 1000));
    }
    if (['SESSION_ATTEMPTS', 'GLOBAL_ATTEMPTS', 'GLOBAL_BUDGET'].includes(code)) {
      const tomorrow =
        Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) + 86400000;
      return Math.max(1, Math.ceil((tomorrow - Date.now()) / 1000));
    }
    return code.includes('CONCURRENCY') ? 2 : null;
  }
  finish(id: string, status: string, error: string | null, actualCost?: number) {
    this.db
      .prepare('UPDATE runs SET status=?, error=?, ended=? WHERE id=?')
      .run(status, error, Date.now(), id);
    if (actualCost !== undefined)
      this.db.prepare('UPDATE costs SET amount=?, pending=0 WHERE run=?').run(actualCost, id);
    else this.db.prepare('UPDATE costs SET pending=0 WHERE run=?').run(id);
  }
  cached(key: string) {
    const row = this.db
      .prepare('SELECT * FROM cache WHERE key=? AND created>?')
      .get(key, Date.now() - 7 * 86400000) as { value: string; created: number } | undefined;
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value) as unknown, created: row.created };
    } catch {
      this.deleteCache(key);
      return null;
    }
  }
  cache(key: string, value: unknown) {
    this.db
      .prepare('INSERT OR REPLACE INTO cache VALUES (?, ?, ?)')
      .run(key, JSON.stringify(value), Date.now());
  }
  deleteCache(key: string) {
    this.db.prepare('DELETE FROM cache WHERE key=?').run(key);
  }
  addMetrics(session: string, events: { id: string }[]) {
    const statement = this.db.prepare('INSERT OR IGNORE INTO metrics VALUES (?, ?, ?, ?)');
    for (const event of events) statement.run(event.id, session, JSON.stringify(event), Date.now());
    this.db
      .prepare(
        'DELETE FROM metrics WHERE session=? AND id NOT IN (SELECT id FROM metrics WHERE session=? ORDER BY created DESC LIMIT 200)',
      )
      .run(session, session);
    this.db.exec(
      'DELETE FROM metrics WHERE id NOT IN (SELECT id FROM metrics ORDER BY created DESC LIMIT 2000)',
    );
  }
  metrics(session: string) {
    return (
      this.db
        .prepare('SELECT value FROM metrics WHERE session=? ORDER BY created DESC LIMIT 200')
        .all(session) as { value: string }[]
    ).map((row) => JSON.parse(row.value) as Record<string, unknown>);
  }
  ready() {
    return Boolean(this.db.prepare('SELECT 1').get());
  }
  close() {
    this.db.close();
  }
}
