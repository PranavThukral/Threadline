# Threadline — reaudit, fixes and employer review

**Date:** October 6, 2026, America/New_York.  
**Scope:** The implementation specification, original TL-01–TL-34 audit, current source, recorded corpus, browser workflows, compiled server and verification scripts.  
**Outcome:** The local recorded application now builds and starts correctly, preserves evidence and context, supports complete review/copy and follow-up workflows, and has durable server controls. The verification suite passes. This report does **not** certify hosted operation, paid model quality, or exact compliance with every prescribed feature/library in the original specification.

This replaces the earlier `Rebuild-Verification.md`. The original specification and complete audit remain historical references. Files under synced `sources/` were not changed. No email was sent, inbox connected, external site published, or paid model call made.

## What a reviewer can actually use

| Workflow                     | Working behavior                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect the next action      | Ten synthetic threads; source bodies, all summary bullets, response assessment, ownership, actions, questions, decisions, commitments and dates                           |
| Verify a claim               | Exact validated UTF-16 quote spans, visible highlighting, source expansion, scroll and focus; unknown metadata remains unknown                                            |
| Draft safely                 | Correct application-selected recipients, conservative recorded acknowledgment/clarification, actual recorded deltas, cancellation, manual editing, review and copy        |
| Supply facts                 | Explicit live-only generation with bounded facts; facts and drafts stay in tab memory, version-scoped, and disappear on reload                                            |
| Recover a draft              | Closing and reopening in the same tab preserves the draft; changing text, intent or supplied facts invalidates review                                                     |
| Handle waiting               | Preview/edit/confirm a business-day local follow-up at 9 AM New York; saved list, due state, remove and twenty-entry session Undo                                         |
| Change the source            | Append Maya's synthetic reply; source version, message count, queue and next action update together; an older reminder is flagged for review                              |
| Finish local work            | Persisted action completion/reopening/dismissal and Done for now on no-response threads; source messages remain available                                                 |
| Use a keyboard               | Filtered J/K navigation, search, Mod+K palette, draft/facts/clarification, source inspection, follow-up preview, Undo and Escape; a working Demo guide explains shortcuts |
| Recover from failure         | API deadline and offline recorded fallback; source-load retry; terminal stream validation; partial drafts require manual completion before review; render error boundary  |
| Inspect engineering evidence | Session-scoped diagnostic timings, reproducible HTTP benchmark, corpus checks, source hashes and automated regressions                                                    |

The waiting workflow is a particularly useful employer demonstration: it connects a user need, a reversible local action, a subsequent source change, and an updated next step. The interface demonstrates decisions that a static mockup cannot establish.

## Actual stack and boundaries

React 19 + TypeScript + Vite, plain CSS, Lucide icons, Fastify 5, strict Zod 4 contracts, eventsource-parser, OpenAI Responses SDK 7, native Node 24 SQLite, and native IndexedDB with localStorage fallback. Vitest, Testing Library, user-event, jsdom, axe-core and fake-indexeddb provide the regression suite.

The browser never imports the server's Node crypto implementation. The browser bundle of reviewed synthetic records is generated during the build. Client and server outputs have separate directories; Vite cannot delete the compiled backend.

SQLite durably stores signed sessions, run identity/status, reservations/usage, validated synthetic live cache, bounded content-free metrics and session-specific append state. A persisted random secret is used if SESSION_SECRET is blank. Browser storage persists synthetic decisions and follow-ups, **not user facts or generated drafts**. Earlier persisted draft entries are migrated out on startup.

Only one server process may own a database. Multiple replicas, real inbox authentication, sending, calendar writes and persistent real-time reminder notifications are outside this implementation.

## Original audit traceability

“Implemented” below means code and relevant local evidence exist. Provider-facing rows have local fake-provider/actual-SDK HTTP tests; they do not imply a paid call succeeded.

