// Local operator check: compare server secrets without ever printing them.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
process.loadEnvFile();
try {
  process.loadEnvFile('.env.local');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const secrets = Object.entries(process.env)
  .filter(([name]) =>
    /^(OPENROUTER_API_KEY|OPENAI_API_KEY|VERCEL_OIDC_TOKEN|SESSION_SECRET|TURSO_AUTH_TOKEN|TURSO_DATABASE_URL|DATABASE_URL)$/.test(
      name,
    ),
  )
  .map(([, value]) => value)
  .filter((value): value is string => Boolean(value && value.length > 10));
if (!secrets.length) throw new Error('SERVER_KEY_NOT_CONFIGURED');
let files = 0,
  leaks = 0;
const visit = (path: string) => {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) visit(join(path, entry));
    return;
  }
  files++;
  const data = readFileSync(path);
  if (secrets.some((secret) => data.includes(Buffer.from(secret)))) leaks++;
};
for (const path of [
  'api',
  'src',
  'tests',
  'scripts',
  'docs',
  'deliverables',
  'dist/web',
  'README.md',
  '.env.example',
  'package.json',
  'pnpm-lock.yaml',
])
  visit(path);
console.log(JSON.stringify({ scannedFiles: files, credentialLeaks: leaks }));
if (leaks) process.exitCode = 1;
