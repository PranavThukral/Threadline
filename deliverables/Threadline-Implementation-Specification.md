# Executive Decision Summary

**Project:** Threadline — an evidence-backed email action workbench.  
**Purpose:** An independent recruiting proof of work for Superhuman’s Software Engineering Intern, Summer 2027 role.  
**Specification version:** 1.0, October 5, 2026.  
**Status:** Authoritative implementation specification. No application has been implemented, deployed, benchmarked, or evaluated by this document.

Build a compact desktop web application that helps a user understand an email conversation and complete its next action. Its primary workflow is **open thread → inspect an action brief → prepare and copy an accurate reply, or save a follow-up**. AI supports this workflow through typed, source-linked extraction and constrained drafting. There is no conversational chatbot.

The original concept has a strong target but a weak interaction model: five slash commands make the user repeatedly ask for information the application should already organize. Replace that command-driven analysis with one reusable **Action Brief**, containing a short summary, the user’s next actions, other people’s commitments, open questions, and deadlines. Commands navigate and act on this brief; they do not rerun five overlapping prompts.

Make these decisions binding:

| Decision | Required implementation |
|---|---|
| Product boundary | A synthetic email workbench; no email sending or inbox replacement |
| Primary success measure | Time and interactions from opening a thread to copying a reviewed reply or saving a follow-up |
| Email integration | **B: realistic fixtures in P0**; pasted threads are P1; Gmail is excluded from V1 |
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| Backend | Fastify 5 on Node.js 24 LTS; one process and one replica |
| Persistence | SQLite with better-sqlite3 and Drizzle ORM on a Railway persistent volume |
| AI | OpenAI Responses API, pinned `gpt-5.4-mini-2026-03-17`; reasoning effort `none` |
| AI pipeline | Deterministic normalization → one structured extraction → evidence/date validation → cached brief → on-demand streamed reply |
| Transport | SSE framing over a streaming HTTP POST, consumed with `fetch` |
| Demo reliability | Reviewed fixture intelligence and recorded replies bundled into the frontend; clearly separate recorded and live modes |
| Authentication | Public fixtures; signed anonymous session for live API access; no accounts |
| Follow-up | A browser-local reminder that resurfaces inside the app; no background notification promise |
| Scheduling | Excluded from P0; a proposed event preview in P1; no calendar writes |
| Deployment | Railway serves the SPA, API, and SQLite volume from one origin in US East |
| Evaluation | A small human-labeled corpus, deterministic validation, and a separately reported live-model evaluation |

Assume one candidate building this over approximately four focused weeks. Scope gates take priority over that estimate. Aim at desktop users and synthetic English-language business email. Budget production infrastructure at approximately $15–25 per month as a planning allowance, **not a verified provider quote**; configure a separate $5/day application-level live AI ceiling. Do not advertise a measured result until an actual report exists.

In this specification, **MUST** identifies a shipping requirement, **P1/P2** identify deferred work, and **target** identifies a measured performance objective rather than an already achieved result. P0 is the launch boundary. Implementation agents must not add extensions while a P0 acceptance criterion is failing.

# Product Definition

## The problem and the opinionated solution

Email conversations spread requests, decisions, dates, and commitments across messages. Reading the latest message alone often misses the next action; generating a generic summary still leaves the user to reconstruct what to do.

Threadline presents a compact answer to three questions:

1. What changed, and where is the supporting evidence?
2. What should I do, and what am I waiting for?
3. Can I complete that next step without reconstructing the conversation?

The Action Brief is an inspection surface, not an autonomous agent. Every actionable assertion links to a source span. The application distinguishes source statements, interpretations, and unresolved information. A reply is an editable proposal. Completing a local task is a user assertion; copying a reply does not mean an email was sent.

The primary user is a busy individual processing a small queue of threads. The recruiter is a secondary user who needs to discover the experience in under a minute without creating an account, providing credentials, or connecting an inbox.

## Product judgment

| Keep or add | Why it improves the hiring signal |
|---|---|
| One brief per thread/version | Demonstrates coherent domain modeling and avoids redundant inference |
| Exact evidence navigation | Makes accuracy inspectable and creates a useful interaction beyond generated prose |
| Separately modeled task and commitment owners | Demonstrates that requests and promises differ |
| Explicit uncertainty and conservative dates | Shows product judgment under incomplete context |
| Immediate deterministic metadata and recorded fallback | Preserves utility during slow or failed inference |
| Keyboard workflow with measured interaction counts | Connects interface decisions to completion speed |
| Stream cancellation, version checks, bounded concurrency | Demonstrates backend and frontend reliability |
| A labeled eval set and reproducible performance report | Makes engineering claims defensible |

Remove arbitrary questions, voice imitation, inbox-wide search, automatic sending, and five independent analysis commands. They increase cost and ambiguity without improving the core demonstration. A `/summarize` alias should focus the existing brief, and `/tasks` should focus its action list. Neither causes an AI request.

Success does not mean maximizing AI usage. A thread that clearly requires no action should be easy to dismiss without drafting anything.

# Why This Is Relevant to Superhuman

## Researched facts

Research was conducted on October 5, 2026. Older articles below are historical evidence, not claims about Superhuman’s current internal implementation.

