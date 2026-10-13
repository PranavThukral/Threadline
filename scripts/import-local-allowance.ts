// One-time release migration: retain the known free-provider attempt ledger.
// Never migrate session secrets, source mail or reply notes.
import { DatabaseSync } from 'node:sqlite';
import { TursoStore } from '../src/turso-store.js';
process.loadEnvFile();
process.loadEnvFile('.env.local');
if (process.env.AI_PROVIDER !== 'openrouter') throw new Error('INCOMPATIBLE_LEDGER');
const local = new DatabaseSync('data/threadline.sqlite', { readOnly: true });
const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const rows = local.prepare('SELECT run,day,amount FROM costs WHERE day>=?').all(cutoff) as {
  run: string;
  day: string;
  amount: number;
}[];
local.close();
let remote: TursoStore | undefined;
try {
  remote = await TursoStore.connect();
  if (rows.length)
    await remote.db.batch(
      rows.map((row) => ({
        sql: 'INSERT OR IGNORE INTO costs VALUES (?,?,?,?,0)',
        args: [`local-preview-${row.run}`, 'local-preview', row.day, row.amount],
      })),
      'write',
    );
  console.log(
    JSON.stringify({
      status: 'migrated',
      knownAttempts: rows.length,
      secretsMigrated: false,
      mailMigrated: false,
    }),
  );
} catch {
  console.error(JSON.stringify({ status: 'failed', code: 'ALLOWANCE_MIGRATION_FAILED' }));
  process.exitCode = 1;
} finally {
  remote?.close();
}
