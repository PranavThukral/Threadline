# Threadline

An email action workbench for inspecting requests, checking their source, and deciding the next step. A deep-ink-and-jade workspace presents the inbox, original mail, actionable overview and reviewed reply. Ten example scenarios and one appended-reply scenario run without an API key. New mail accepts your own incoming message; Fetch overview and reply generation use the configured live model. Current notes override earlier availability, and changed drafting inputs require an update before review/copy. The application does not send mail or connect to an inbox.

## Run

Use Node 24 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open http://localhost:3000. For development, `pnpm dev` runs the API and Vite together; open http://localhost:5173. A server-only `.env` is loaded at startup. Copy `.env.example`, add `OPENROUTER_API_KEY`, and set `LIVE_AI_ENABLED=true` to enable NVIDIA Nemotron 3.5 Lightning free. Every request has zero price ceilings and no automatic model fallback. The original Ultra free model is accepted only when explicitly configured. Example overviews load immediately; switching mails does not automatically call the provider. See [deployment](docs/deployment.md).

## Review in three minutes

1. Recruiter coordination: inspect an action's exact evidence, draft an acknowledgment, edit, review, and copy.
2. Waiting on a reply: press F, confirm a local follow-up, then append the synthetic reply. The source version and next action change; the old reminder is flagged for review.
3. Long project history and prompt injection: inspect coverage warnings and the source text. Review [the employer walkthrough](docs/demo-script.md).
4. New mail: enter an example incoming message. Inspect its live overview, supply facts for an answer, generate, review, and copy. The guide is optional and stays dismissed after closing. Populated overview sections appear before disabled empty sections.

The inbox starts with three unread incoming mails sorted first, using blue dots/bars and bold text. Opening one marks its source version read and persists that state. Read mails use normal-weight text. Mail previews and headers expand the full paragraph-based message; source inspection expands and highlights it. Inter body text and Krub headings are self-hosted. The right panel has one “Next Step” heading without horizontal divider bars. Failed Fetch stays visible with an explicit retry.

## Verify

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm fixtures:validate
pnpm test
pnpm build
pnpm smoke:built
pnpm benchmark:built
pnpm audit --prod
```

The benchmark writes raw local HTTP timings, corpus checks, and source hashes to `deliverables/verification/`. These are recorded-mode timings, not measured provider performance or time saved.

## Actual implementation

React 19, TypeScript, Vite, plain CSS and Lucide; Fastify 5; strict Zod 4 contracts; official OpenRouter SDK with streaming and a legacy OpenAI Responses adapter; eventsource-parser; Node 24 SQLite locally and shared Turso SQLite on Vercel for sessions, admission limits, costs, caches, runs and metrics; native IndexedDB for browser decisions with a localStorage fallback. Added mails are scoped to the signed session and expire within 24 hours. The local preview holds them in memory; hosted instances share them through Turso. Reply notes and drafts remain in tab memory. See [architecture](docs/architecture.md).

The build uses separate client and server directories. Native SQLite requires one server instance with a persistent volume; Vercel uses shared database transactions and does not rely on a local file. Cached reads do not consume live requests. Each visit allows 12 provider attempts per hour and 24 per day, with a shared 40-attempt daily ceiling and clear reset times. API outages fall back to the bundled example corpus when frontend assets are available. There is no service worker guaranteeing a new offline page load.

[Current reply-quality and palette update](deliverables/Email-Center-Reply-Quality-and-Color-Update.md) supersedes the reply/palette descriptions in the [previous unread and latency update](deliverables/Email-Center-Read-State-and-Latency-Update.md). The original specification and audits remain historical references. Broad model-quality evaluation and hosted/container verification remain outstanding.

Manual live checks make real free-model requests and are deliberately excluded from automated tests: `pnpm exec tsx scripts/probe-openrouter.ts` checks grounding and provider-reported usage; `pnpm exec tsx scripts/verify-live.ts` checks added mail → live overview → reply using supplied facts against the running local server. Neither prints credentials or raw provider errors.

The [45-second recruiter walkthrough](deliverables/Email-Center-45-Second-Walkthrough.md) includes a spoken script, click sequence and expected results. `pnpm exec tsx scripts/verify-shared-store.ts` checks the provisioned Turso database across separate connections without a model call.