| Audit                        | Reaudit result                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TL-01 built startup          | Fixed; separate build outputs and compiled-server smoke pass                                                                                                                                                                                                             |
| TL-02 serialized source      | Fixed; JSON source envelope, participants, whole-message budget and 96 KiB complete-request cap                                                                                                                                                                          |
| TL-03 live validation        | Strict schema and source/version/owner/coverage/date/evidence/completion/answer/supersession relationships; invalid output rejected without replacing the brief; semantic entailment still requires evaluation                                                           |
| TL-04 streaming/cancellation | Actual SDK streaming and request-options abort signal; real local HTTP disconnect test; shutdown aborts and waits for ledger settlement                                                                                                                                  |
| TL-05 cost/admission         | Transactional durable reservation, $5 UTC-day ceiling, 100,000 input-token allowance, upward micro-dollar rounding, configured prices, hourly/daily quotas and concurrency limits                                                                                        |
| TL-06 session/origin/headers | Signed expiry-checked cookies; reuse, strict body, origin/cross-site checks, Secure on HTTPS, security headers preserved on SSE, HTTPS HSTS                                                                                                                              |
| TL-07 input/idempotency      | Strict request/fact/intent/version schemas; bounded bodies; session/kind/key + HMAC identity; duplicate/conflict results explicit                                                                                                                                        |
| TL-08 stale stream callbacks | Abort + context generation + controller identity guard; late-event regression passes                                                                                                                                                                                     |
| TL-09 thread load races      | Latest-request guards and source version identity prevent stale loads replacing selection                                                                                                                                                                                |
| TL-10 protocol EOF/hangs     | eventsource-parser, exact sequence/run/thread/version/mode, bounded buffer, terminal enforcement, idle/total/server deadlines                                                                                                                                            |
| TL-11 edits/review           | Editor disabled while streaming; partial completion gate; edits/fact changes invalidate review; lint reruns before copying                                                                                                                                               |
| TL-12 invented promises      | Recordings acknowledge receipt without inventing availability/work commitments; unsupported custom recordings reject; lint is a narrow guard, not a semantic guarantee                                                                                                   |
| TL-13 recipients             | Shared latest-message recipient logic excludes viewer, preserves outbound addressees and refuses unknown identities; reply-all selection is not provided                                                                                                                 |
| TL-14 facts leakage          | Version-scoped tab-memory drafts/facts; no durable facts/draft storage; reset and source changes isolate contexts                                                                                                                                                        |
| TL-15 evidence navigation    | Exact span highlight, real message expansion/collapse, scroll and DOM focus; verified in browser                                                                                                                                                                         |
| TL-16 citation support       | Reviewed recorded claims corrected; completed actions/fulfilled commitments/answered questions require dedicated evidence references; live semantic accuracy remains unmeasured                                                                                          |
| TL-17 dates                  | Date-only display independent of timezone; DST-aware reminder resolution; unresolved candidates and instant timestamps visible; overdue uses the scenario instant and a known source-local date/timezone; full source deadline override/resolver features remain limited |
| TL-18 follow-ups             | Preview/edit/confirm, persisted storage, removal/Undo, two weekdays at 9 AM New York, stale source warning; no OS/background notification service                                                                                                                        |
| TL-19 local workflow state   | Versioned synthetic actions, dismissal, no-response Done for now and session Undo implemented                                                                                                                                                                            |
| TL-20 scenario clock         | Fixed scenario base, bounded explicit day advancement, persisted offset and Reset; persisted offset is an intentional change from the original reset-on-reload preference                                                                                                |
| TL-21 placeholder controls   | Dead attachment/more controls removed; summaries, response states, decisions and commitments rendered; live analysis command calls the API                                                                                                                               |
| TL-22 keyboard parity        | Documented shortcuts match behavior; facts shortcut focuses input without a provider request; composition/modifier and modal guards                                                                                                                                      |
| TL-23 accessibility          | Named controls, focus trap/restore and inert background; automated semantic axe checks pass; native screen reader and true browser zoom certification remain open                                                                                                        |
| TL-24 workspace layout       | Desktop three regions; tablet brief above source; independently scrollable regions and bounded draft area                                                                                                                                                                |
| TL-25 narrow layout          | 320 px has no document overflow; next-action order and saved follow-ups retained; larger touch controls                                                                                                                                                                  |
| TL-26 startup outage         | Explicit offline recorded fallback and reconnect/retry; IndexedDB startup also has a deadline rather than an indefinite loading screen                                                                                                                                   |
| TL-27 mode dependency reset  | Stable bootstrap dependency, explicit mode/context cancellation and accurate brief/draft provenance                                                                                                                                                                      |
| TL-28 cache identity         | Version/schema/prompt/normalizer/model tuple + HMAC, TTL, revalidation, eviction and source separation; cached commands avoid provider calls; concurrent misses receive busy rather than shared subscriber fan-out                                                       |
| TL-29 metrics                | Strict content-free events, signed-session read scope, deduplication, one-day cleanup, 200/session and 2,000/global caps; local measured timings and separate benchmark                                                                                                  |
| TL-30 corpus                 | Ten base scenarios + append variant, real exact duplicate, same-name people, large chronological source, partial coverage, oversized-newest rejection; some exact source narratives and adversarial variants prescribed in the original brief remain simplified          |
| TL-31 domain contracts       | SHA-256 versions include participant registry; conservative normalization; strict structural/relationship validators; this is not a complete natural-language canonicalizer or semantic inference engine                                                                 |
| TL-32 setup/readiness        | Optional .env, safe blank-secret behavior, live pricing gate, actual SQLite readiness, Dockerfile/CI and honest hosting instructions; hosted execution remains unverified                                                                                                |
| TL-33 verification           | 46 passing tests across five files; all eleven corpus variants valid; compiled smoke, local benchmark and browser checks; paid/hosted evaluation separate                                                                                                                |
| TL-34 documentation          | README and architecture/AI/security/evaluation/performance/deployment/walkthrough rewritten for actual implementation; historical verification explicitly superseded                                                                                                     |