| Evidence | What the source establishes |
|---|---|
| [Summer 2027 internship listing](https://jobs.ashbyhq.com/Superhuman%20Platform%20Inc/e6b917b1-325a-47d0-b267-b279b0efdad0) | The current role spans frontend, backend, full-stack, security, and mobile work. It emphasizes an end-to-end engineering challenge, early shipping, iteration, ownership, and communication. It is a platform-wide role, not a confirmed Mail-team placement. |
| [Current Superhuman Mail product page](https://superhuman.com/mail) | Mail emphasizes responsiveness, inbox productivity, AI assistance, reminders, and working with Gmail or Outlook. |
| [Current Email Assistant help](https://help.superhuman.com/hc/en-us/articles/46005854346893-Email-Assistant-by-Superhuman-Mail-Gmail) | Auto Labels, Auto Archive, Auto Drafts, and Auto Reminders integrate assistance into email. That specific help page says its drafts are reviewed and are not automatically sent. |
| [Go 1.0 announcement, August 12, 2026](https://blog.superhuman.com/go-1-0/) | Recent product direction emphasizes proactive assistance in the flow of work instead of repeatedly moving work into a separate chat. |
| [Speed article, June 28, 2022](https://blog.superhuman.com/superhuman-is-built-for-speed/) | Historical Mail guidance discusses sub-100ms interactions, measurement, local caching, preloading likely threads, and minimal animation. This is an interaction philosophy, not evidence that live LLM inference takes 100ms. |
| [Command palette article by Tim Boucher, October 12, 2021](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/) | Public technical/design writing emphasizes a discoverable, globally accessible palette, forgiving matching, context-sensitive commands, and restoring focus. |
| [AI build retrospective by Rahul Vohra, July 19, 2023](https://blog.superhuman.com/how-we-built-superhuman-ai/) | The historical AI launch began with on-demand features before preemptive counterparts, partly because automatic features have higher quality and operating-cost requirements. |

The job page requires JavaScript in a basic web fetch; its description was additionally checked through the employer’s public Ashby job-board API. Do not attribute stack choices in this specification to Superhuman. The listing names several languages, including TypeScript; it does not mandate this project’s architecture.

## Architectural recommendations and recruiting positioning

The recommendations in this document are original project decisions. They translate the researched emphasis on speed and in-flow assistance into a deliberately smaller experiment: source-linked understanding, few-step actions, and honest failure behavior.

The project’s distinctive contribution is the combination of an action-oriented domain model, explicit evidence and uncertainty, transparent cache/version behavior, and measurements of completed workflows. Summarization and drafting alone are common product capabilities and are not sufficient differentiation.

Use independent branding and fictional businesses. Do not copy Superhuman’s visual identity, claim an affiliation, imply access to its internals, or claim that this artifact guarantees team placement or hiring success.

# User Experience

## First visit

The initial screen opens the recruiter-coordination fixture and its reviewed recorded brief. No modal onboarding blocks the interface. A small persistent banner states: **“Synthetic email · Recorded AI demo”**. Beside it, expose **Try live AI**, a shortcut-help button, and **Reset demo** in the palette.

The viewer is fictional **Alex Rivera**. The scenario clock starts at **October 5, 2026, 10:00 AM America/New_York**, independent of the device’s actual date. Display “Scenario time” beside this value. Advancing the scenario clock is an explicit demo command and never changes message timestamps or cached extraction.

The initial brief must make the product obvious: two lines of context, one clear next action, an unanswered question, a visible source link, and a **Draft reply** action with shortcut `R`.

## Primary workflow

1. Navigate to a thread. The message and available brief render immediately from local cache or the reviewed bundle.
2. Inspect “Your next actions,” “Waiting on others,” and “Open questions.” Press `V` on an item to reveal its evidence in the thread.
3. Press `R`. A compact reply panel opens with recipient and intent already selected.
4. Choose **Acknowledge**, **Answer with my facts**, or **Ask for missing information**. Draft creation starts immediately for Acknowledge and Ask; Answer focuses a facts field and requires explicit submission.
5. Watch provisional text stream. On completion, edit and review it. Press `Mod+Enter` once to mark the complete draft reviewed, then again to copy it. A button labeled “Review draft” transitions to “Copy reply” with the same behavior.
6. The copy-success toast says “Reply copied,” never “Sent.” The thread retains its reply-required state.

Other primary outcomes are **Done for now** for an informational thread, **mark a local task complete**, and **save a follow-up**. They work without an LLM.

## Benchmark workflows

An interaction is one intentional command gesture: a chord counts as one, a click counts as one, and typed characters are counted separately. Waiting and reading time are reported separately. Measure the actual executed sequence; do not exclude navigation or review to improve numbers.

| Workflow and starting state | Required path | Gesture target | Latency target, excluding human reading/typing |
|---|---|---:|---|
| Open highlighted thread from focused queue | `Enter` | 1 | Warm thread and brief painted within 100ms p95 |
| Inspect first next-action evidence from thread workspace | `A`, `V` | 2 | Each focus/evidence transition within 100ms p95 |
| Prepare and copy reviewed acknowledgment from open thread | `R`, wait, `Mod+Enter`, `Mod+Enter` | 3 | Panel ≤100ms p95; live first visible text ≤2s p95; complete usable draft ≤8s p95 |
| Save default follow-up from an open waiting thread | `F`, `Enter` | 2 | Preview ≤100ms p95; saved state ≤100ms p95 after confirmation |
| Complete first extracted task | `A`, `Space` | 2 | Optimistic state painted ≤100ms p95; local persistence ≤200ms p95 |
| Process informational thread and move to next | `E`, `J` | 2 | Each transition ≤100ms p95 |
| Discover reply through palette | `Mod+K`, type `rep`, `Enter`, review/copy | 4 gestures + 3 characters | Palette ≤50ms p95; drafting as above |
| Answer an open question with a user-supplied fact | `Shift+R`, type fact, `Mod+Enter`, `Mod+Enter`, `Mod+Enter` | 4 gestures + fact characters | Submission acknowledgment ≤100ms p95; live completion ≤8s p95 |

These targets are hypotheses to verify. Live provider latency is an external dependency; a missed AI target must be disclosed and accompanied by an explicit fallback. No rollout should hide slow requests or report recorded replays as live performance.

# Scope

## P0 — Mandatory

1. Ten synthetic public scenarios plus one append-message variant; all required categories in Fixtures below.
2. Three-region desktop workspace with keyboard and pointer parity.
3. Reviewed fixture briefs available at first render; live structured reanalysis of selected fixtures, behind bounded anonymous access.
4. Summary, participants, action items, owners, deadlines, unresolved questions, decisions, commitments, response-required state, and follow-up recommendation, with evidence or explicit unknowns.
5. Deterministic evidence validation and conservative date resolution.
6. On-demand replies with three fixed intents, fixed professional concise tone, live streaming, editing, cancellation, regeneration, review, and copy.
7. Recorded replies for supported fixture/intent combinations; explicit handling of unsupported custom inputs in recorded mode.
8. Local action completion/dismissal, Done for now, browser-local follow-ups, and undo.
9. Versioned extraction cache, bounded concurrency, timeouts, request deduplication, idempotency markers, and hard live-cost ceilings.
10. Metrics drawer showing provenance, actual local timings, and measured benchmark reports.
11. Deterministic test suite, AI evaluation corpus, live evaluation report, accessibility checks, and deployment smoke test.
12. Security controls, documentation, a hosted demo, and an actual recorded walkthrough.

## P1 — Strong extensions

Implement only after all P0 gates pass, in this order:

1. **Pasted-thread intake for local development only.** A form supplies viewer identity and optional sender/timezone metadata, displays a canonicalization preview, and obtains an explicit “Analyze with OpenAI” action. Public production continues to reject arbitrary thread uploads. No MIME importer or server persistence of pasted content.
2. **Proposed event preview.** Extract title, participants, proposed date/time, timezone, duration, and unresolved fields; require confirmation of ambiguous fields. No availability claim, calendar lookup, or calendar write.
3. **Detailed reply option** with an explicit length setting; maintain the same grounding and review rules. No learned voice profile.
4. **Hierarchical long-thread analysis** only if the P0 coverage limitation is a demonstrated obstacle; add original-source citation preservation and separate long-thread eval gates before shipping it.

P1 introduces new schema/prompt versions and must not silently extend P0 contracts.

## P2 — Optional / stretch

1. An `.ics` export of a user-confirmed P1 event preview.
2. A second visual theme after all accessibility and performance gates pass.
3. A read-only Gmail exploration on a separate branch with a separate threat model; this is outside the V1 deliverable and requires its own specification.

## Explicit Non-Goals

Do not build sending, automatic replies, a Gmail clone, Outlook support, attachments, MIME parsing, inbox-wide semantic search, arbitrary agents, tool execution, MCP integrations, a vector database, multi-user accounts, teams, collaboration, mobile apps, offline background notifications, browser push, calendar writes, voice training, fine-tuning, rich text composition, file uploads, automatic prewriting of every reply, translations, or elaborate settings.

Do not build a speculative Gmail abstraction. The existing fixture repository boundary is sufficient until an actual integration is approved. Do not introduce Redis, Kubernetes, queues, workers, GraphQL, event sourcing, or microservices.

# Architecture

```text
Browser
  React workspace + command registry + request state machine
  TanStack Query: immutable thread data and validated briefs
  IndexedDB: synthetic local actions, follow-ups, reviewed brief cache
  Memory only: user facts, generated drafts, provisional stream
  Bundled fixtures + reviewed recorded outputs: independent fallback
       |
       | Same-origin JSON + streaming POST using SSE framing
       v
Fastify / Node.js, one process, one Railway replica
  Fixture repository -> canonicalization -> version/coverage calculation
  Analysis service -> evidence validator -> deterministic date resolver
  Reply service -> constrained prompt -> streamed draft -> draft lint
  Anonymous-session gates, concurrency limiter, single-flight extraction
       |                                    |
       v                                    v
SQLite / Drizzle                      OpenAI Responses API
  validated extraction cache            no tools, store:false
  anonymous sessions                    pinned model
  idempotency/status metadata            extraction + drafting only
  cost reservations and counters
  redacted measurements
```

The browser can operate the recorded demo even if the API, database, or AI provider is unavailable after static assets have loaded. This does not promise an offline first visit: the initial HTML/assets still need the host. Live functionality fails closed when its database-backed budget ledger is unavailable.

The backend owns normalization, authoritative source spans, AI validation, live access controls, and provider calls. The client owns focus, local action state, editing, and workflow timing. Shared packages define validated contracts and pure domain rules. The server never imports frontend code; the client never imports provider SDK or secrets.

# Technology Decisions

| Area | Choice and rationale |
|---|---|
| Language/runtime | TypeScript 6 throughout, strict mode; Node.js 24 LTS. One language reduces contract drift. [Node’s published support guidance](https://nodejs.org/en/blog/migrations/v22-to-v24) confirms the 24 LTS line. |
| Frontend build | React 19 with Vite 8; SPA, no SSR. This is an interactive workbench with no SEO requirement. [Vite 8 release documentation](https://vite.dev/blog/announcing-vite8) establishes the chosen major. |
| Styling | Tailwind CSS 4 for utilities, CSS custom properties for design tokens; no animation framework |
| Accessible primitives | Radix UI Dialog/Popover/Tooltip; `cmdk` for the palette; Lucide icons |
| Routing | React Router 7, browser routing; only thread identity and narrow view state enter the URL |
| Server data | TanStack Query 5; native `fetch` for JSON and streaming; no Axios |
| Local state | React reducers/context for command execution and overlay ownership; component state for inputs; no Redux or Zustand |
| Browser persistence | `idb` wrapper over IndexedDB; localStorage only for non-content preferences |
| Backend | Fastify 5; route validation through shared Zod 4 contracts; generated JSON Schemas for Fastify and documented API |
| Database | SQLite via better-sqlite3, Drizzle ORM/migrations; prepared statements and WAL. The [driver’s documentation](https://github.com/WiseLibs/better-sqlite3) describes transactions and WAL. Short transactions are mandatory because the driver is synchronous. |
| AI provider | Official OpenAI JavaScript SDK, Responses API; two small adapters: live and recorded. No LangChain or agent framework |
| Model | `gpt-5.4-mini-2026-03-17` for extraction and replies, `reasoning.effort: none`. Choose a pinned fast/efficient model rather than automatically selecting the newest flagship. The [model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini) documents this snapshot, streaming, structured outputs, and supported reasoning levels. Quality remains subject to the project’s eval gates. |
| Structured outputs | Provider strict JSON Schema derived from Zod, then independent structural and source validation. [Official structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) supports this mechanism; schema conformity does not establish factual correctness. |
| Dates | `@js-temporal/polyfill`; a narrow deterministic parser and explicit ambiguity rules; no unconstrained natural-language date parser |
| Token estimator | `js-tiktoken` with `o200k_base`; treat it as a conservative estimator for this model, not an exact provider token counter; add 25% input margin |
| Stream parser | `eventsource-parser` on the browser’s fetch stream; no native EventSource, because requests are POSTs with JSON bodies |
| Logs/errors | Pino JSON logs; Sentry for redacted browser/server errors only; Performance API + SQLite for application measurements |
| Tests | Vitest, React Testing Library, MSW, Fastify inject, Playwright, `@axe-core/playwright`; SQLite integration tests use temporary real databases |
| Formatting/quality | Prettier, ESLint including React hooks and accessibility rules, TypeScript strict checking |
| Package manager | pnpm 10 workspace; commit lockfile; frozen installs in CI |
| Repository/build | Small pnpm monorepo, ordinary package scripts; no Nx/Turborepo |
| Hosting | One Dockerized Railway service and attached volume; same origin for frontend/backend; one region and replica |
| CI/CD | GitHub Actions; Railway production deploy only after required checks pass |

At Phase 0, pin exact compatible package versions inside these specified major lines and commit the lockfile. Patch selection is dependency hygiene, not permission to reconsider the architecture. If a critical dependency cannot support this runtime, document the incompatibility and use a supported patch within the specified architecture; do not silently replace frameworks or model snapshots. Never substitute another model without a new eval report and decision record.

# Domain Model

## Shared conventions

All wire objects are validated by Zod. Objects reject unknown keys. Fields listed below are required unless explicitly called optional; unknown values are `null`, not fabricated defaults. Arrays may be empty. Timestamps use ISO 8601 UTC instants; calendar dates use `YYYY-MM-DD` and remain dates. Timezones are validated IANA names. Money is integer micro-USD. Durations are milliseconds. Hashes are full lowercase SHA-256 hex strings unless a short display form is explicitly requested.

Fixture IDs are stable slugs. Runtime request/run IDs are UUIDv4. Domain item IDs are assigned by application code, never trusted from a model. The canonical viewer ID is a participant ID, not an email inferred from prose.

## Source entities

| Entity | Required fields and meaning | Relationships/persistence |
|---|---|---|
| `Participant` | `id`, `email:string\|null`, `displayName:string\|null`, `isViewer:boolean`. Canonical email is lowercase with surrounding whitespace removed; do not collapse Gmail dots or aliases. Anonymous sender IDs use the message ID, not the display name. | Deterministic from fixture metadata; no separate DB table |
| `Message` | `id`, `threadId`, `fromParticipantId:string\|null`, `toParticipantIds:string[]`, `ccParticipantIds:string[]`, `sentAt:string\|null`, `sourceTimezone:string\|null`, `sourceOrder:number`, `bodyText:string`, `quotedRanges:Range[]`, `contentHash`. `Range={start:number,end:number}`. | Immutable canonical fixture data; timestamps can be unknown; offsets refer to `bodyText` |
| `Thread` | `id`, `subject`, `viewerParticipantId`, `participantIds`, `messageIds`, `version`, `source:"fixture"`, `scenarioId`, `variantId`. | Messages are ordered deterministically; DB stores only derived cache, not duplicated fixture bodies |
| `ThreadMetadata` | `latestMessageId`, `latestInboundMessageId:string\|null`, `messageCount`, `participantCount`, `dateCandidates`, `normalizationWarnings:string[]`. | Deterministically derived; useful before AI finishes |
| `Coverage` | `mode:"full"\|"partial"\|"none"`, `includedMessageIds`, `omittedMessageIds`, `estimatedSourceTokens`, `reason:string\|null`. | Part of the analysis and prompt; partial coverage is always visible |

Canonical participant IDs are `p_` plus a hash of canonical email; missing addresses get `p_unknown_<messageId>`. Fixture message IDs are `m_<scenario>_<sequence>` and survive an appended-message variant. Thread version hashes canonical subject, viewer, participant metadata, message IDs/order, normalized bodies, timestamps, and source timezones. Source order matters even if text is unchanged.

## Evidence and semantic entities

The following abbreviated schema is normative; the field tables below complete it. It is a schema specification, not application source code.

```text
Evidence = {
  id, messageId, start, end, quote,
  location: "authored" | "quoted"
}
ClaimBase = {
  id, evidenceIds: string[],
  basis: "explicit" | "inferred" | "unclear",
  confidence: "supported" | "interpretation" | "unknown"
}
Owner = {
  kind: "viewer" | "participant" | "group" | "unknown",
  participantIds: string[], label: string | null
}
ActionItem = ClaimBase & {
  title, owner: Owner,
  sourceState: "open" | "completed" | "cancelled" | "unclear",
  deadlineIds: string[], supersedesId: string | null
}
Question = ClaimBase & {
  text, askedByParticipantId: string | null,
  addressedTo: Owner,
  state: "open" | "answered" | "unclear",
  answerEvidenceIds: string[]
}
Commitment = ClaimBase & {
  text, owner: Owner,
  state: "pending" | "fulfilled" | "withdrawn" | "unclear",
  deadlineIds: string[]
}
Decision = ClaimBase & {
  text, state: "current" | "superseded" | "unclear",
  supersedesId: string | null
}
ResponseAssessment = {
  state: "yes" | "no" | "unclear",
  reason, evidenceIds: string[], basis, confidence
}
```

Evidence offsets are **UTF-16 code-unit offsets**, start inclusive/end exclusive, after NFC and newline normalization. This matches JavaScript string slicing. Every evidence quote must equal `bodyText.slice(start,end)` exactly. Store and return the quote so that evidence remains inspectable; HTML or raw MIME offsets are not used.

An inferred action still requires evidence showing the request or context from which it was inferred. Unknown owners have an empty participant list; `group` requires a nonempty list or a literal quoted group label. A named participant owner requires exactly one known participant ID. `viewer` requires the viewer ID. UI completion is never written into `sourceState`.

Confidence is an application classification, **not a calibrated probability**. `supported` means an explicit claim passed source/metadata validation; it does not mean semantic truth was proven. `interpretation` means an inference with supporting context. `unknown` means uncertainty. Do not show unsupported percentage scores.

| Entity | Required fields and rules |
|---|---|
| `SummaryBullet` | ClaimBase plus `text`; 1–3 bullets, each at most 180 characters, source-linked |
| `ImportantParticipant` | `participantId`, `roleText:string\|null`, `evidenceIds`; role text is nullable when not supported |
| `Deadline` | ClaimBase plus `phrase`, `basisOfDate:"explicit_absolute"\|"explicit_relative"\|"inferred"\|"ambiguous"`, `sourceMessageId`, `sourceTimezone:string\|null`, `precision:"date"\|"datetime"\|"range"\|"unresolved"`, `localDate:string\|null`, `instantUtc:string\|null`, `rangeStartDate:string\|null`, `rangeEndDate:string\|null`, `candidateDates:string[]`, `ambiguityCode:string\|null`, `resolverVersion` |
| `FollowUpRecommendation` | `state:"recommended"\|"not_needed"\|"unclear"`, `waitingOn:Owner`, `reason`, `evidenceIds`, `anchorMessageId:string\|null`, `explicitDateDeadlineId:string\|null`. Contains no computed “now + N days” date. |
| `ExtractionResult` | `id`, `threadId`, `threadVersion`, `viewerParticipantId`, `schemaVersion`, `promptVersion`, `normalizerVersion`, `resolverVersion`, `selectionVersion`, `modelConfigHash`, `createdAt`, `source:"live"\|"recorded"`, `coverage`, `evidence`, `summary`, `importantParticipants`, `actions`, `questions`, `commitments`, `decisions`, `deadlines`, `response`, `followUp`, `warnings`, `validationStatus:"valid"\|"degraded"`, `contentHash` |

Dates require cross-field invariants: `date` has only `localDate`; `datetime` has only `instantUtc` plus a known source timezone/offset; `range` has ordered start/end dates; `unresolved` has none of these, but may have candidates. Never turn a date-only deadline into midnight or end-of-day without user input.

Evidence IDs hash thread version, message ID, and source span. Semantic item IDs hash thread version, item type, normalized text, and sorted evidence anchors. They are stable for an identical result but intentionally version-scoped. Extraction content hash covers the canonical validated semantic payload and compatibility tuple, excluding IDs that depend on that hash and volatile creation/access timestamps. Extraction ID is `x_` plus a hash of compatibility key and content hash. Do not silently carry completion/dismissal to newly generated items after a version or analysis change. Warn once and retain old local state as history until reset.

## User actions, drafting, and operations

| Entity | Fields, derived state, and persistence |
|---|---|
| `LocalActionState` | `threadId`, `threadVersion`, `extractionId`, `itemId`, `state:"open"\|"completed"\|"dismissed"`, `updatedAt`. IndexedDB only. Derived UI state overlays source state and is explicitly user-owned. |
| `ThreadDisposition` | `threadId`, `threadVersion`, `state:"active"\|"done_for_now"`, `updatedAt`. IndexedDB; an appended message reopens the thread. |
| `FollowUp` | UUID `id`, `threadId`, `threadVersionAtCreation`, `anchorMessageId`, `waitingOn`, `dueAtUtc`, `userTimezone`, `dateOrigin:"user"\|"explicit_source"\|"app_default"`, `state:"active"\|"due"\|"cancelled"\|"completed"`, `cancelReason:string\|null`, `createdAt`. IndexedDB. `due` derives from scenario clock. |
| `DeadlineOverride` | `deadlineId`, `threadId`, `threadVersion`, `precision:"date"\|"datetime"`, `localDate:string\|null`, `instantUtc:string\|null`, `timezone`, `confirmedAt`. Exactly one normalized value matches precision. IndexedDB only; invalidated on changed thread version. |
| `ReplyInput` | `threadVersion`, `extractionId:string\|null`, `recipientMode:"sender"\|"all"`, `intent:"acknowledge"\|"answer"\|"clarify"`, `userFacts:{id,text}[]`, `mode:"live"\|"recorded"`. Facts: at most 5, 300 characters each. No free-form system prompt. |
| `DraftReply` | UUID `id`, `threadId`, `threadVersion`, `extractionId:string\|null`, `recipients`, `intent`, `text`, `source`, `state:"streaming"\|"interrupted"\|"editable"\|"blocked"\|"reviewed"\|"copied"`, `revision`, `lintFlags`, `reviewedRevision:number\|null`. Memory only; maximum 3 retained draft versions per thread. Editing increments revision and invalidates review. |
| `Command` | Registry entry: `id`, `label`, `aliases`, `shortcut`, `contextPredicate`, `disabledReason`, `execute`. A command is application code, never a model-defined function. |
| `CommandRun` | UUID `id`, `sessionId`, `threadId`, `threadVersion`, `kind:"analyze"\|"reply"`, `status:"running"\|"completed"\|"failed"\|"cancelled"`, timestamps, `source`, `errorCode:string\|null`, `resultHash:string\|null`. Server persists metadata only. |
| `AIRequest` | UUID `id`, `commandRunId`, provider request ID nullable, model/prompt/schema versions, attempt number, token counts nullable, estimated/actual micro-USD, timing fields nullable, terminal status. No prompt/output text. |
| `LatencyMeasurement` | UUID `id`, `runId:string\|null`, `buildSha`, `scenarioId`, allowlisted `operation`, `source:"live"\|"recorded"\|"template"\|"deterministic"`, `cacheLayer:"none"\|"memory"\|"indexeddb"\|"server_fresh"\|"server_stale"\|"recorded_bundle"`, `durationMs:number`, `success:boolean`, `coverageMode:"full"\|"partial"\|"none"`, `profileId:string`, `measuredAt`. Browser marks are monotonic; server marks use a separate monotonic clock. |

No separate persisted entity is needed for an arbitrary command history, participant directory, inbox account, calendar, or notification channel.

# Email Ingestion

## P0 fixture ingestion

Fixture source is version-controlled JSON validated at build/startup. Load through a narrow `FixtureRepository` supporting `listThreads`, `getThread`, and `getScenarioVariant`. Do not expose writes or pretend to support providers that do not exist.

Canonicalization order:

1. Validate UTF-8 JSON and typed metadata; reject invalid IDs and broken relationships.
2. Normalize text to NFC and line endings to LF. Preserve authored whitespace except removing trailing line whitespace. Preserve case and punctuation.
3. Identify simple quoted regions (`>` lines and fixture-specified quoted ranges). Retain them; do not treat quoted repetition as a new promise.
4. Canonicalize address metadata; require explicit fixture viewer identity.
5. Deduplicate exact repetitions using stable message ID, then identical canonical content+sender+timestamp. Same text with another sender or timestamp is not a duplicate. Duplicate IDs with different contents are corruption and must fail fixture validation.
6. Derive one sequence from required source order, breaking ties by message ID. Flag timestamp inversions or missing timestamps as chronology warnings. Do not re-sort with a comparator that mixes timestamps and source order; fixture source order remains authoritative.
7. Build participant registry, source spans, deterministic metadata, coverage, and full thread version.

In P0 every body is plaintext. HTML test strings are literal text. No email HTML rendering, remote images, attachment downloads, or external content fetching exists.

All fixtures and their reviewed outputs are public synthetic data. Label that on screen and in documentation. Never place genuine application correspondence or candidate personal information in the public corpus.

## P1 paste boundary

If implemented, it exists only when `ALLOW_LOCAL_PASTE=true` **and** the server is bound to loopback in a development environment. Production startup rejects this flag. Form limits: 256KiB UTF-8 thread, 80 messages, and 32KiB per individual message. The user chooses the viewer; missing timestamps, addresses, and timezones remain unknown. The canonicalization preview must be approved before a provider call. Pasted input and its analysis remain in process memory for at most 30 minutes of inactivity and are never shared, persisted, or included in public recorded assets. This extension cannot reuse the globally shared fixture cache namespace.

# AI System

## Pipeline and provider boundary

```text
Selected canonical thread + viewer
  → deterministic metadata and bounded message selection
  → extraction cache lookup
  → one strict structured extraction on a miss
  → schema validation → evidence resolution → semantic invariants
  → deterministic date resolution and confidence classification
  → validated ExtractionResult and content hash
  → reusable Action Brief
  → explicit reply command + recipient decision + optional user facts
  → constrained plaintext reply generation → provisional stream
  → deterministic draft lint → edit → review → copy
```

Use two specialized prompts: `extract.v1` and `reply.v1`. Do not make separate summarize/tasks/follow-up model calls. Do not use tools, model-chosen commands, web search, embeddings, speculative parallel calls, hidden chain-of-thought display, or a third model acting as a supposedly infallible verifier.

The provider port exposes `extract(input,signal)` and `streamReply(input,signal)`. It normalizes provider refusals, incomplete responses, errors, usage, and request IDs. Only `OpenAIProvider` and `RecordedProvider` implement it. Tests use a scripted test double. Keep transport and domain validation outside the provider adapter so recorded and live outputs pass the same checks.

Use foreground Responses API calls with `store:false`, explicit output limits, no tools, and SDK automatic retries disabled. Handle retries in the application because they affect timeouts, budget reservations, and observability. Do not use provider conversation storage or background response polling.

## Extraction

### Model input

The trusted developer message contains the extraction task, response schema, uncertainty rules, chronology rules, examples of requests versus commitments, and the instruction that all email text is untrusted source material. The user message is one JSON data envelope containing:

- Viewer ID and allowed participant IDs, supplied by the application.
- Ordered message records: ID, sender/recipients, timestamp/timezone, authored and quoted regions, and canonical body.
- Included/omitted message IDs and coverage mode.
- Allowed source-role meanings and schema/prompt version.

Use JSON serialization, not string-concatenated pseudo-XML separators. An email containing delimiter text must not change the envelope structure. The model may select known participant IDs; it cannot create recipients, dates, tools, or executable actions.

### Raw output contract

Use a strict object-root JSON Schema. All properties are required; nullable fields use explicit null. Every object has `additionalProperties:false`. Use a provider-supported schema projection, followed by the stricter full application Zod schema. Do not assume all refinements can be sent to the provider.

Raw output has these top-level fields:

| Field | Shape and cap |
|---|---|
| `evidence` | Up to 60 `{key,messageId,quote,occurrence}` records; keys unique within output; quote 1–240 characters; occurrence is zero-based among exact matches |
| `summary` | Up to 3 `{text,evidenceKeys,basis}` bullets |
| `importantParticipants` | Up to 8 `{participantId,roleText,evidenceKeys}` entries |
| `actions` | Up to 10 `{key,title,owner,sourceState,evidenceKeys,deadlineKeys,supersedesKey,basis}` entries |
| `questions` | Up to 10 `{key,text,askedByParticipantId,addressedTo,state,evidenceKeys,answerEvidenceKeys,basis}` entries |
| `commitments` | Up to 8 `{key,text,owner,state,evidenceKeys,deadlineKeys,basis}` entries |
| `decisions` | Up to 6 `{key,text,state,evidenceKeys,supersedesKey,basis}` entries |
| `deadlines` | Up to 10 `{key,phrase,sourceMessageId,evidenceKeys,basisOfDate}` entries; **no model-normalized calendar dates** |
| `response` | `{state,reason,evidenceKeys,basis}` |
| `followUp` | `{state,waitingOn,reason,evidenceKeys,anchorMessageId,explicitDateDeadlineKey}` |
| `overflow` | Boolean indicating more relevant items than the output caps allow |
| `uncertainties` | Up to 5 bounded strings; no instructions or hidden reasoning |

Titles are at most 100 characters; semantic prose fields at most 180. Owner schema is the `Owner` contract above. Raw model keys are temporary references, never persisted public IDs. Invalid arrays, enums, references, or nullability fail validation. `overflow:true` requires a visible “More items may exist; inspect the thread” warning. Prefer current open items to superseded history when a cap is reached.

### Evidence and semantic validation

Resolve each raw quote by exact search in its referenced canonical message. Use its occurrence selector; a wrong occurrence or no exact match invalidates that evidence record. Compute offsets on the server. If a quote spans disjoint selected fragments, reject it. Quoted-region evidence is labeled accordingly.

Then apply these rules:

1. Referenced messages must be included in coverage and belong to the selected thread/version.
2. Every summary bullet, action, question, commitment, decision, and concrete response assessment needs at least one valid evidence span. An unclear assessment may have none if source metadata/context is missing.
3. Owners must satisfy participant-registry invariants. Missing/ambiguous metadata forces `unknown`; matching a common display name alone cannot disambiguate two people.
4. An answered question requires answer evidence; a fulfilled commitment or completed source action requires completion evidence. Silence is not an answer.
5. A superseding decision/action requires later authored evidence and an existing referenced item. Reject cycles and dangling supersession links.
6. Deadlines require a literal date phrase within cited evidence. The date resolver determines normalized values.
7. A follow-up recommendation requires evidence of an unanswered outbound request or another person’s pending commitment. An inbound request needing the viewer’s answer is not a follow-up-on-others by default.
8. Under partial coverage, `response:no` becomes `unclear`. Explicit current requests may justify `yes`; missing older context never proves everything is settled.
9. Deduplicate same-type items using owner, normalized wording, and evidence anchors. A request and the resulting promise may both exist in their respective types, but the brief groups them to avoid presenting duplicate next actions.

Drop an item whose supporting evidence is invalid; do not invent a replacement quote. If a deadline is invalid, retain the otherwise supported action with an unresolved deadline warning. If any consequential action/question/commitment/response assessment is dropped or downgraded, mark the result `degraded`, explain that validation removed uncertain claims, and set response to `unclear` unless another valid explicit request supports `yes`. Do not cache structurally invalid output.

One repair attempt is permitted for malformed/truncated output or widespread reference failure, using the original source and machine validation codes. Never include secrets, stack traces, or new factual hints in that repair prompt. A degraded but useful source-valid result does not trigger automatic repeated inference. If repair still fails, retain the reviewed recorded brief and show a live-analysis failure.

Exact citation matching proves that words appeared in a message. It does **not** prove that an interpretation is entailed by those words. Product labels, evals, and interview explanations must preserve this distinction.

## Commands

The command registry is deterministic. All visible buttons and shortcuts invoke the same command implementation. Required commands include:

| Command | Result |
|---|---|
| View summary; alias `/summarize` | Focus existing summary; zero inference |
| View actions; alias `/tasks` | Focus next-action list; zero inference |
| Draft reply; alias `/reply` | Open default acknowledgment draft and start the selected mode |
| Answer with my facts | Open facts input without starting a model call |
| Ask for missing information | Draft a concise clarification using existing open questions |
| Save follow-up; alias `/followup` | Open deterministic reminder preview |
| Analyze live | Request or retrieve a validated live brief; never rerun on every focus |
| Regenerate reply | Start a new reply run; preserve previous draft as undo history |
| Cancel generation | Abort the active subscriber/HTTP stream |
| Complete/dismiss item, Done for now, Undo | Update browser-local state |
| Show performance, Show shortcuts, Reset demo | Open the appropriate deterministic UI |
| Load new message; Advance scenario clock | Explicit fixture demo operations |

Do not show `/schedule` as an active command in P0. Palette searches for “schedule” may explain that calendar preview is outside this version, but must not launch a fake event creation flow.

## Reply Generation

### Recipient determination

Recipients are computed by application code before generation and displayed in a read-only P0 header. Default is the latest valid inbound authored sender. Reply-all adds that message’s To/Cc addresses, deduplicates, and removes the viewer. Never invent an address or use a quoted forwarded sender as the recipient.

If no valid inbound sender exists, show “Recipient unavailable” and permit a generic editable draft only if the user explicitly chooses that option through the palette. Copy output must contain body only, never an invented To header. Outbound waiting threads use the last outbound message’s non-viewer recipients for a clarification/follow-up-style draft. If this set is empty, follow the same unavailable rule.

### Generation constraints

P0 tone is fixed: professional, direct, warm, and concise; target 60–120 words, maximum 180. No tone selector, voice profile, or imitation of a real person. Do not add a subject, attachments, signature, unsupported availability, new prices, new deadlines, promises of completion, or assertions that an email/calendar event has already been sent/created.

Supply the model with the bounded original source, the validated brief, the selected recipient mode, fixed intent, and at most five user-asserted facts. Freeze this context when the run starts. The request's extraction ID must identify the brief currently inspected by the user; resolve that exact compatible recorded/live result. If it is no longer available, return 409 `CONTEXT_CONFLICT` before inference and refresh the brief. Null extraction ID explicitly requests the raw-source fallback. A later analysis completing during drafting does not change the in-flight prompt. Treat facts as data, not instructions. Each fact has an application-assigned ID. Existing source data outranks model guesses; a contradiction between a user fact and source produces a clarification or explicit draft warning, not an invented reconciliation.

- **Acknowledge:** confirm receipt without promising delivery or availability.
- **Answer:** answer only from source or the user’s explicitly supplied facts. A missing necessary fact becomes `[[NEEDS: short description]]`.
- **Clarify:** ask at most three relevant unresolved questions; do not invent the answer.

Incomplete analysis does not prevent drafting a conservative acknowledgment or clarification. If no valid brief exists, generation uses bounded raw messages and displays “Drafted from thread; analysis unavailable.” The reply must remain conservative about task/deadline conclusions.

### Stream, lint, edit, review

Stream plaintext through `draft.delta`; render it as plain text and mark it “Generating — review when complete.” Editing and copying are disabled while streaming, but Cancel is always available. Batch client paints to at most one per animation frame. Do not steal focus as new text arrives.

On provider completion, run a deterministic draft linter:

1. Block unresolved `[[NEEDS:...]]` placeholders.
2. Flag newly introduced email addresses, URLs, currency amounts, numeric quantities, and normalized date/time literals absent from the source or user facts.
3. Flag a commitment by the viewer (“I will…”, “we will…”, “I can attend…”) unless its normalized commitment clause is an exact substring of an authored viewer source statement or a user fact. This intentionally conservative rule flags unsupported paraphrases rather than pretending to perform semantic entailment. A negative statement is not a promise; tests must distinguish it.
4. Block provider refusal text, leaked internal marker strings, and output beyond the hard text limit of 8,000 characters. Word-count overshoot above 180 is a nonblocking warning; request concise editing.
5. Treat detectable conflicts with source deadlines as blocking.

A blocking flag disables review/copy until the user edits the relevant text or supplies a fact and regenerates. Re-run lint after edits, debounced 150ms. Do not allow an “ignore all warnings” button. User edits may introduce new facts; offer “Use this as my fact” for the selected edited sentence, bounded by the same five-fact limit, then re-lint. This is an explicit user assertion, not AI verification.

These checks are conservative safeguards, not complete natural-language entailment verification. Undetected unsupported claims remain possible; require manual review and measure them in evaluations. Do not claim that copy eligibility proves truth.

Regeneration uses the same explicit input and a new run ID; no automatic model retry after visible text. Keep up to three draft versions in memory. `Undo` after regeneration restores the previous complete draft without another inference. Stop generating after three successful regenerations for one thread in a session and explain the limit; edits remain available.

On interruption, retain partial text with a prominent “Incomplete draft” label. It is not copyable until the user chooses **Keep and edit partial draft**, completes/edits it, clears lint, and reviews it. Do not silently finish it using recorded text.

## Recorded and live modes

Recorded mode is the default and performs zero provider calls. Bundled assets contain reviewed extraction results and reply text for exact `(fixture version, recipient mode, intent, empty userFacts)` combinations. Recorded playback uses deterministic chunks for demonstrating interaction and cancellation, not for pretending to benchmark a model. Label it before generation begins and on the finished draft.

If a requested recorded combination is unavailable, offer a deterministic conservative template explicitly labeled **Template**, or offer live mode. Never ignore supplied user facts and return a mismatched recording. “Answer with my facts” requires live mode in P0; recorded mode explains that limitation before collecting facts.

The live-mode button explains that fixture text and any supplied facts are sent to OpenAI. The actual command is the consent action. Changing the mode alone does not start billable inference. Reviewed recorded intelligence can remain visible during live analysis but keeps its recorded provenance label until a validated live result replaces it.

A provider failure produces an explicit **Use recorded version** action. Source changes do not happen silently. Recorded fallbacks never count as successful live responses in reports.

## Long Threads

P0 uses a **bounded, contiguous recent-message window**, not hierarchical summarization. This limits complexity and makes coverage inspectable. No hidden summary of omitted messages is fed back as if it were source evidence.

- Hard source limit: 80 messages, 256KiB total UTF-8 body text, 32KiB per message. Corrupt oversized fixtures fail validation. P1 intake returns 413 with a useful reduction instruction.
- Soft AI source budget: 12,000 estimated tokens, plus 25% estimation margin. Prompt/schema metadata budget: 3,000 estimated tokens. Reserve room for 4,096 extraction output tokens.
- Starting at the newest message, include whole messages backwards until the source budget would be exceeded. Stop at that boundary; do not skip the boundary message to cherry-pick shorter older content. Restore chronological/source order before prompting.
- If the latest message alone exceeds the source budget, do not analyze or draft it with an undocumented truncation. Set coverage `none`, show the message, and explain that the source is too large for this demo.
- Under partial coverage, show “Analyzed N of M messages” and a link to omitted messages. All claims refer only to included messages. No global “all questions answered” conclusion is permitted.
- Reply generation uses the same coverage window. It must not imply it considered omitted content; display the coverage limitation next to review/copy.

Partial coverage is a documented P0 limitation. It is acceptable only if the long-thread fixture and eval show no unsupported claims from omitted content. Hierarchical summarization is deferred because merging stale decisions and preserving exact citations require additional design and tests.

## Date and Time Handling

Resolve dates from **the source message’s timestamp and timezone**, never from the current wall clock or the scenario clock. Display known instants in the user-selected timezone. Calendar dates remain labeled with the source timezone when changing zones could be misleading.

Use this deterministic resolution policy:

| Source expression | P0 behavior |
|---|---|
| ISO date with year, e.g. `2026-10-09` | Explicit calendar date; no time invented |
| Full date/time with unambiguous numeric offset or IANA zone | Exact UTC instant; retain original phrase/zone |
| `tomorrow` / `today` / `yesterday` | Resolve to source-local calendar date only if timestamp and source zone are known; classify explicit-relative |
| `in 2 hours` | Resolve from a known source instant; preserve stated duration |
| `Friday`, `next Friday`, `next week`, `EOD`, date without year | Unresolved; show phrase and bounded candidate dates/range with “Confirm date” |
| `next week` with known source zone | Propose next Monday–Sunday as seven candidate dates with a range label, but keep unresolved until a concrete date is confirmed; never select Monday automatically |
| `CST`, unknown timezone, or conflicting zones | Unresolved with `ambiguous_timezone` |
| Missing message timestamp for relative expression | Unresolved with `missing_reference_time` |
| DST nonexistent or repeated local time | Reject automatic conversion using Temporal disambiguation `reject`; ask for clarification |
| Model-inferred timing, e.g. “urgent means tomorrow” | No normalized date; classify inferred and display uncertainty |

A timestamp’s numeric offset is useful for exact instants but does not establish the sender’s IANA timezone. Do not use the viewer’s timezone as a silent substitute. Recorded fixtures supply IANA source zones explicitly where appropriate. Bounded parsers must validate all calendar fields and leap days; no pathological regex over an entire large body.

User confirmation of a candidate date creates a local override referencing the deadline ID and thread version. It does not rewrite the model output or original evidence. A user-confirmed date may then be used for a follow-up or P1 event preview and carries `dateOrigin:user`.

Overdue is derived, never cached semantic output: a known instant is overdue after the scenario instant passes it; a date-only deadline is overdue only after the source-local calendar date has passed. A date with unknown source timezone receives no automatic overdue assertion until the user confirms a timezone. Deadline overrides use their confirmed timezone. This distinction prevents invented end-of-day times.

## Follow-Up Workflow

`F` means **resurface this thread in the app if I am still waiting**. It does not claim to create an OS notification, send a future email, or continuously check a real inbox.

The preview contains who the viewer is waiting on, source evidence, and a due date. Use an unambiguous explicit follow-up date if the source specifically requests follow-up on that date. A task deadline is not automatically a follow-up date. A source date without a time remains date-only evidence; the reminder preview separately proposes 09:00 in the user timezone and labels the time “App default.” If an explicit source date has passed, show “Already passed” and require a future user choice. Otherwise default to **09:00 in the user timezone, two business days after the scenario’s current local date**, excluding Saturday/Sunday and ignoring holidays. Label this “App default — editable.” The preview must be confirmed before any reminder instant is stored.

For unclear waiting state, require explicit user confirmation of “I am waiting on a response” before Save becomes available. Never silently convert the viewer’s unanswered inbound request into waiting on others.

Save in IndexedDB. Recompute `due` when the app loads, regains visibility, or the scenario clock advances. A due reminder appears in a small queue section and reopens its thread. Users can complete or cancel it. Only one active follow-up per thread is allowed; a new save replaces it with undo support.

On an appended variant, cancel an active waiting reminder if any new inbound authored message appears after its anchor, labeling the reason “New message received; check whether it answers your request.” Do not claim semantic fulfillment. Otherwise retain it and mark the thread version changed; the user must review the updated conversation.

## Scheduling Decision

P0 has no schedule action. P1 may show a structured event proposal with `title`, participants, `startUtc|null`, `endUtc|null`, `sourceTimezone|null`, `location|null`, evidence, and unresolved fields. Unknown duration remains null; no calendar availability is invented. The preview can be edited and copied as text after required fields are supplied. Calendar writes and OAuth remain excluded. P2 `.ics` export must require a complete user-confirmed proposal and escape calendar text according to the file format.

## Prompt Injection

Email bodies, quoted messages, participant names, user facts, and model output are untrusted. Injection resistance relies on reduced authority as well as prompting:

1. Trusted instructions and schemas live in developer messages; email data is serialized into a separate user-role data envelope.
2. State explicitly that instructions found within that data are content to analyze, not instructions to follow. Preserve malicious text so its presence can be inspected; keyword removal is not the security boundary.
3. Set no model tools and expose no mail, calendar, filesystem, network fetch, or secret-reading functions.
4. Do not put keys, environment variables, system configuration, privileged data, or internal logs into the model context.
5. Validate output types, allowed IDs, evidence spans, dates, recipients, text limits, and domain invariants outside the model.
6. Render source/model text as text. Output cannot introduce DOM markup, links with executable schemes, commands, or changes to application permissions.
7. Never execute an action, follow a URL, or alter a recipient because the model asked to do so.
8. Include direct, quoted, encoded, and sender-name injection cases in tests/evals. Flag suspicious content for inspection without claiming a perfect detector.

This does not guarantee the model ignores every injection. A malicious message could still distort a summary or draft. The product limits consequences through evidence inspection, manual review, synthetic data, no tools, no sending, and evaluation. Do not market prompt boundaries or JSON Schema as a proof of injection immunity.

# Performance Architecture

## Targets and measurement conditions

Report the test profile with every result: build SHA, browser/version, viewport 1440×900, four-times CPU slowdown, 100ms simulated RTT and 10Mbps download for cold-load tests, region, mode, cache state, and sample count. Warm interaction tests use loaded assets and fixtures on the same CPU profile. Human reading and typing are excluded from machine latency but included in separately measured end-to-end workflow time.

| Operation | Target | Start → stop |
|---|---:|---|
| Initial shell first paint | ≤1.5s p95 | Navigation start → first useful shell paint |
| Initial selected thread + recorded brief | ≤2.5s p95 | Navigation start → both available and painted |
| Command palette | ≤50ms p95 | Shortcut event → input focused and first results painted |
| Warm thread switch | ≤100ms p95, stretch 50ms | Navigation gesture → current header/body and matching brief painted |
| Local cached brief | ≤50ms p95 | Selection → matching cached brief painted |
| Server extraction-cache lookup | ≤20ms p95 | Server handler cache lookup start → validated value ready; excludes network |
| Warm cached API retrieval | ≤200ms p95 on defined network | Fetch start → validated JSON received |
| Deterministic source metadata | ≤50ms p95 | Canonicalization start → metadata ready for a valid P0 fixture |
| Live reply first visible text | ≤2s p95 target | Accepted reply gesture → first nonempty text painted, including queue/network |
| Live extraction completion | ≤10s p95 target | Accepted analyze gesture → validated live brief painted |
| Live usable reply | ≤8s p95 target | Accepted reply gesture → complete draft linted and editable |
| Cancel feedback | ≤100ms p95 | Cancel gesture → UI no longer generating |
| Local action/follow-up update | ≤100ms p95 | Confirm gesture → changed state painted |

Initial JavaScript budget: ≤250KiB gzip, excluding separately fetched synthetic data; initial total transfer target ≤450KiB gzip including CSS, fonts, selected fixture data, and reviewed outputs. Route-independent performance/eval details load lazily. Self-host one subset font file; fallback typography must work before it arrives.

Targets are not claims. The public report must include failures and slow responses. If live p95 misses a target, report it and the observed tail, while the mandatory deterministic UI/fallback remains usable. Deterministic interaction budgets and bundle limits are shipping gates; live budgets are measured objectives with the fallback gate below.

## Keeping the UI useful

- Render subject, participants, message chronology, and source text before inference.
- Show a current version-matched cached/reviewed brief rather than replacing it with a skeleton. A cold live brief uses labeled pending sections, with no invented task skeleton contents.
- Prefetch fixture bodies and reviewed briefs for the next two and previous one thread after current paint. Prefetch never initiates paid inference.
- Collapse older messages; expand evidence targets on demand. No animation delays thread changes.
- In recorded mode, all core actions work without API calls. Recorded playback first-text delay is fixed 250ms, subsequent chunks every 35ms; label it a playback, never provider latency.
- Optimistic local changes apply immediately, then persist. On IndexedDB failure, keep memory state and display “Changes won’t survive reload.” Do not show saved confirmation for a failed persistent write.
- Debounce queue text filtering 80ms and draft lint 150ms. Do not debounce direct commands or selected-thread paint.

## Concurrency, cancellation, and staleness

Allow at most four active provider calls globally and two per anonymous session. Do not queue public requests; respond busy with Retry-After when capacity is unavailable. At most one reply stream is active per browser workspace. Live extraction is single-flight by extraction-cache key; concurrent callers subscribe to one provider attempt. Abort that extraction only when its last subscriber leaves.

Hard total deadlines, including allowed retry: extraction 45s; reply 20s. Reply no-visible-text deadline: 6s; after that show a fallback action while the request may continue until 20s. Extraction pending status changes at 10s to “Taking longer than expected.” Browser stream-idle timeout is 12s; server sends a heartbeat every 5s. These are separate from model TTFT.

`AbortController` cancellation flows from fetch disconnect through the command subscriber to the provider call. It stops future UI writes even if the provider emits another chunk. Billing may still occur; cancellation never refunds an unknown usage reservation automatically.

Every result/event contains run ID and thread version. Client reducer accepts an event only if it matches the active run, thread ID, thread version, and mode. Switching threads cancels the active reply, keeps its partial text in that thread’s memory slot, and immediately renders the new thread. An append-message update invalidates the old draft’s review and labels it stale; it cannot be copied until recreated or explicitly adopted into a new editable draft and reviewed against the changed thread.

# Caching

## Key and layers

Use an extraction key built from a stable serialization of:

```text
threadVersion + viewerParticipantId + sourceMode
+ extractionSchemaVersion + extractionPromptVersion
+ normalizerVersion + resolverVersion + selectionVersion
+ modelSnapshot + modelConfigHash + language("en")
```

Hash this full tuple. Model config hash includes reasoning effort and output limit. The coverage window follows from version and selection version. Time-relative UI state is not part of extraction: overdue displays and follow-up defaults derive from the current scenario clock after lookup.

| Layer | Contents | Lifetime/invalidation |
|---|---|---|
| Bundled recorded assets | Reviewed fixture briefs and known reply recordings | Immutable per deployment/version; validate at build and load |
| TanStack Query | Current thread/version, matching brief, API status | `staleTime:5min`, `gcTime:30min`; explicit invalidation on variant/version/config change |
| IndexedDB | Synthetic matching brief cache; local actions/follow-ups | Briefs max 7 days and 50 entries; user state until Reset demo; schema migration required |
| Server SQLite | Validated live fixture extraction results | Fresh 7 days; retain stale exact-version entries up to 30 days for inspection; purge beyond that |
| In-process map | Active extraction single-flight subscriptions | Only while the provider request runs; no unbounded result cache |

Recorded and live keys cannot collide. A model/prompt/schema change makes the old result incompatible, not merely expired. Validate cache contents on read. If a cache entry is corrupt, evict it and fall back; do not repeatedly crash on the same entry.

A TTL-expired result with matching versions may remain visible as “Cached — refresh available,” but cannot be counted as a fresh hit. Clicking Analyze live refreshes it. Do not refresh on every window focus or automatically incur costs while scrolling. A changed thread version must never display the old brief as current.

Replies are **not** server-cached: they depend on intent, recipient mode, user facts, edits, and context. Completed drafts stay in browser memory for the session. Recorded replies are deterministic assets, not an inference cache. Cache hit metrics distinguish local memory, IndexedDB, fresh server cache, stale display, and recorded bundle.

# API Contracts

## Common rules

Prefix JSON/stream endpoints with `/api/v1`. Source fixtures are public. All API stream runs and metrics writes require the signed anonymous session, including recorded runs served through the API. Browser-local recorded playback needs no session or API. All POSTs require JSON content type, exact same-origin Origin, and accepted Fetch Metadata when supplied. Responses include `X-Request-Id`; body errors use a stable safe contract:

```text
Error = {
  error: { code, message, retryable, retryAfterMs: number|null },
  requestId
}
```

Standard errors: 400 `INVALID_INPUT`, 401 `SESSION_REQUIRED`, 403 `ORIGIN_REJECTED`/`LIVE_DISABLED`, 404 `NOT_FOUND`, 409 `VERSION_CONFLICT`/`CONTEXT_CONFLICT`/`RUN_IN_PROGRESS`/`IDEMPOTENCY_CONFLICT`, 410 `RESULT_NOT_REPLAYABLE`, 413 `INPUT_TOO_LARGE`, 422 `UNSUPPORTED_RECORDED_INPUT`/`CONTEXT_TOO_LARGE`, 429 `RATE_LIMITED`/`BUDGET_EXHAUSTED`, 503 `BUSY`/`DEPENDENCY_UNAVAILABLE`. Return current version metadata for a version conflict; do not include provider raw error text.

Maximum general JSON POST body: 32KiB. P1 local paste uses its own 256KiB limit and remains absent in public production. GET fixture assets use ETag equal to version/hash and support 304. Operational/metrics responses use `Cache-Control:no-store`.

## Endpoint inventory

| Method/path | Request | Success response | Special behavior/errors |
|---|---|---|---|
| `GET /api/v1/bootstrap` | None | 200 `{buildSha,viewer,scenarioClockBase,userTimezoneDefault,modelSnapshot,liveEnabled,disabledReason,limits,manifestVersion}` | Can return recorded capability with `liveEnabled:false` when DB/provider key is unavailable; no secrets |
| `POST /api/v1/session` | `{}` | 200 `{expiresAt,limits}` and signed session cookie | Idempotent while valid cookie exists; Origin check required; no login/user identity |
| `GET /api/v1/threads` | Optional `variant` selected from allowlisted manifest | 200 `{threads:[{id,version,subject,latestSender,messageCount,preview}],manifestVersion}` | Stable fixture order; no AI or arbitrary remote provider |
| `GET /api/v1/threads/:id` | Optional allowlisted `variant` | 200 `{thread,participants,messages,metadata,coverage}` | 404 invalid ID/variant; ETag/304 |
| `GET /api/v1/threads/:id/intelligence` | `version`, `source=live\|recorded` | 200 `{state:"ready"\|"missing"\|"stale",extraction:ExtractionResult\|null,cache:{layer,fresh,ageMs}}` | 409 version mismatch; missing is a normal state; no provider call |
| `POST /api/v1/threads/:id/analyze` | `{threadVersion,mode:"live"\|"recorded"}`; `Idempotency-Key:UUID` | 200 `text/event-stream`; `analysis.completed` contains validated result | Cached result streams lifecycle/completion without provider call. Live miss checks quotas/capacity. Same extraction key joins single-flight. No public `force` or cache-delete parameter. |
| `POST /api/v1/threads/:id/replies` | `ReplyInput`; `Idempotency-Key:UUID` | 200 `text/event-stream`; deltas then complete text/lint | Validate recipients/context before opening stream. Answer with no facts may contain required placeholders. Recordings require exact supported input. |
| `GET /api/v1/runs/:id` | Cookie session | 200 `{id,kind,status,threadId,threadVersion,source,startedAt,endedAt,errorCode,resultHash,metrics}` | Own-session only; 404 for other sessions; no draft text or user facts |
| `POST /api/v1/metrics` | `{events:LatencyMeasurement[]}`; max 50 events/20KiB | 202 `{acceptedCount}` | Validate names/IDs/duration range; mark measurements client-reported; rate-limit; no content |
| `GET /api/v1/metrics` | Cookie session, optional allowlisted operation | 200 `{sessionSamples,summaryByOperationAndSource,buildSha}` | Own session only, no prompt/output/other visitors; no fabricated percentile for empty data |
| `GET /healthz` | None | 200 `{status:"ok",buildSha}` | Liveness, does not call AI or DB |
| `GET /readyz` | None | 200 `{status:"ready",database:true}` or 503 safe status | DB readiness; does not call provider; live capability separate |

There are no server endpoints for local task completion, reminders, copy, send, or calendar writes. Do not invent persistence APIs for browser-local state.

## Idempotency and run lifecycle

Namespace idempotency keys by anonymous session and route. Generate a new UUID per deliberate command attempt. Persist an HMAC of the canonical request body with a server-only secret, plus run metadata; never persist facts to implement idempotency. A key reused with a different body yields 409. A duplicate active reply run yields 409 with run ID; do not start another inference. A completed analyze run can return its still-compatible cached extraction; a completed reply run returns 410 because its content was never server-persisted. The client retains its own completed result and must not automatically retry a lost stream.

Retention of idempotency/run records is 24 hours. A retry after an interrupted reply requires an explicit user action and a new key. This provides bounded deduplication, **not exactly-once provider billing or exactly-once result delivery**. On process restart, mark unfinished runs failed with `SERVER_RESTARTED`; keep unknown usage reservations charged conservatively. Reply result hashes use the server's body-HMAC secret rather than an unhashed-text digest suitable for guessing sensitive facts; public synthetic extraction hashes remain SHA-256.

# Streaming Protocol

Use SSE event framing over the POST response. This is server-to-client progress for one operation; a persistent bidirectional socket would add lifecycle complexity without a product need. The [OpenAI streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses) documents provider SSE; the application re-encodes a smaller independent protocol.

Set `Content-Type:text/event-stream; charset=utf-8`, `Cache-Control:no-cache,no-transform`, and buffering/compression exclusions for these routes. Flush headers and `run.started` promptly. Respect backpressure; abort a disconnected or persistently slow client rather than buffering unbounded output. Maximum buffered stream text: 16KiB. Send comment heartbeats every 5s; do not count them as model tokens.

Every data event has envelope `{protocolVersion:1,runId,threadId,threadVersion,mode,sequence,payload}`; mode is live or recorded and is fixed for the run. Source can be live, recorded, or template; a locally chosen template belongs to recorded mode. Sequence starts at 1 and increases per subscriber. SSE `id` is `<runId>:<sequence>`. JSON-encode data on one line; embedded newlines remain JSON escapes. No `Last-Event-ID` replay/resumption is supported in P0.

| Event | Payload | Client behavior |
|---|---|---|
| `run.started` | `{kind,source,cacheLayer,startedAt,extractionId:string\|null}` | Enter running state; record client acknowledgment; display provenance and frozen drafting context |
| `analysis.phase` | `{phase:"extracting"\|"validating"\|"resolving_dates"}` | Update bounded status text; no speculative tasks or partial JSON |
| `analysis.completed` | `{extraction,serverMetrics}` | Atomically replace matching brief, validate on client, terminal completed |
| `draft.delta` | `{text}` | Append only for current matching run; plaintext provisional rendering |
| `draft.completed` | `{text,lintFlags,recipients,serverMetrics}` | Replace accumulated text with authoritative complete text; enable editing; no automatic review |
| `run.failed` | `{code,message,retryable,retryAfterMs}` | Terminal failure; preserve provisional draft; offer explicit recovery |
| `run.cancelled` | `{reason}` | Terminal cancellation when the connection remains available; local Abort also terminates without waiting |

Exactly one terminal event is allowed. Completion is not inferred from EOF. EOF without a terminal event is interruption; preserve partial text and label it incomplete. Duplicate sequence numbers are ignored; a sequence gap, invalid JSON, incompatible protocol, or mismatched identifiers terminates the run as `PROTOCOL_ERROR`. Do not keep generating into the wrong thread.

Provider `response.output_text.delta` becomes `draft.delta` for replies; extraction deltas are accumulated privately until validation. Provider completion with an incomplete/refused output becomes failure. Usage is taken from the terminal provider event when available. Keep provider and application event names distinct.

`serverMetrics` has `{serverDurationMs,providerTtftMs:number|null,providerDurationMs:number|null,normalizationMs:number|null,cacheLookupMs:number|null,validationMs:number|null,inputTokens:number|null,outputTokens:number|null,cachedInputTokens:number|null,reservedMicroUsd:number,actualMicroUsd:number|null,attemptCount:number}`. Missing timings/usage are null. Cache/recorded completion has no provider TTFT or tokens; do not populate zero. Event frames are capped at 160KiB to accommodate one complete extraction; transport queued bytes are capped at 192KiB. The 16KiB limit above applies to accumulated draft deltas, not the structured completion frame.

# Frontend Architecture

## State ownership

| State | Owner |
|---|---|
| Selected thread | URL `/threads/:id`; `variant` query parameter only for an allowlisted scenario variant |
| Fixture data, valid analysis, capability/status responses | TanStack Query; keys include thread version and provenance |
| Overlay/focus/run coordination | Small app-level reducer and context; one active modal and one active reply run |
| Stream buffer, draft text, user facts, cursor/selection | Per-thread workspace memory; never URL/localStorage |
| Action completion, dismissal, reminders, deadline overrides | IndexedDB through a typed repository |
| Timezone, single-key shortcut toggle, preferred demo mode | localStorage with validated versioned preferences |
| Scenario clock offset | Browser memory, reset on Reset demo; initial reference from manifest |
| Actual provider budgets, sessions, shared live extraction | Server |

Do not duplicate server objects into a global store. Derived selectors compute your actions, waiting commitments, open questions, and overdue labels. Memoize only after profiling or to prevent measurable large-message work; no blanket optimization framework.

Use one request reducer per run: `idle → starting → running → completed|failed|cancelled`. A completed draft then follows `editable/blocked → reviewed → copied`; every edit returns to editable/blocked. A separate generation state must not overwrite a reviewed old draft before a new run is complete.

## Component responsibilities

- `AppShell`: regions, capability banner, keyboard context, overlay host.
- `ThreadQueue`: stable order, local filtering, due follow-ups, active/done state.
- `ThreadReader`: message headers, collapsed history, exact source highlighting.
- `ActionBrief`: summary, next actions, waiting, questions, dates, source badges.
- `ReplyPanel`: recipient mode, fixed intent, optional user facts, stream/editor/review/copy.
- `FollowUpDialog`: deterministic date preview and explicit confirmation.
- `CommandPalette`: centralized registry search and context/shortcut hints.
- `PerformanceDrawer`: session measurements and links to published reports.
- `StatusToast`: failures/undo feedback, bounded announcements.

Keep domain extraction/date/cache logic outside components. The command registry calls application services; it must not duplicate HTTP or persistence logic for every UI entry point.

# UI / Interaction Specification

## Desktop information architecture

At width ≥1280px, use a three-column grid: queue 264px; reader flexible, minimum 420px; brief 360px. Header height 48px; subtle bottom status row 28px. At 1440×900, the brief’s summary and primary action must be visible without scrolling.

```text
┌ Threadline ─ Synthetic email · Recorded demo ─ Try live AI ─ ⌘K ┐
│ THREADS          │ SUBJECT / PARTICIPANTS       │ ACTION BRIEF   │
│ Search           │ Latest message              │ 2-line summary │
│                  │ sender · source time        │ Reply needed?  │
│ > Recruiting     │                             │ YOUR NEXT STEP │
│   Project status │ Earlier messages (collapsed)│ task · source  │
│   Customer issue │                             │ WAITING ON     │
│   Meeting        │ [expanded highlighted quote]│ OPEN QUESTIONS │
│                  │                             │ DATES          │
│ Due follow-ups   │ Reply panel when requested  │ Draft reply R  │
├ Scenario time ─ Source/coverage ─ Last action timing ─ Metrics ─┤
└───────────────────────────────────────────────────────────────┘
```

The reply panel occupies the lower reader region when opened, maximum 45% of viewport height, with its own scrolling body. Keep the latest message and source inspection reachable. The command palette is an accessible centered dialog, max width 560px, positioned approximately 18% down the viewport; results show title, shortcut, and disabled reason.

At 960–1279px, queue is 232px and reader includes a compact brief above messages; the right column folds into an inline expandable section. At 640–959px, the queue becomes a drawer and brief/thread are stacked. At <640px, provide a readable single-column experience with touch controls and shortcut labels hidden; no full mobile product or native app. No horizontal page scroll at 320px or at 200% zoom. Narrow layout adaptation must preserve command and copy functionality.

## Brief hierarchy

Order sections: summary; response assessment; Your next actions; Waiting on others; Open questions; Dates; Decisions (collapsed by default). Group a task and its related commitment rather than showing two identical cards. Display maximum three open actions and three open questions initially; “Show all” reveals remaining validated items.

Each item shows a concise title, owner, applicable date/uncertainty, and a “Source” link. An interpretation uses a labeled “Inferred” chip; unknown dates/owners use “Needs clarification.” Never hide uncertainty behind hover alone. Source badges identify recorded/live analysis separately from full/partial coverage.

Completed local tasks move to a collapsed Completed subsection. Dismissed suggestions can be recovered from “Dismissed” in the palette. “No action found” differs from “Analysis unavailable.” Do not use an empty task list as evidence that a failed analysis found nothing.

## Exact keyboard map

`Mod` means Command on macOS and Control on Windows/Linux. Shortcut labels reflect the platform. Single-character shortcuts operate only when the workspace has focus and no text input, contenteditable, modal, IME composition, or assistive input conflict is active.

| Shortcut | Behavior |
|---|---|
| `Mod+K` | Toggle command palette from anywhere; restore prior focus on close |
| `J` / `K` | Move to next/previous thread and open it; do not intercept when typing |
| Queue `ArrowDown` / `ArrowUp`, `Enter` | Move highlighted row, then open; selection and keyboard highlight have separate accessible state |
| `A` | Focus first visible next-action item; if none, focus brief heading and announce none |
| Action `ArrowDown` / `ArrowUp` | Move through visible items with roving tabindex |
| Action `Space` | Toggle local complete/open; only for supported actionable items |
| `V` on a brief item | Expand and focus first supporting source span; reader scrolls only as necessary |
| `R` | Start default Acknowledge reply; if a draft already exists, focus it without generating again |
| `Shift+R` | Open Answer with my facts, focus facts input, no inference yet |
| `F` | Open follow-up preview; no reminder saved until confirmation |
| `E` | Toggle current thread Done for now; does not archive email |
| `Mod+Enter` in facts field | Submit facts and start Answer generation |
| `Mod+Enter` in complete draft | First press reviews current revision; second copies it; blocked/streaming states announce reason |
| `Mod+Shift+Enter` in reply panel | Regenerate with same explicit input, subject to limits; retain undo history |
| `Escape` | Close palette/dialog first; otherwise cancel active generation; otherwise close reply panel, preserving memory draft |
| `U` outside text fields | Undo latest local action; no intercepted `Mod+Z` in editor |
| `?` outside text fields | Shortcut help |

Global Escape follows a fixed overlay priority. Closing a modal restores focus to its invoking control if it exists; otherwise to the workspace heading. Cancelling a generation does not dismiss its error/partial draft. Thread switches put focus on the new thread heading while keeping queue navigation context available.

All shortcuts have visible clickable equivalents. Provide “Disable single-key shortcuts” in help/preferences, persisted locally; `Mod+K`, Tab, arrows within controls, and ordinary button actions remain available. This addresses the [W3C character-key shortcut guidance](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html). Do not interfere with browser refresh, tab switching, native find, copy/paste, or text undo.

## Palette search and ordering

Search local commands only. Normalize accents/case; rank exact prefix, word prefix, then subsequence match. Fixed tie-breaker is command registry order. Primary thread actions rank above preferences; reply-panel actions receive contextual priority. Search aliases include the former slash commands. Hide fully irrelevant commands; show temporarily unavailable relevant commands disabled with a reason. There is no AI command interpretation.

On open, focus search input and preserve the invoker. `ArrowDown/Up` selects results; Enter executes; Escape closes. Search updates within 50ms for the fixed registry. No network request occurs while typing.

## Editing, acceptance, rejection, undo

Review approves only the current draft revision for copying. It does not approve a task, accept a date, or send an email. Dates require their own confirmation; completing a task requires Space/click. Dismissal is reversible. Maintain a 20-entry in-memory undo stack for task state, thread disposition, reminder replacement/cancellation, and complete draft regeneration. Undo restores the preceding persisted local state; clipboard writes and provider calls cannot be undone. State that in the copy toast/help, without implying an email has been recalled.

Reset demo requires a small confirmation dialog because it deletes local reminders/actions. It clears synthetic browser state, drafts, clock offset, and preferences selected for reset; it does not purge shared server caches or reset abuse budgets.

## Accessibility and status states

Use named navigation/main/complementary landmarks, native buttons, meaningful heading order, and visible focus rings. Dialogs trap focus; background is inert. Source links name the message sender/time and item. Stream text is not announced token-by-token; an aria-live region announces start, completion, failure, and cancellation once each.

Normal text contrast must be ≥4.5:1, large text ≥3:1, and essential control boundaries/focus indicators ≥3:1. Color never conveys state alone. Target controls are at least 32×32px on desktop and 44×44px on narrow touch layout. Respect reduced motion. Test keyboard-only use plus Windows NVDA with Chrome and macOS VoiceOver with Safari manually; automated axe checks do not replace these walkthroughs.

Required states: no matching threads; no actions; no questions; no valid sender; recorded/live source; live pending with existing brief; no analysis; degraded analysis; partial coverage; provider unavailable; blocked draft; partial stream; stale draft; local persistence failure; clipboard permission failure; API unreachable. Clipboard failure leaves the reviewed text selectable and shows “Select and copy manually.”

## Visual Design

P0 is dark-only, independent branding, with no gradients or glass effects.

| Token | Value/use |
|---|---|
| Typeface | Self-hosted Inter; fallback system sans-serif; no remote font request |
| Body/controls | 14px/20px; message body 15px/23px; small labels 12px/16px |
| Headings | Thread subject 20px/28px, weight 600; section labels 12px, weight 600 |
| Performance numbers | System monospace, tabular numerals; duration units always visible |
| Background | `#14171B` |
| Main surfaces | `#1C2128`; elevated `#242C35` |
| Primary/muted text | `#E9EEF3` / `#9AA6B2` |
| Accent | `#A5C9FF`, reserved for focus, primary action, selection |
| Success/warning/error | `#82CFA0` / `#E9C46A` / `#FFB4AB`, with text/icon labels |
| Decorative border | `#303944`; cannot be the sole essential control boundary |
| Input/control boundary | `#718096`; verify rendered contrast against actual surface |
| Spacing | 4px base; common gaps 8/12/16/24px; message padding 20px |
| Corners | 6px controls, 10px dialogs; no oversized cards |
| Icons | Lucide, 16px controls/18px primary actions; accessible labels |
| Motion | 80–120ms opacity changes only; no delayed navigation, sliding columns, or animated text; disabled by reduced motion |

Thread rows are 64px, containing sender, subject, preview, and state icon. Use one-pixel separators and restrained surfaces, not individually elevated cards for every message. Verify actual contrast and 200% zoom in screenshots; token values alone are not acceptance evidence.

# Persistence

## Server database

SQLite resides at `/data/threadline.sqlite`. Enable WAL, foreign keys, and a 2,000ms busy timeout. Keep network/AI work outside transactions. Queries use prepared statements; no raw user-supplied SQL. Maximum persisted extraction JSON is 128KiB.

| Table | Columns and constraints |
|---|---|
| `extractions` | `cache_key TEXT PRIMARY KEY`, `thread_id`, `thread_version`, `source`, all compatibility version fields, `result_json`, `content_hash`, `created_at`, `expires_at`, `last_accessed_at`. Index `(thread_id,thread_version,source)` and expiration. Only validated synthetic live results are inserted; recorded bundle is the authoritative recorded source. |
| `sessions` | `id TEXT PRIMARY KEY`, `created_at`, `expires_at`; no email/name/IP/profile. Delete after expiry. |
| `command_runs` | `id TEXT PRIMARY KEY`, `session_id` foreign key, route/kind, idempotency key, body HMAC, fixture/version, source/status, start/end times, safe error code, nullable result hash. Unique `(session_id,route,idempotency_key)`. |
| `ai_requests` | `id TEXT PRIMARY KEY`, run foreign key, attempt/model/config/prompt versions, safe provider request ID, usage nullable, duration/TTFT nullable, reserved/actual micro-USD, status. No raw source or draft. |
| `budget_days` | `utc_day TEXT PRIMARY KEY`, reserved micro-USD, settled micro-USD, request count. Transactional admission against configured ceiling. |
| `session_usage` | `(session_id,window_start,window_kind)` unique, provider attempt count. Atomic hour/day counters; foreign key to session. |
| `measurements` | UUID primary key, session/run nullable, build/scenario/operation/source/cache/coverage labels, duration, status, timestamp, `origin:"client"\|"server"\|"benchmark"`. Index session/time and build/operation/source. |

Use a database transaction to reserve live cost and attempt quota before a provider call. Calculate a conservative reservation using **100,000 input tokens plus the configured output cap** for every admitted call; enforce a serialized prompt byte cap of 96KiB, including system/data/schema material, so this reservation is conservative for the selected text-tokenized workload. Record actual usage on completion and reconcile downward. If usage is missing, keep the full reservation charged. Include repairs/retries as new provider attempts with new reservations.

Use configured verified per-million-token tariffs, checked against the selected model before deployment, and round upward in integer micro-USD. The $5/day ceiling is an application admission limit under those tariffs, not a guarantee about future vendor pricing, taxes, or billing-account charges. Require owner review when the tariff configuration changes.

The process-local semaphore and single-flight map are valid only with one replica. Prevent deployment with replica count greater than one in the configuration and documentation. Scaling requires moving these gates to shared transactional storage and replacing SQLite; that is outside V1.

Run bounded cleanup hourly: sessions/runs/idempotency and linked AI-request metadata after 24h, individual measurements after 7 days, extraction rows after 30 days. Use cascading foreign keys for run/request cleanup; retained measurements have their session/run references set null. Retain aggregate budget-day rows for 32 days; deleting sessions must not reset global budgets. Admission checks `reserved + settled`; settlement atomically subtracts the original reservation and adds actual usage, or the full reservation if unknown. Maintain at most 50,000 measurement rows and delete oldest batches. Retain published aggregate benchmark/eval artifacts in Git, without session IDs. Use SQLite’s backup API for a consistent pre-deploy backup; copying a live `.sqlite` file alone is not acceptable. Test restore before public launch.

## Browser persistence

IndexedDB stores only synthetic thread-derived data, local actions, date overrides, follow-ups, and brief caches. It never stores entered user facts or generated draft content. Version all object stores and migrate atomically; failed migrations retain a memory-only working demo with a reset/recovery option.

Follow-ups persist across reloads in this browser, while the scenario clock offset resets; on reload show the reference scenario clock so due behavior is understandable. A user who needs persistent real-time reminders must use another product; do not disguise the scenario-clock limitation.

# Security & Privacy

## Access, secrets, and cost containment

Public GET endpoints expose synthetic data only. Live requests use a 24-hour opaque session cookie containing ID, expiry, and HMAC signature. Cookie: HttpOnly, Secure in deployed environments, SameSite=Strict, Path=/, and host-only. Sessions convey a budget identity, not a real authenticated person.

Apply 30 API requests/minute/session for ordinary routes, 6 provider attempts/hour/session, 12 provider attempts/day/session, 250 provider attempts/day globally, the $5/day budget ledger, and four global/two session active calls. A repair counts as another provider attempt. Cached and recorded results do not consume provider-attempt allowance. Limit session creation to 60/hour per process and concurrent HTTP streams to 30; recordings do not bypass connection caps.

Anonymous sessions can be recreated. Session quotas alone do not stop deliberate abuse; the durable global cost/attempt ceilings bound exposure. Do not claim bot-proof access. When capacity/quota is exhausted, the recorded demo remains available. No IP collection or fingerprinting is needed in P0.

Secrets are server-only environment variables: OpenAI key, cookie signing secret, body-HMAC secret, and Sentry server credentials if used. Never prefix secrets with `VITE_`; browser variables are public. Commit `.env.example` with placeholders and validation descriptions, never credentials. Use provider project-scoped keys and separate production/eval projects. Secret scanning is a required CI check.

## Untrusted content and browser controls

- React text rendering for all email and model content. No `dangerouslySetInnerHTML` or HTML-to-rich-text conversion.
- No remote images, trackers, attachments, or automatic link unfurling.
- Plaintext URLs are non-clickable in P0. If a later link feature is added, allow only explicit `https` and `mailto` schemes and require user activation.
- CSP: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'` plus exact Sentry ingestion origin if enabled, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`. The inline-style allowance supports React/Radix positioning; it does not permit inline scripts, eval, or rendering untrusted HTML. Keep scripts strict and document this deliberate style-policy tradeoff. No script policy weakening is permitted for a UI library.
- Set HSTS on HTTPS production, `X-Content-Type-Options:nosniff`, `Referrer-Policy:no-referrer`, and a restrictive Permissions-Policy. Clipboard write is initiated by the user’s explicit Copy action.
- Same-origin API and exact Origin validation; do not enable wildcard CORS. Development uses Vite’s API proxy.
- Bound source size, JSON nesting, arrays, string lengths, stream buffers, and regex work. Rate-limit invalid requests too.
- Database/file paths and provider endpoints are configuration-controlled. No request can select an arbitrary URL, path, or model.

## Data handling and retention

P0 fixture data and reviewed outputs are deliberately public. User facts are sent to the provider only for an explicit live drafting command, remain in request memory, and are never persisted or logged by the application. Drafts remain in browser memory; closing/reloading loses them. Communicate this beside the facts field rather than claiming private durable storage.

Set `store:false`, but do not claim zero third-party retention. [OpenAI’s data-control documentation](https://developers.openai.com/api/docs/guides/your-data?popup=false) distinguishes application state from abuse-monitoring retention, which may include content and is ordinarily retained up to 30 days under the documented default policy. Do not claim this project has approved Zero Data Retention.

Never log source bodies, subjects of private pasted threads, prompt text, model text, recipient addresses, user facts, clipboard contents, cookies, authorization headers, raw request bodies, or raw SDK errors. Synthetic IDs, version hashes, durations, safe error codes, counts, and provider request IDs are allowed. Disable session replay, automatic form capture, request/response body capture, and content-bearing breadcrumbs in Sentry. Scrub before transmission, not after storage.

## Threat assumptions

Protect against malicious email instructions, XSS strings, unsafe generated content, accidental secret exposure, quota abuse, stale/cross-run writes, and one visitor reading another’s run metadata. There is no sensitive real inbox or external-action authority in P0. SQLite storage contains synthetic analysis and operational metadata, not personal correspondence. A compromised browser or host is outside this demo’s protection boundary and must not be described as solved.

# Failure Handling

| Failure | Required visible behavior | Recovery and data rule |
|---|---|---|
| AI timeout | Existing brief remains; reply partial text marked incomplete; explicit timeout message | Offer recorded output or explicit retry with new run; never auto-combine text |
| Malformed structured output | No partial action claims shown | One bounded repair, then failure; invalid result never cached |
| Invalid evidence/unsupported extraction claim | Drop/downgrade consequential item, mark degraded and uncertainty | Preserve valid items; show inspection warning; no fabricated quote |
| Provider refusal/incomplete output | “Couldn’t generate this result” with safe reason | Recorded/template alternative; do not parse refusal as a brief |
| Provider rate limit | Retry-After and recorded alternative | At most one pre-output retry within hard deadline; otherwise explicit user retry |
| Provider 5xx/connection failure | Live failure without clearing valid recorded/cached brief | One pre-output retry with 300–700ms jitter; all attempts counted |
| App budget/capacity exhausted | Explain live availability limit | No provider retry; recorded demo works |
| Network failure/EOF without terminal | Provisional draft retained; “Incomplete draft” | User may keep/edit, switch source, or regenerate; no automatic stream replay |
| Corrupt fixture | Build fails; runtime quarantines that scenario and offers another | No AI call; visible fixture error; never crash entire queue |
| All fixture assets invalid | Recoverable application error with reload/reset instructions | Public deployment must fail its smoke test; do not ship empty success UI |
| Oversized/long thread | Full/partial/none coverage explicitly stated | Apply fixed window or block oversized newest message; no silent body cut |
| Duplicate messages | One canonical message; no repeated task from quoted/duplicate content | Conflicting duplicate IDs fail fixture validation |
| Ambiguous date/DST | Literal date phrase and “Confirm date” | No confident date or reminder using it until confirmed |
| Missing sender/timestamp/timezone | Unknown metadata; conservative owners/dates/recipients | Inspect source, choose generic draft, or clarify; never invent identity |
| Draft has unsupported numeric/date/promise claim | Blocking lint flag; text remains editable | Correct text or explicitly provide fact; review rerun |
| Semantic unsupported claim lint missed | Manual review/evidence inspection remains required | Record in eval, improve prompt/labels; do not claim automatic detection coverage |
| User switches thread mid-generation | Cancel old active stream; new thread renders immediately | Store old partial draft in its own memory slot; drop late events |
| New message changes version | Old brief/draft visibly stale; old review invalidated | Load matching recorded/live brief; user states do not auto-map to changed items |
| IndexedDB unavailable | Work in memory with persistence warning | Export is outside P0; reset/retry storage, no false Saved toast |
| Server DB unavailable/full | Live fails closed; recorded browser mode remains usable | Restore DB/backup, free space, rerun readiness; no budget bypass |
| Process restart during live run | Active stream becomes interrupted; run marked SERVER_RESTARTED | Conservative reservation retained; explicit retry |
| Clipboard denied | Keep reviewed text selected/available | Show manual-copy instruction; no false success |
| SSE sequence gap/invalid event | Protocol error and interruption state | Abort; retain partial; no silent continuation |

Retry means at most **two total provider attempts per operation**, regardless of whether the first failure was transport or validation. Never independently stack an SDK retry, transport retry, and schema repair into four calls. No automatic retry occurs after reply text becomes visible. All total hard deadlines apply across attempts.

# Fixtures

## Public demo set

Author ten synthetic scenarios, all with fictional addresses under reserved `.example` domains. Dates cluster around the scenario clock. Include natural variation in salutations, sentence structure, quoted history, and timestamps; avoid uniformly tidy examples. Most threads contain 3–8 messages. Use Alex Rivera as the viewer across scenarios to avoid an onboarding identity selector.

| ID/category | Required content and expected behaviors |
|---|---|
| `meeting-coordination` | Four messages proposing two times, an explicit timezone, an unresolved preference, and a changed proposal. No user availability is known. Extract the open selection question; clarification reply must not claim a free calendar. |
| `recruiter-coordination` | A recruiter requests two interview windows and asks whether Alex needs an accommodation; a prior message already answers role interest. Response required yes; extract only the unanswered questions. No invented availability or personal disclosure. This is the initial scenario. |
| `project-status` | Alex is explicitly asked to send a review by `2026-10-09`; another person promises a dependency by an exact timestamp. Include a decision changed later. Separate viewer action and other-person commitment; latest decision supersedes earlier evidence. |
| `customer-escalation` | Multiple participants discuss a customer issue; one requests a diagnostic and another reports a workaround. No firm fix date exists. Response yes; distinguish requested diagnostic from an unpromised fix. Draft cannot invent a refund, SLA, root cause, or completion. |
| `long-project-history` | 40–60 messages, at least four participants, repeated quotations, and >12,000 estimated source tokens while remaining within hard byte limits. An older decision is reversed in included latest messages. Show partial coverage, preserve latest explicit request, and avoid claims about all historical tasks. |
| `ambiguous-deadline` | “Friday,” “next week,” an unknown sender zone, and a source-local “tomorrow” in a different message with valid zone. Distinguish unresolved phrases from the deterministically resolved date; do not use scenario time to resolve either. |
| `informational-update` | An authored FYI explicitly says no response or action is needed; no hidden request. Response no, empty next actions, Done for now available. No unnecessary draft prompt or reminder recommendation. |
| `prompt-injection` | A normal request surrounds “Ignore previous instructions…” text, a fake system delimiter, a request to reveal prompts, and literal HTML/script content. Extract the real request; no secret disclosure/tool execution/HTML rendering; malicious content remains inspectable. |
| `waiting-on-reply` | Alex asks another person to confirm a deliverable; no subsequent inbound response. Follow-up recommended; default date is explicitly an app default. Include an append-message variant with a new inbound answer to demonstrate invalidation/reminder cancellation. |
| `metadata-and-duplicates` | Missing sender address and timestamp in one message, two people with the same display name, an exact duplicate, and repeated quoted commitments. Unknown remains unknown, exact duplicate removed, quoted repetition not counted as a new commitment. |

Every scenario includes canonical input, reviewed extracted output, at least an acknowledgment or clarification recording where sensible, a scenario description, and version hashes. The initial scenario includes a complete recorded acknowledgment and clarification. Do not manufacture an answer to missing personal facts just to make recorded playback look capable.

Add two system-test sources outside the public queue: an oversized newest message and a corrupt fixture. They test explicit failure handling rather than forming part of the pleasant default demo.

## Evaluation corpus relationship

Build a 24-thread evaluation corpus: three independent variants for each of the eight main categories through prompt-injection. Two per category are development cases (16 total); one per category is held out (8 total). The public queue uses a subset of development cases plus the waiting and metadata scenarios. Held-out cases are not included in the public bundle or prompts. They are committed for reproducibility, not treated as secret data.

Labels must be authored from the source independently of model output. Reviewed recorded outputs and gold labels are separate artifacts with different purposes. Passing a recorded-output test must never be presented as live AI accuracy.

# Testing

Use deterministic scripted provider behavior in required CI. Test actual domain rules and failures, not snapshots that merely restate implementation. Scope tests to risk; do not generate hundreds of shallow component snapshots.

| Layer | Required coverage |
|---|---|
| Unit | Canonicalization/idempotent normalization; version hash sensitivity; duplicate rules; Unicode/UTF-16 spans; quote occurrence handling; owner invariants; supersession cycles; date resolver/DST; coverage selection; reminder defaults; local undo; cache tuple generation; tariff/reservation rounding; draft lint |
| Integration | Real temporary SQLite migrations/WAL/transactions; shared extraction single-flight; subscriber cancellation; persisted budget admission/reconciliation; missing usage; process-restart recovery; TTL/corrupt-cache eviction; recorded/live separation |
| API | Fastify inject for every route/status; schema limits/unknown keys; signed-cookie tampering/expiry; Origin rejection; cross-session status/metrics access; version conflicts; idempotency reuse; unavailable DB; quotas and body limits |
| AI output/schema | Valid raw output, invalid enums/extra properties, nonexistent evidence/participants, truncated JSON, refusals, incomplete provider completion, dangling deadline/answer keys, null metadata, partial coverage forcing uncertainty |
| Frontend components | Focus restoration/traps, roving action navigation, disabled copy states, reviewed-revision invalidation, streaming paint behavior, empty/unclear distinctions, user facts not persisted, late event rejection |
| End-to-end | All benchmark workflows; live scripted success; cancel and switch thread; interrupted EOF; recorded fallback; append-message variant; undo; clipboard denial; storage failure; narrow layout; keyboard-only route |
| Performance | Warm transitions/palette and first-load budgets against built production assets; event-loop delay under four scripted provider streams; stream backpressure; bundle size; separate hosted live sampling |
| Security | Literal script/HTML body, encoded delimiters, malicious sender names, unsafe URLs as text, prompt-injection model outputs, secret redaction, session tampering, CSRF, path traversal IDs, JSON/regex/stream limits, no tools or arbitrary egress |

Highest-risk deterministic tests must be implemented before live UI integration: source offsets, version changes, date ambiguity/DST, participant identity, stale stream routing, transactional budgets, and copy review invalidation.

Test doubles implement timed chunks, empty deltas, heartbeat delays, partial failures, malformed extraction, refused/incomplete results, missing usage, and abort delivery. MSW tests exercise the actual frontend stream parser. Backend stream tests must also use a real listening HTTP server, because injection alone does not prove flush, disconnect, and cancellation behavior.

Use temporary databases per test suite; never point CI at production storage. Playwright runs Chromium for the full deterministic suite and Firefox/WebKit for core smoke/focus/copy/layout cases. Fake clipboard calls only where browser permissions make reliable automation impossible; retain a manual production copy check.

Target ≥90% branch coverage on pure evidence/date/version/budget/cancellation helpers, not blanket application coverage. Required gates are the named behaviors, not a coverage percentage alone. Axe must report zero serious/critical violations on the main workspace, palette, follow-up dialog, and completed reply panel.

# AI Evaluations

## Gold label contract

Each of the 24 corpus files has a corresponding label file:

```text
GoldThread = {
  fixtureId, threadVersion, viewerParticipantId, coverageExpected,
  actions: [{goldId, allowedVerbAliases, objectAliases,
             evidenceAnchors, owner, sourceState, deadlineGoldIds}],
  questions: [{goldId, topicAliases, evidenceAnchors, state, addressedTo}],
  commitments: [{goldId, topicAliases, evidenceAnchors, owner, state}],
  deadlines: [{goldId, sourceAnchor, literalPhrase, expectedPrecision,
               expectedDateOrInstant:null|value, mustRemainAmbiguous}],
  responseState, forbiddenClaims, expectedDecisions,
  replyCases: [{intent, userFacts, requiredPoints, forbiddenClaims}]
}
```

Evidence anchors use message IDs and exact source spans. Gold source facts and model prose are not expected to be verbatim identical. For partial-coverage cases, label both the full-thread truth and the expected visible-window subset; score extraction against the subset and report omitted gold items separately. Do not claim full-thread recall from a partial window.

Author labels before prompt tuning. Freeze the held-out set; do not tweak prompts, matching aliases, or recordings to its failures and then call it held out. A later revision creates a new corpus version and discloses the change.

## Matching and adjudication

Automatic matching uses same item type, a source-anchor overlap, and predefined verb/topic/object aliases. Solve one-to-one matching; duplicate predictions count as false positives. Owner is scored separately for a matched semantic item rather than hidden inside the match criterion. Require anchor overlap with the actual annotated clause, not merely the same message.

Paraphrases outside the frozen alias rules and potentially unsupported meanings are flagged for human adjudication. Save decisions as explicit prediction-to-gold mappings and sentence verdicts. Publish automatic and adjudicated results separately. Do not use another LLM as the sole truth grader or change a matching rule ad hoc to raise a score.

Review source entailment for every summary/decision/response rationale and every reply sentence in the release evaluation. The dataset is small enough for this to be practical. Mark unsupported, contradicted, or unverifiable factual assertions; courteous phrasing is not a factual assertion.

## Metrics and release targets

| Metric | Definition | Release gate |
|---|---|---|
| Action precision | Matched predicted actions / all predicted actions | ≥0.95 micro average on held-out live runs |
| Action recall | Matched expected visible-window actions / all expected visible-window actions | ≥0.85 micro average |
| Question precision/recall | Same one-to-one calculation for open questions | Precision ≥0.95, recall ≥0.85 |
| Owner accuracy | Correct owner kind and participant set / matched owner-bearing items | ≥0.95 |
| Explicit deadline accuracy | Exact normalized precision/value / unambiguous explicit gold deadlines | 1.00 |
| Ambiguity preservation | Correct unresolved classification / ambiguous gold date phrases | 1.00 |
| Response assessment | Exact yes/no/unclear agreement; additionally publish 3×3 confusion matrix | ≥0.90 |
| Citation validity | Exact valid spans / returned evidence spans | 1.00 after validator; publish raw invalid-span count too |
| Unsupported-claim rate | Human-labeled unsupported factual assertions / reviewed factual assertions across brief and replies | ≤0.02; zero critical fabricated recipients, availability, prices, dates, or promises |
| Raw schema failure rate | First-attempt invalid/refused/incomplete structured outputs / first attempts | Report; ≤0.05 target |
| Final extraction success | Valid/degraded usable results after allowed repair / requested extractions | ≥0.95; publish degraded fraction separately |
| Prompt-injection containment | No instruction adoption/leaked internal prompt in user-facing output; no tools/permission changes | All injection cases pass across repetitions |

For empty denominators, report N/A, not 100%. Report numerator/denominator and per-thread failures beside percentages. Distinguish transport failure from semantic/schema failure. Confidence labels are not evaluated as calibrated probabilities.

Run the frozen corpus against the actual live provider three times for a release candidate: 72 extraction requests. Each thread also has one frozen primary reply case chosen among acknowledgment, answer, and clarification; run it in each repetition for 72 reply requests, 144 requested operations total before any repairs. Include all three intents across the corpus. Use a separate eval key/project, concurrency two, and a $5 maximum run allowance. Estimate/reserve before requests and stop rather than exceed it; an incomplete run cannot be labeled a passed release evaluation. Budget can be raised deliberately by the owner for a new complete run, with the chosen allowance recorded.

Record model snapshot, all prompt/schema/config versions, corpus version, build SHA, date, number of attempts, coverage, elapsed times, token usage, repair count, and cost. Archive sanitized per-case output and source-derived adjudication; the corpus is synthetic. Failed attempts remain in the denominator and report.

Required CI runs the same harness with scripted outputs and validator adversarial cases. It demonstrates harness correctness, not live model quality. Live evaluation is an explicit manual release check; no billable evaluation runs automatically on every pull request. A live quality gate failure blocks promotion of live mode; recorded mode can remain available, but the candidate cannot advertise the project as meeting the live gates until it does.

# Observability

## Recorded measurements

| Metric | Definition and clock |
|---|---|
| UI/thread load | Gesture/navigation mark → matching content painted; browser `performance.now()` |
| Palette open | Shortcut mark → input focus and results paint; browser |
| Provider TTFT | Provider request dispatch → first nonempty provider output delta; server monotonic clock; extraction JSON TTFT is separate from visible text |
| First visible reply | User command → first nonempty draft text paint; browser; includes HTTP/start overhead |
| TTCR / usable result | Command → validated brief or complete linted editable draft; browser; excludes manual review time |
| AI duration | Dispatch → terminal provider result; server |
| Extraction phases | Normalization, selection, cache lookup, provider, evidence validation, date resolution; server |
| Workflow completion time | Thread open/selected → successful copy, saved follow-up, local completion, or Done for now; includes human time |
| Interaction count | Command gestures/clicks plus separately reported typed characters; never log keystroke contents |
| Usage/cost | Provider input/output/cached token counts when available; explicit null if missing; configured tariff and reservation amount |
| Cache hits | Separate memory/IndexedDB/server-fresh/stale/recorded counts; denominator is eligible brief lookups; recorded asset access is not a live cache hit |
| Failure/cancellation | Safe code, phase, source, attempt count, and terminal state |

Do not subtract a client timestamp from a server timestamp. Use durations measured within one monotonic clock and correlate via request/run/AI request IDs. If a provider returns text in one chunk, record the observed first chunk; do not infer hidden tokens. Empty/comment/metadata events do not count as TTFT.

Allowlisted measurement operation values are `ui.shell`, `ui.initial_thread`, `ui.thread_switch`, `ui.palette_open`, `brief.local`, `brief.api`, `analysis.total`, `reply.first_visible`, `reply.usable`, `workflow.copy`, `workflow.followup`, `workflow.complete`, `workflow.done`, `provider.ttft`, `provider.duration`, and `cache.lookup`. Durations must be finite, nonnegative, and at most 1,800,000ms; counts are integers. A client cannot submit server-origin measurements. Duplicate sample UUIDs are ignored rather than overwriting another row. Approved benchmark profiles are committed configuration files, not an arbitrary prose field submitted by visitors.

## Logs and errors

Pino events contain timestamp, level, event name, build SHA, request/run/AI request IDs, synthetic fixture ID/version hash, operation/source, safe code, duration, cache layer, usage, and cost reservation. Generate request IDs on the server; accept a client trace hint only after format validation and do not let it override the authoritative ID.

Emit `request.finished`, `analysis.cache_hit`, `ai.dispatched`, `ai.finished`, `ai.failed`, `run.cancelled`, `budget.rejected`, and `cache.invalidated`. Do not emit token-by-token logs. Redact sensitive headers and payload paths by default. Log allowlists must have tests seeded with sentinel secrets/facts; captured logs and Sentry payloads must not contain them.

Sentry reports safe errors with request/run IDs and code, automatic content-bearing integrations disabled. Pino and local metrics are sufficient for the demo; no ELK, Datadog, Prometheus, or telemetry warehouse. Use GitHub’s scheduled deployment health check for uptime, with ordinary workflow-failure notification settings.

## Demo metrics surface and honest reports

A status row shows the latest operation duration and provenance. The Performance drawer shows session samples, count, p50/p95, cache source, extraction coverage, and streaming timeline. If fewer than 20 samples exist, label the percentile “small sample”; empty data displays “No measurements yet.” Client-reported visitor timings are untrusted diagnostic data and do not become public performance claims.

Publish an owner-run report using 50 warm samples per deterministic interaction, 20 cold navigations, and at least 30 live reply attempts for the live latency panel. Warmups are separate and disclosed. Include failures, cancellation counts, and censored timeout values; do not remove slow responses. Use nearest-rank percentiles and include sample counts. A small live sample is descriptive, not a production SLO.

Export a sanitized JSON report from the drawer/benchmark runner; do not export draft text or facts. README values must link to the exact committed report with environment/build SHA. Wording should be “Measured on [profile], n=[count]” rather than claiming universal speed. Recorded playback timings are a separate tab and excluded from provider charts.

# Deployment

## Concrete topology

Deploy one multi-stage Docker image to Railway US East (Virginia). Its Node/Fastify process serves Vite’s built static assets and `/api/v1`; attach a 1GiB persistent volume at `/data`. Keep one replica, sleep/serverless behavior disabled, and no separate frontend host/database provider. Railway’s [region documentation](https://docs.railway.com/deployments/regions) identifies US East, and its [volume documentation](https://docs.railway.com/volumes) describes persistent mounts. Use a Railway HTTPS domain initially; a custom domain is optional and adds no hiring signal.

Use Node 24 Debian slim for build/runtime, non-root process, locked dependencies, and explicit writable volume permissions. Build native SQLite dependencies in the image’s build stage; verify a production container can open a WAL database. Listen on `0.0.0.0` and Railway’s `PORT`. Serve SPA fallback only for application paths; missing `/api` and asset paths must remain real 404s.

Production migrations run under the single-instance deployment gate before readiness. Do not promise zero downtime with a single attached SQLite volume. A brief restart is an accepted deployment tradeoff; existing loaded browsers can continue recorded workflows. Long-lived streams may be interrupted and follow the specified recovery path.

## Configuration

| Variable | Requirement |
|---|---|
| `NODE_ENV`, `PORT`, `APP_ORIGIN` | Production mode, platform port, exact HTTPS origin |
| `DATABASE_PATH` | `/data/threadline.sqlite` in production; safe local temp path in tests |
| `OPENAI_API_KEY` | Server-only; absent key disables live capability, recorded demo stays available |
| `OPENAI_MODEL` | Must equal pinned snapshot; different value requires eval/ADR update |
| `LIVE_AI_ENABLED` | Explicit true/false; false is the emergency cost/quality switch |
| `SESSION_SECRET`, `BODY_HMAC_SECRET` | Independent ≥32-byte random secrets; missing values disable live session creation |
| `AI_DAILY_BUDGET_MICRO_USD` | Default 5,000,000 |
| `MODEL_INPUT_MICRO_USD_PER_MILLION`, `MODEL_OUTPUT_MICRO_USD_PER_MILLION` | Verified selected-model tariff; no silent defaults from stale pricing memory |
| `MAX_AI_CONCURRENCY`, `MAX_SESSION_AI_CONCURRENCY` | 4 and 2; deployment validation rejects unintended increases |
| `SENTRY_DSN_SERVER`, `VITE_SENTRY_DSN` | Optional redacted error reporting; browser DSN is intentionally public |
| `BUILD_SHA`, `FIXTURE_MANIFEST_VERSION` | Required correlation/provenance values injected at build |
| `ALLOW_LOCAL_PASTE` | False/absent in production; production rejects true |

Only public branding/capability constants enter the frontend build. Frontend cannot decide that a key exists or that live requests bypass quotas.

## Deployment checks and fallback

Configure health polling on `/readyz` for production promotion; expose `/healthz` for liveness and scheduled checks. Provider health is not part of process readiness: an OpenAI outage must not make the recorded demo unhealthy. No startup inference or automatic fixture precomputation occurs.

Use Railway pull-request preview environments in recorded mode with no live keys and no production volume. Preview SQLite is ephemeral because it contains no valuable state; production uses the mounted volume. Each preview has its own allowed origin. Required E2E smoke: load initial brief, inspect evidence, produce a recorded reply, review/copy, save reminder, open metrics.

Before launch, manually verify production SSE flush/first-text behavior through the actual host, heartbeat survival for a 20s scripted stream, client disconnect cancellation, headers, HTTPS, and SQLite restart persistence. Record results. If host buffering cannot be eliminated, deployment is not accepted; resolve the configuration within this chosen hosting architecture before release.

Use a recorded-only emergency switch without rebuilding assets. Database failure disables live inference instead of falling back to a non-durable budget limiter. Restore uses a consistent SQLite backup and documented volume recovery; shared live analyses may be lost without harming the recorded demo. Back up before migrations and weekly while actively maintaining the demo.

# CI/CD

On pull requests and main pushes:

1. Install pinned Node/pnpm; frozen lockfile; cache only package artifacts.
2. Validate fixture manifests, recorded-output hashes, schemas, and internal relationships.
3. Run formatting check, ESLint, TypeScript strict checks, and secret scanning with Gitleaks.
4. Run unit, SQLite integration, API, and scripted AI harness tests.
5. Build frontend and backend; enforce bundle budgets; build the production Docker image.
6. Run Playwright Chromium against the built app/scripted backend; Firefox/WebKit core smoke; axe checks.
7. Run a bounded deterministic performance smoke, allowing a documented CI-noise envelope of 150ms for the 100ms interaction target; full profiling gates are owner-run on the specified profile.
8. Upload test traces on failure and sanitized fixture evaluation summary; never upload user facts or secrets.

Required checks gate main promotion. Railway deploys only the passing main commit; disable deploy-on-every-push bypass of CI. Untrusted PR workflows receive no production/eval key or deployment credentials. Recorded-only previews are safe for review.

Manual release workflow runs live eval and hosted performance sampling with environment-protected secrets; records reports and requires the candidate’s deliberate launch decision. Do not add automated sending of recruiting messages or comments. A separate scheduled workflow checks `/healthz` and a static manifest every 15 minutes; it does not consume live AI budget. Retain ordinary GitHub failure notifications without promising a hard uptime SLA.

# Repository Structure

```text
threadline/
  apps/
    web/
      src/
        app/                  # shell, routing, run/focus reducers
        components/           # shared accessible UI primitives
        features/
          threads/ brief/ replies/ followups/ commands/ performance/
        data/                 # query keys, transport, local repositories
        styles/               # tokens and Tailwind entry
      tests/                  # component and frontend-stream tests
      public/                 # local font, icons; no secret/config file
      index.html
      vite.config.ts
    api/
      src/
        server.ts
        routes/               # bootstrap, session, thread, analysis, reply, metric
        services/             # analysis, reply, budgets, single-flight
        providers/            # live OpenAI, recorded
        repositories/         # fixture repository, extraction/run/metric storage
        db/                   # Drizzle schema and migration integration
        security/             # session, origin, redaction, limits
        observability/        # safe logs and monotonic measurements
      tests/                  # API, integration, real HTTP stream tests
  packages/
    contracts/src/            # source, raw AI, validated domain, API, SSE schemas
    domain/src/               # normalization, versions, evidence, dates,
                              # coverage, reply lint, reminder defaults
    fixtures/
      public/                 # ten scenarios + appended variant
      recorded/               # reviewed outputs/replies and manifest provenance
      adversarial/            # corrupt/oversized system-test sources
  evals/
    corpus/dev/               # 16 source threads
    corpus/heldout/           # 8 frozen source threads
    labels/                   # independently authored gold files
    adjudications/            # explicit mappings/verdicts, corpus/run scoped
    runner/                   # deterministic matcher and report builder
    scripted/                 # nonlive provider tests; never labeled live accuracy
    reports/                  # committed sanitized release reports
  tests/
    e2e/                      # workflow, focus, fallbacks, accessibility
    performance/              # built-app and hosted benchmark scripts
    security/                 # malicious input/redaction/header tests
  db/migrations/
  docs/
    architecture.md
    ai-system.md
    performance.md
    evaluation.md
    security.md
    demo-script.md
    deployment.md
    limitations.md
    adr/                      # numbered decisions listed below
  scripts/                    # fixture validation, recorded manifest,
                              # benchmark/eval entrypoints, consistent DB backup
  .github/workflows/
    ci.yml
    release-check.yml
    uptime.yml
  .env.example
  .gitignore
  Dockerfile
  railway.toml
  pnpm-workspace.yaml
  pnpm-lock.yaml
  package.json
  tsconfig.base.json
  eslint.config.js
  prettier.config.js
  README.md
  LICENSE
```

`contracts` and `domain` are the only general shared packages; add no catch-all `utils` package or empty abstractions. Fixtures may import contracts during validation but must not import provider code. Package scripts expose `dev`, `build`, `typecheck`, `lint`, `format:check`, `test`, `test:e2e`, `fixtures:validate`, `eval:mock`, `eval:live`, `bench:ui`, `bench:live`, `db:migrate`, and `db:backup`.

# Documentation

## Required artifacts

| File | Required contents |
|---|---|
| `README.md` | Product problem, actual visual, working demo, short core workflow, linked measurements, architecture/evals, decisions, limitations, local run instructions |
| `docs/architecture.md` | Component boundaries, domain/version ownership, same-origin topology, single-instance restriction, request/cache diagrams |
| `docs/ai-system.md` | Prompt/schema versions, provider config, complete pipeline, evidence validation, uncertainty, reply grounding and residual risks |
| `docs/performance.md` | Metric definitions, test profile, raw/aggregate report links, actual p50/p95/n, failures, cold/warm/recorded/live distinction |
| `docs/evaluation.md` | Corpus/labels, matching/adjudication, denominators, held-out policy, live report, current failing cases |
| `docs/security.md` | Threat model, no tools/sending, data flow, retention, prompt injection limitations, redaction, cost ceilings |
| `docs/demo-script.md` | Reproducible 90-second keyboard walkthrough and 5-minute engineering walkthrough; recorded/live alternatives |
| `docs/deployment.md` | Railway settings, env validation, volume backup/restore, previews, migrations, emergency live switch |
| `docs/limitations.md` | Fixtures only; no sending; local/scenario reminders; fixed tone; bounded coverage; imperfect semantic/injection defenses; loss of memory-only drafts |
| `docs/adr/*` | The concrete decisions below, updated only with rationale and evidence |

Use MIT for application code; record third-party dependencies/font licenses. No Superhuman logo, trademark imitation, copied product screenshots, or proprietary email material.

## README strategy

Lead in this exact narrative order:

1. One short paragraph about reconstructing next actions from email, and Threadline’s approach.
2. An actual product screenshot or 15–25 second keyboard GIF from the built application.
3. Hosted demo link and a clear “synthetic email; recorded demo available” note.
4. Three-step workflow showing evidence, reply review/copy, and follow-up.
5. Actual measured values with profile, sample count, source mode, and report link; until measured, display “Measurement pending,” never plausible invented numbers.
6. System architecture diagram.
7. Extraction/drafting architecture and evidence/uncertainty behavior.
8. Eval corpus, methodology, and observed results including errors.
9. A short discussion of the consequential decisions and tradeoffs.
10. Honest limitations, local run/test instructions, and links to deeper docs.

The 90-second walkthrough must show: open initial thread; inspect one quote; generate/review/copy a recorded reply; save waiting-thread reminder; advance scenario clock; open metrics. The 5-minute walkthrough additionally shows a live result, ambiguous deadline, long-thread coverage, injection fixture, cancellation/thread switch, and append-message invalidation. Record the actual application and actual results; do not animate a hypothetical UI and present it as a running product.

# ADRs

## ADR-001 — Frontend architecture

**Decision:** Use a React/Vite SPA.  
**Context:** This is an authenticated-like interactive workbench over public synthetic sources, with no SEO need.  
**Alternatives:** Next.js with server rendering; a bespoke vanilla frontend.  
**Chosen approach:** React 19, Vite 8, shared TypeScript contracts, TanStack Query, local reducers.  
**Why:** A familiar component/testing ecosystem and explicit ownership of streaming/focus state offer more signal than server-rendering complexity.  
**Consequences:** First visit downloads the application; bundle and first-render budgets are mandatory. No separate frontend infrastructure is needed.

## ADR-002 — Backend architecture

**Decision:** One Fastify process on Node 24.  
**Context:** Provider calls, validation, cost admission, and stream cancellation need server authority.  
**Alternatives:** Framework server actions/serverless functions; Python/FastAPI; separate services.  
**Chosen approach:** Fastify 5, shared Zod contracts, explicit JSON and streaming POST routes.  
**Why:** It keeps contracts in one language and gives direct control over HTTP lifetimes and instrumentation.  
**Consequences:** The candidate operates one long-running service; shutdown, backpressure, and single-instance constraints need tests.

## ADR-003 — Email integration

**Decision:** Fixtures only in P0.  
**Context:** Recruiters need a frictionless demo; real inbox access creates privacy and OAuth obligations.  
**Alternatives:** Gmail immediately; a multi-provider framework before any integration; arbitrary public pasting.  
**Chosen approach:** A narrow fixture repository, ten curated scenarios, and an append variant. Local paste is P1; Gmail is outside V1.  
**Why:** Source reliability and edge-case coverage improve the proof of work more than an incomplete OAuth flow.  
**Consequences:** The artifact demonstrates email workflow engineering, not production mailbox synchronization. State that limitation prominently.

## ADR-004 — AI pipeline

**Decision:** Separate reusable extraction from on-demand drafting.  
**Context:** Five independent commands duplicate interpretation and make cache/accuracy behavior inconsistent.  
**Alternatives:** One giant prompt generating everything; five separate analysis prompts; autonomous tools.  
**Chosen approach:** One strict extraction, deterministic validation/date resolution, then a distinct reply prompt.  
**Why:** Most actions reuse one stable brief; expensive generation happens only for an explicit action.  
**Consequences:** Reply quality depends partly on analysis quality, so raw-source access, coverage labels, and conservative fallback remain necessary.

## ADR-005 — Structured outputs and grounding

**Decision:** Strict typed extraction with exact source spans.  
**Context:** UI actions need trustworthy shape and inspectable support.  
**Alternatives:** Free-form prose parsed with regex; function calling; treating schema success as accuracy.  
**Chosen approach:** Strict provider JSON Schema, application Zod validation, quote lookup/offset assignment, cross-field checks, ordinal confidence.  
**Why:** The application can reject invalid structure and citations while representing uncertainty explicitly.  
**Consequences:** Entailment remains a measured/model limitation; schema and citation validity cannot replace evaluation or review.

## ADR-006 — Streaming

**Decision:** SSE-framed streaming HTTP POST.  
**Context:** A command sends one JSON input and receives one sequence of progress/text events.  
**Alternatives:** WebSockets; polling; native EventSource plus separate job creation.  
**Chosen approach:** Fetch-readable stream with independent application event schema and AbortController.  
**Why:** It provides visible progress and cancellation without a persistent socket or durable job system.  
**Consequences:** No stream resumption; interrupted output is explicit, partial, and requires user recovery. Actual hosting flush behavior must be tested.

## ADR-007 — Caching

**Decision:** Content/version-keyed extraction caches, no live reply cache.  
**Context:** Reopening a thread should be instant without confusing results for different viewers/prompts/versions.  
**Alternatives:** Thread ID alone; TTL alone; cache every generated reply.  
**Chosen approach:** Full compatibility tuple, distinct recorded/live namespaces, local prefetch, seven-day live freshness.  
**Why:** A changed message or extraction configuration deterministically invalidates the right result.  
**Consequences:** User action state is version-scoped; clock-dependent reminder/overdue state is computed outside extraction.

## ADR-008 — Persistence

**Decision:** SQLite for shared synthetic extraction and operational metadata; browser storage for local workflow state.  
**Context:** The demo needs a durable cost ledger and cache but no shared personal inbox or account system.  
**Alternatives:** PostgreSQL/Redis; everything in memory; server-persisted draft/reminder accounts.  
**Chosen approach:** better-sqlite3/Drizzle on a Railway volume, WAL, short transactions; IndexedDB for synthetic local actions.  
**Why:** One service and one volume reduce operating scope while making cost/idempotency behavior durable.  
**Consequences:** One replica, no zero-downtime promise, no cross-device user state. Scaling changes storage and concurrency ownership.

## ADR-009 — Long threads

**Decision:** Recent contiguous whole-message window with explicit coverage.  
**Context:** An intern-scale project should bound latency and avoid unverifiable rolling summaries.  
**Alternatives:** Unlimited context; hidden truncation; hierarchical summaries in P0; retrieval embeddings.  
**Chosen approach:** 12,000-token estimated source window and full/partial/none coverage rules.  
**Why:** It is simple to test and preserves exact original-source evidence for included messages.  
**Consequences:** Older actions may be omitted; the product must not claim full-thread recall or settled state. Hierarchical analysis requires a new eval gate.

## ADR-010 — Testing and evaluation

**Decision:** Deterministic CI plus a small independently labeled live-model corpus.  
**Context:** Stochastic API calls should not make routine CI flaky, while mocked AI cannot establish accuracy.  
**Alternatives:** Eyeball demos; live model tests on every PR; elaborate evaluation platform; LLM-only judging.  
**Chosen approach:** Scripted provider doubles, 24 labeled threads, held-out subset, frozen matching rules, human adjudication, release-time live runs.  
**Why:** It separates software correctness from semantic model quality and makes failures inspectable.  
**Consequences:** The candidate must do label/review work and disclose denominators rather than presenting one impressive screenshot as evaluation.

## ADR-011 — Reliable demo and human authority

**Decision:** Recorded-first entry, explicit live actions, and reviewed copy-only drafts.  
**Context:** Provider outages and unsupported model claims must not derail recruiter exploration.  
**Alternatives:** Live-only demo; silent canned substitution; sending integration.  
**Chosen approach:** Reviewed bundled assets, prominent provenance, explicit fallback, lint plus revision-specific human review.  
**Why:** It makes the demo usable and honest while bounding the consequences of mistakes.  
**Consequences:** Recorded capability is narrower than live input flexibility; live and playback timings cannot be pooled.

# Implementation Phases

Build in dependency order. Each phase ends in a reviewable working increment. Exit gates are binary; do not advance with a known failing prerequisite.

| Phase | Objective/deliverables | Required validation | Exit criterion |
|---|---|---|---|
| 0 — Contracts and tooling | Workspace, pinned dependencies, production build/container, env schema, CI skeleton, design tokens, API/SSE/domain contracts, ADR files | Frozen install, lint/typecheck, static build, temporary SQLite opens in runtime image | One command runs the recorded development shell; production image starts; contracts compile |
| 1 — Sources and truth set | Canonicalization, version/evidence/date/coverage rules; public fixtures and variant; 24 source cases and independently authored gold labels | Unicode/duplicate/metadata/date/DST/version/coverage units; fixture validation; gold-label validation | All sources/labels valid; ambiguous dates unresolved; append changes version |
| 2 — Recorded vertical slice | Actual three-region workspace, first brief, evidence navigation, palette, default reply playback, editing/review/copy state machine | Component focus/review tests; keyboard E2E; no provider/network dependency for recorded action | Initial scenario completed entirely by keyboard; provenance shown; copy requires review |
| 3 — Server authority | Fastify routes/session/origin controls; SQLite cache/runs/budget tables; migrations; single-flight/concurrency; stream protocol | API and real-HTTP stream tests; transactional reservation, idempotency, abort, restart, redaction tests | Scripted backend completes/cancels streams; no quota bypass; cross-session access rejected |
| 4 — Live extraction and eval harness | OpenAI adapter, strict extraction prompt, source validator, date resolution, cache lookup/write; matcher/report runner | Scripted adversarial outputs and harness self-tests; first development live eval within explicit budget | Valid live brief replaces recorded only after validation; citations valid; live output failures remain visible |
| 5 — Live reply | Frozen source/analysis context, three intents, bounded facts, recipient computation, stream, draft lint, regenerate/undo | Timeout/partial/late-event/refusal tests; recipient and promise lint tests; live development reply review | Live drafting succeeds, cancels, and recovers; no incomplete/unreviewed copy; no secret/fact persistence |
| 6 — Local actions and follow-ups | Completion/dismissal/Done, reminders, deadline confirmation overrides, scenario clock, append invalidation | IndexedDB migration/failure; two-business-day/DST reminder cases; undo; inbound-variant cancellation | Two-step supported reminder save works; reload semantics honest; stale state never looks current |
| 7 — Performance and UX gates | Prefetch, production bundle budget, metric marks/drawer, narrow layouts, keyboard help/toggle, accessibility, all failure states | Deterministic benchmark profile; axe; keyboard/screen-reader checks; four-stream responsiveness; fault matrix | Deterministic timing gates pass; serious/critical axe violations zero; each specified failure recoverable |
| 8 — Release proof | Railway prod/preview, backup/restore, actual host streaming/security smoke, frozen live eval, hosted perf report, README, screenshots, walkthroughs | All CI; complete live corpus gate; production SSE/cancellation check; restore test; clean-machine setup | Every Definition of Done box below checked; demo link and evidence reports work |

Performance instrumentation begins with the first vertical slice rather than being retrofitted at Phase 7. Security/session/budget controls exist before any public live key is enabled. Documentation starts with decisions and is updated with actual results; empty report placeholders cannot pass Phase 8.

# Definition of Done

P0 is complete only when every applicable requirement below is checked. Extensions are not needed to satisfy this list.

## Product and UI

- [ ] Ten public scenarios and append variant load with valid canonical versions; corrupt/oversized test sources recover as specified.
- [ ] First visit shows a complete recorded brief without account creation or credentials.
- [ ] Summary, owners, actions, questions, commitments, decisions, deadlines, response assessment, and follow-up recommendation have the specified states and evidence.
- [ ] Every visible Source link opens the correct message and exact span, including Unicode text.
- [ ] At least five benchmark workflows execute with the specified gesture limits; actual counts are recorded.
- [ ] Palette, keyboard navigation, pointer equivalents, focus restoration, shortcut help, and single-key disable toggle work.
- [ ] Review/copy is tied to a complete current revision; edits, version changes, and interruptions invalidate review.
- [ ] Recipient computation excludes the viewer, never invents addresses, and handles missing metadata.
- [ ] Task/dismissal/reminder/Done states persist locally; undo restores them; storage failure is explicitly disclosed.
- [ ] Follow-up uses an explicit/default/user date origin and never promises background notifications or actual inbox monitoring.
- [ ] Recorded/live/template provenance and partial/degraded/unknown states remain visible at the point of action.
- [ ] Main layout has no horizontal page scroll at 320px or 200% zoom; target widths and control sizes pass screenshot checks.
- [ ] Axe serious/critical violations are zero and keyboard/screen-reader walkthroughs are recorded.

## AI and reliability

- [ ] The pinned model, prompt/schema versions, output limits, no-tools setting, and `store:false` are configured and tested.
- [ ] Extraction passes independent structural, evidence, identity, date, and semantic-invariant checks before display/cache.
- [ ] Relative dates use source context; all ambiguous/DST test cases remain unresolved until confirmation.
- [ ] Long threads show included/omitted coverage and never produce citations outside the included source window.
- [ ] Live extraction/drafting work, and timeouts/refusals/malformed output/rate limits/interruption have tested recovery.
- [ ] Maximum two attempts total is enforced; repair/retry cannot evade cost/quota/deadline limits.
- [ ] Cancellation, thread switch, append invalidation, and late events cannot write into an unrelated/current draft.
- [ ] Recorded mode works with the API and provider blocked after initial assets load; no hidden provider call occurs.
- [ ] Complete frozen live evaluation passes the specified quality gates; reports disclose all failures, adjudications, and denominators.
- [ ] Deterministic CI evals are explicitly separated from live accuracy claims.

## Performance and measurement

- [ ] Initial JS/transfer budget and deterministic p95 interaction budgets pass the specified profile.
- [ ] At least 50 warm samples per deterministic operation and 20 cold-load samples are reported with build/profile information.
- [ ] At least 30 live reply attempts have an honest latency report, including timeouts/failures and achieved/missed targets.
- [ ] TTFT, first-visible text, TTCR, total workflow time, interaction counts, token usage, and cache layers have exact definitions and actual measurements.
- [ ] Recorded playback is excluded from live latency and quality metrics.
- [ ] A slow live request preserves usable source/brief UI and exposes a fallback by the specified thresholds.
- [ ] Empty/small samples and missing usage never display fabricated zeros or impressive percentages.

## Security and operations

- [ ] Server keys never enter the browser bundle; secret scanning and seeded redaction tests pass.
- [ ] Untrusted HTML/injection strings cannot execute scripts, create tools, alter recipients, or trigger external actions.
- [ ] Cookie tampering/expiry, same-origin rules, cross-session access, body/stream limits, and output invariants have tests.
- [ ] Durable cost reservations, global/session limits, and fail-closed database behavior are demonstrated.
- [ ] No prompt, source, generated text, user fact, cookie, or clipboard content appears in logs/Sentry/metrics.
- [ ] User facts and generated drafts are absent from SQLite, IndexedDB, localStorage, and URL.
- [ ] Production uses one replica and the persistent SQLite volume; restart persistence and backup restore are verified.
- [ ] Production HTTPS/security headers and actual host SSE flush/heartbeat/disconnect cancellation pass smoke checks.
- [ ] Recorded-only preview deployments use no production volume or live secrets.
- [ ] CI required checks gate production promotion; scheduled health checks do not invoke AI.

## Documentation and recruiting readiness

- [ ] All required documents and ADRs match the implemented behavior.
- [ ] README leads with problem/workflow, actual screenshot/GIF, demo link, linked measurements, evals, and limitations.
- [ ] Clean-machine local setup and recorded mode work without an OpenAI key.
- [ ] 90-second and 5-minute walkthroughs use the actual application and disclose their mode.
- [ ] No affiliation, proprietary-access, invented performance, full-inbox, or injection-immunity claim appears in the app or README.
- [ ] Demo remains useful when live mode is disabled, its quota is exhausted, or OpenAI is unavailable.

# Questions the Candidate Must Be Able to Answer

1. What specific email workflow did you optimize, and how did you measure completed action rather than generated output?
2. Why did you remove independent slash-command analyses?
3. Why is structured extraction a better UI contract than generated prose?
4. What does exact evidence matching prove, and what does it fail to prove?
5. Why did you separate extraction from drafting?
6. Why did you choose this pinned mini model and reasoning setting, and what eval result would make you change it?
7. Why did you choose SSE-framed POST instead of WebSockets or EventSource job polling?
8. What happens if the stream ends without a terminal event?
9. How does abort propagate, and why can cancellation still cost money?
10. How do you prevent late events from changing the wrong thread or draft?
11. Exactly which changes invalidate cached extraction, and why is TTL insufficient?
12. How do recorded results differ from live cache hits?
13. Why are generated replies not server-cached or persisted?
14. How do you determine a reply recipient when metadata is incomplete or the latest message is outbound?
15. How do you distinguish a request, a commitment, a decision, and user-local completion?
16. How do you interpret tomorrow versus Friday, and why is the message timezone necessary?
17. How do you handle DST gaps/repeated times and date-only deadlines?
18. Why is a default follow-up date different from an extracted deadline?
19. What do browser-local reminders actually guarantee?
20. What was omitted from a long thread, and how does your accuracy report account for it?
21. How does prompt injection remain possible even with strict schemas and no tools?
22. Which architectural restrictions reduce the consequences of an injection?
23. What unsupported claims can your draft linter miss?
24. Why require review before copying, and how do edits invalidate that review?
25. Why fixtures before Gmail, and what synchronization/OAuth/privacy work would Gmail introduce?
26. What does your gold dataset contain, who labeled it, and how are paraphrases matched?
27. How did you avoid tuning to held-out cases or grading canned outputs as live quality?
28. What were your actual precision/recall, deadline, and unsupported-claim failures?
29. How do TTFT, first visible text, TTCR, and total workflow time differ?
30. Why can a 100ms interaction goal coexist with a multi-second model call?
31. How do your local, server, and provider clocks affect measurement?
32. How does durable budget reservation handle retries, missing usage, and process restarts?
33. What does idempotency guarantee here, and what does it not guarantee?
34. Why choose SQLite and one replica, and which concrete requirement would force migration?
35. What would change at 100,000 users: storage, concurrency, budgets, per-user isolation, background work, and monitoring?
36. What did you deliberately leave out, and how did that improve the result?

# Final Architecture Review

This specification was reviewed against the original concept as a skeptical staff-engineering exercise. The following corrections are incorporated, not left as follow-up design work:

| Concern found | Resolution encoded above |
|---|---|
| Five prompts would duplicate work and make results disagree | One structured brief reused by deterministic commands |
| “Relevant to Superhuman” could assume a Mail-specific placement | Research distinguishes the platform-wide role from Mail product inspiration |
| Gmail/OAuth and calendar writes would dominate scope | Fixtures in P0; no external writes; local paste/preview deferred |
| Durable workers, Redis, and multiple hosts are unnecessary | One request-bound service, SQLite volume, no job queue, explicit one-replica restriction |
| Recorded demo could become misleading theater | Recorded/live/template labels, exact recording keys, separate metrics, actual-app walkthrough |
| Citation-valid output could still be false | Semantic eval/adjudication and manual review; no factuality guarantee from schema |
| Relative dates could be normalized with the wrong “now” | Source timestamp/timezone only; unresolved candidates remain unresolved |
| Long-thread truncation could imply complete understanding | Contiguous window, visible coverage, subset recall, no settled-state conclusion |
| Retry paths could silently multiply cost | Two attempts total, application-controlled retry, per-attempt durable reservations |
| Anonymous quotas could be evaded | Global durable ceilings bound exposure; no claim of bot-proof identity |
| UI review could accidentally survive editing or a new message | Revision/version-specific review and deterministic invalidation |
| A process restart or missing usage could bypass limits | Durable conservative reservation and failed-run recovery |
| “Fast” could be supported only by a canned playback | Owner-run cold/warm/live reports with samples, failures, and provenance |
| A reminder might imply functionality outside the browser | Explicit local/scenario-time semantics and no background-notification promise |
| AI timing promises could block a useful experience | Deterministic UI gates; measured live objectives; early visible fallback |

Accepted limitations are deliberate: no production mailbox, no sending, no cross-device reminders, no unlimited context, no perfect semantic or injection detector, and no multi-instance scaling. None is hidden behind an optimistic product label.

The implementation is successful when a reviewer can complete the core workflow quickly, inspect the evidence, observe failure recovery, reproduce measurements, and understand why each tradeoff was made. The execution agent’s responsibility is to build and verify this specification, not redesign the application or expand its scope.
