# Deployment

The app supports local native SQLite and shared Turso SQLite for Vercel. Node 24 is required. `pnpm build` produces the Fastify server in `dist/api` and the React assets in `dist/web`.

## Vercel

The linked project is `threadline` in `pranavthukralpt-9138s-projects`. Its Git repository is [PranavThukral/Threadline](https://github.com/PranavThukral/Threadline).

`vercel.json` publishes `dist/web` through Vercel's static delivery and routes API/readiness requests to the Node function in `api/index.ts`, with a 120-second duration. The adapter reuses a warm Fastify app and waits until the SSE response ends or disconnects. Hosted startup requires Turso and fails explicitly if its database configuration is absent; it never falls back to a temporary local database. Document and asset security headers are configured at the hosting layer.

The provisioned Turso database uses the Starter plan listed at $0/month, in iad1. Shared write transactions enforce provider admission across instances. Sessions, fixture caches, run metadata and attempt counts survive cold starts. Added example mail is scoped to its session and expires after at most 24 hours; its overview cache expires after one hour. Reset removes both. Reply notes and drafts remain in browser tab memory and are not stored in the database.

| Variable                              | Hosting behavior                                                     |
| ------------------------------------- | -------------------------------------------------------------------- |
| TURSO_DATABASE_URL / TURSO_AUTH_TOKEN | Server-only database connection, supplied by the Vercel integration  |
| OPENROUTER_API_KEY                    | Server-only Secret in production and preview                         |
| XAI_API_KEY                           | Server-only Secret in production and preview                         |
| XAI_MODEL                             | grok-4.3; other model IDs are rejected                               |
| AI_PROVIDER                           | xai; optional openrouter selected explicitly                         |
| LIVE_AI_ENABLED                       | true after verification                                              |
| OPENROUTER_MODEL                      | nvidia/nemotron-3.5-lightning:free                                   |
| APP_ORIGIN                            | Optional explicit HTTPS origin; default uses Vercel's production URL |
| SESSION_SECRET                        | Optional Secret; blank uses a shared random database secret          |
| BUILD_SHA                             | Optional build identifier; otherwise Vercel's Git commit SHA         |
| DATABASE_PATH                         | Used only for native SQLite hosting                                  |

The Vercel deployment URL is also allowed as an origin so previews can use the API. Cookies use Secure on HTTPS. The provider stream has a 90-second deadline, within the function duration, and is cancelled when its client connection closes.

Create/reuse the exact linked project before deploying. Add secrets through stdin or the connector secret-management tools, never CLI value arguments. Local `.env`, `.env.local`, databases and relocation backups are excluded from both Git and Vercel uploads. The key must never use a VITE_ prefix.

Deploy a preview, verify it, then deploy production. Test anonymous access to the production URL so the recruiter can open it. Keep preview protection enabled and use authenticated Vercel tools for protected checks.

## Allowances

Each browser can make 12 provider attempts per rolling hour and 24 per UTC day. The deployment admits at most 40 OpenRouter attempts per UTC day. Cached/recorded reads do not consume these allowances. Limit responses provide Retry-After and distinguish the browser limit from the shared daily allowance. Failed provider calls still count as attempts.

The primary xAI provider admits at most 250 attempts per day, subject to tighter $0.25/day and $4 total application budgets. Paid local previews require the same Turso database as production. The total budget includes a permanent archive of pruned charges. Settled usage uses Grok 4.3's verified $1.25/M input, $0.20/M cached-input and $2.50/M output rates. Reasoning, priority processing, response storage, tools and automatic retries/model fallback are disabled. See [xAI pricing](https://docs.x.ai/developers/models/grok-4.3). These caps do not control other applications using the same API account.

Optional OpenRouter separately limits the free account across every application using the key; local previews and manual probes also count. App limits cannot reset a provider's allowance. Its requests use the exact free model and zero prompt/completion/request price ceilings, with no paid fallback. See [OpenRouter pricing](https://openrouter.ai/pricing/).

Before the first hosted release, `pnpm exec tsx scripts/import-local-allowance.ts` imports known local provider attempts into Turso without copying session secrets or mail. It is idempotent and retains the seven-day ledger. Development probes after migration still consume the provider account's allowance even when made outside the hosted app.

## Verify

Run typecheck, lint, format, fixtures, tests, production build and the built smoke check before release. Automated tests need no provider credentials. `scripts/verify-shared-store.ts` checks the actual provisioned database using two separate connections and example content, without making model calls.

Hosted verification must check health/readiness, signed cookies, the inbox and static assets, added mail, actual analysis and streamed reply completion, a cached replay without another attempt, cross-session isolation and reset. Verify terminal events and persisted run status. Local or recorded timings do not establish hosted provider latency.

## Local / container hosting

Local `pnpm start` loads the ignored `.env`. Without Turso variables, native SQLite defaults to `./data/threadline.sqlite`. Exactly one process must own that file. The Dockerfile uses Node 24 and builds the compiled server/client. Mount a persistent writable volume at `/app/data`, set HOST=0.0.0.0 and APP_ORIGIN to the public HTTPS URL, and keep one replica. Back up SQLite consistently including its WAL; never copy a live file as an assumed consistent backup.

The container has not been built on this Windows machine. Hosted behavior must be evaluated separately from local tests. This portfolio demo does not connect to or send mail.