Additional bugs caught during this pass: server close hanging on an active provider stream; incomplete draft review becoming enabled too early; stale storage values returning after removal; browser storage open blocking startup; empty SESSION_SECRET overriding the safe generated secret; fact edits retaining Reviewed; duplicate analysis making another provider call; unbounded per-session metric retention; and unsafe provider error messages being retained as run error codes. These boundaries were corrected rather than hidden behind a reassuring report.

## Verification evidence

| Check                       | Result                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format/lint/type/build      | Pass locally on Node 24 / Windows                                                                                                                        |
| Automated tests             | 46 pass: domain, transport, SQLite/admission/API/provider, offline corpus, IndexedDB, React workflows                                                    |
| Reviewed corpus             | 11/11 variants pass structural and exact-evidence validation                                                                                             |
| Compiled application smoke  | Pass: built HTML/assets, health/readiness/session, ten source briefs, recorded analysis and reply SSE                                                    |
| Dependency peer check       | No peer conflicts after SDK upgrade                                                                                                                      |
| Production dependency audit | No known vulnerabilities in the checked dependency set; this is a point-in-time registry result, not a guarantee                                         |
| Browser                     | Desktop 1440, tablet 1024, mobile 320 inspected; source focus/highlight, recorded draft, local state recovery and Demo guide exercised                   |
| Accessibility               | Zero automated semantic axe violations in the tested initial view/palette; jsdom contrast disabled; targeted rendered text contrast inspected separately |
| Performance                 | [Raw benchmark, corpus checks and source hashes](verification/local-benchmark.json); [method and measured p50/p95](verification/Local-Benchmark.md)      |

The benchmark measures two local HTTP/JSON operations per source switch. Thirty warm samples follow ten initial samples; each pass uses an independent anonymous session to respect ordinary route limits. Three recorded streams report first-delta and terminal times. It does not measure React paint, paid inference, deployed WAN behavior or time saved by a human.

Screenshots: [desktop source/draft](verification/desktop-reply.jpg), [tablet](verification/tablet.jpg), [mobile](verification/mobile.jpg). Screenshots capture the current build; the older audit screenshots describe the pre-fix app.

## Employer value and review path

Use [the three-minute walkthrough](../docs/demo-script.md) or the in-app Demo guide. Demonstrate one safe draft, one waiting workflow that changes when a reply arrives, and one trust-boundary case. Then show the tests and benchmark.

This application offers concrete evidence of product judgment: preserving source visibility; refusing unsupported facts; separating recordings from live output; requiring review before copy; keeping local actions reversible; handling source changes; and bounding paid work. It offers engineering evidence through deterministic failure tests and inspectable architecture choices.

It does not establish an employer productivity percentage, a conversion lift, production mailbox safety, a model accuracy score, or affiliation with Superhuman. Those claims are not supported by this local demonstration.

## Remaining release gates and deliberate differences

1. **Paid provider:** no real model call was made. Confirm access to the pinned model, verified tariffs, strict-schema compatibility, semantic quality and repeated live outcomes before enabling public live mode.
2. **Hosted delivery:** Docker is unavailable here; the image, volume ownership, hosted CI, Railway, deployed TLS/cookies and proxy SSE cancellation still need checks in that environment. No public URL was created.
3. **Accessibility:** native screen-reader walkthrough, true browser 200% zoom and comprehensive rendered contrast testing remain separate checks. The local axe result is not certification.
4. **Specification fidelity:** native SQLite/IndexedDB and plain CSS/native controls replace prescribed wrapper/UI libraries; cache-miss deduplication returns busy instead of subscriber fan-out; reply-all, full deadline overrides and detailed public benchmark dimensions are not implemented. Some fixture stories are simplified. These differences are explicit, not represented as completed original scope.
5. **Product validation:** the employer walkthrough demonstrates a working proof of work. Real-user task timing and outcome studies remain necessary before claiming productivity benefits.

For an agent continuing work: preserve the privacy boundary, strict validation, source provenance, review gate, recorded fallback and durable cost ledger. Start with the explicit gaps above. Run the documented checks; do not rewrite the app merely to introduce unused libraries or replace tested behavior with unverified abstractions.
