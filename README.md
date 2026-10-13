# Threadline

**Live demo:** https://threadline-five-rust.vercel.app

An email action workbench for inspecting requests, checking their source, and deciding the next step. A deep-ink-and-jade workspace presents the inbox, original mail, actionable overview and reviewed reply. Ten example scenarios and one appended-reply scenario run without an API key. New mail accepts your own incoming message; Fetch overview and reply generation use the configured live model. Current notes override earlier availability, and changed drafting inputs require an update before review/copy. The application does not send mail or connect to an inbox.

## Run

Use Node 24 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open http://localhost:3000. For development, `pnpm dev` runs the API and Vite together; open http://localhost:5173. A server-only `.env` is loaded at startup. The deployed app uses direct xAI Grok 4.3 through the Vercel AI SDK, with reasoning disabled, standard processing, no retries/model fallback and response storage disabled. Copy `.env.example`, add `XAI_API_KEY` and shared Turso credentials, then set `LIVE_AI_ENABLED=true`. Paid previews and deployments share a $0.25/day and $4 total application budget. Verified rates are $1.25/M input, $0.20/M cached input and $2.50/M output. Optional OpenRouter is selected explicitly with `AI_PROVIDER=openrouter` and retains its exact free-model/zero-price guards. Example overviews load immediately; switching mails does not automatically call the provider. See [deployment](docs/deployment.md).

## Review in three minutes

1. Recruiter coordination: inspect an action's exact evidence, draft an acknowledgment, edit, review, and copy.
2. Waiting on a reply: press F, confirm a local follow-up, then append the synthetic reply. The source version and next action change; the old reminder is flagged for review.
3. Long project history and prompt injection: inspect coverage warnings and the source text. Review [the employer walkthrough](docs/demo-script.md).
4. New mail: enter an example incoming message. Inspect its live overview, supply facts for an answer, generate, review, and copy. The guide is optional and stays dismissed after closing. Populated overview sections appear before disabled empty sections.

The inbox starts with three unread incoming mails sorted first, using blue dots/bars and bold text. Opening one marks its source version read and persists that state. Read mails use normal-weight text. Mail previews and headers expand the full paragraph-based message; source inspection expands and highlights it. Inter body text and Krub headings are self-hosted. The right panel has one “Next Step” heading without horizontal divider bars. Failed Fetch stays visible with an explicit retry. Draft reply opens the notes composer without spending a model request. Generate from notes is the primary action; changing notes moves the previous draft out of the active editor. Provider failures preserve the notes and never generate a default replacement. Reconnecting live AI also preserves the notes.

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

React 19, TypeScript, Vite, plain CSS and Lucide; Fastify 5; strict Zod 4 contracts; Vercel AI SDK 7 with direct xAI streaming, plus optional OpenRouter and legacy OpenAI adapters; eventsource-parser; native SQLite for unfunded local demos and shared Turso SQLite for paid previews/Vercel for sessions, admission limits, costs, caches, runs and metrics; native IndexedDB for browser decisions with a localStorage fallback. Added mails are scoped to the signed session and expire within 24 hours. Turso shares them across API instances; unfunded native-SQLite previews hold them in memory. Reply notes and drafts remain in tab memory. See [architecture](docs/architecture.md).

The build uses separate client and server directories. Native SQLite requires one server instance with a persistent volume; Vercel uses shared database transactions and does not rely on a local file. Cached reads do not consume live requests. Each visit allows 12 provider attempts per hour and 24 per day, with a shared 250-attempt ceiling for xAI, 40 for optional OpenRouter, and clear reset times. Paid xAI previews require the same Turso database as production. Transactions enforce $0.25/day and $4 total caps, including concurrent reservations. Pruned cost rows roll into a permanent aggregate so reset/pruning cannot erase the total budget. API outages fall back to the bundled example corpus when frontend assets are available. There is no service worker guaranteeing a new offline page load.

[Current reply-quality and palette update](deliverables/Email-Center-Reply-Quality-and-Color-Update.md) supersedes the reply/palette descriptions in the [previous unread and latency update](deliverables/Email-Center-Read-State-and-Latency-Update.md). The original specification and audits remain historical references. The notes-first composer and failure/reconnection flow are covered by automated tests; the xAI adapter adds coverage for streaming, current notes, usage settlement and budget archival. On 2026-10-13 the hosted API verified added mail → live overview → streamed reply using current facts, SQLite cache reuse, cross-session isolation, reset and settled runs. That sampled reply completed in 791 ms with a first delta at 379 ms; the overview took 11.9 s. These are observations, not latency guarantees. Fresh rendered-browser review and a broad model-quality benchmark remain outstanding.

Manual live checks make real free-model requests and are deliberately excluded from automated tests: `pnpm exec tsx scripts/probe-openrouter.ts` checks grounding and provider-reported usage; `pnpm exec tsx scripts/verify-live.ts [baseURL]` checks added mail → live overview → reply using supplied facts against the local server or a deployment. Neither prints credentials or raw provider errors. OpenRouter's free allowance applies across free models; daily-limit failures include the provider's reset timestamp when supplied. The application does not bypass that external quota or switch to paid inference.

The [45-second recruiter walkthrough](deliverables/Email-Center-45-Second-Walkthrough.md) includes a spoken script, click sequence and expected results. `pnpm exec tsx scripts/verify-shared-store.ts` checks the provisioned Turso database across separate connections without a model call.
