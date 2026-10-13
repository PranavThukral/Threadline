# Threadline: complete implementation audit and rebuild brief

**Audit date:** October 6, 2026, America/New_York.  
**Audience:** The agent rebuilding this application.  
**Authority:** `deliverables/Threadline-Implementation-Specification.md`, especially P0 scope, contracts, failure handling, and Definition of Done.  
**Verdict:** The current project is a functioning source-run synthetic demo, with substantial correctness and reliability defects. It is **not a complete implementation of the specification and is not ready to enable public live AI or deploy as the specified product**. Its documented production startup is broken. Passing the existing checks does not establish the missing functionality.

## 1. Audit method and evidence

This audit reviewed all application source, configuration, fixtures, tests, and documentation; compared implementation with the authoritative specification; ran the project checks; exercised the built frontend against the source server; tested API contracts; injected deterministic browser network failures and delays; examined desktop/narrow layouts; and ran axe-core accessibility checks.

- Browser: installed Microsoft Edge, headless isolated contexts, using the bundled Playwright runtime.
- Accessibility engine: axe-core 4.13.0, installed in a separate temporary tool directory, not added to the app.
- Frontend under test: built Vite production assets.
- Backend workaround for runtime tests: `node_modules/.bin/tsx src/server.ts`, because the documented built-server startup fails.
- **Paid provider calls: zero.** Live-provider findings below are direct code defects or missing controls, not a measured claim about model behavior.
- No source, application dependency, or application configuration was patched during this audit. Build artifacts were regenerated. The audit added this report and supporting evidence only. Synced `sources/` files were untouched.
- Synthetic API test markers were written only into the temporary server's process-local metrics array. They are not real personal data.
- No deployed host, real inbox, email sending, native screen-reader walkthrough, or live-model evaluation was tested.
- CSS `zoom: 2` was tested as an additional layout diagnostic; it is **not** equivalent to certification at real browser 200% zoom.

Evidence artifacts:

- [Structured runtime and accessibility results](audit-evidence/runtime-results.json): 41 observations, including successful controls and deterministic fault cases.
- [SHA-256 hashes of the audited files](audit-evidence/source-manifest.json).
- [Desktop, 1440 px](audit-evidence/viewport-1440.png).
- [Tablet, 1024 px](audit-evidence/viewport-1024.png).
- [Narrow, 320 px](audit-evidence/viewport-320.png).
- [Completed reply panel](audit-evidence/reply-1440.png).
- [CSS zoom diagnostic](audit-evidence/css-zoom-200.png).

Source locations below use `file:line` from the audited files. A rebuild will change those line numbers; search by the named function or selector as needed.

### Severity and evidence labels

- **Blocker:** Prevents deployment/startup or makes public live operation materially unsafe.
- **High:** Produces wrong facts/recipients/dates, corrupts user state, crashes, or blocks a primary workflow.
- **Medium:** Required feature, interaction, or operational contract is incomplete.
- **Low:** Maintenance or documentation issue without an immediate primary-flow failure.
- **Reproduced:** Observed during this audit against the app or an isolated deterministic fault.
- **Code-confirmed:** The defect is explicit in source; an actual paid provider/deployed environment was not used to exercise it.
- **Missing:** No implementation or artifact exists in the audited project.

## 2. What actually exists

| Area                    | Actual behavior                                                                                        | Assessment                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Public thread queue     | Ten synthetic scenarios fetched from Fastify; clicking rows loads thread and brief                     | Works on the ordinary source-run path; race unsafe                                                 |
| Thread reader           | Sender, participants, date, and all message bodies rendered as React text                              | Works; earlier messages cannot be manually expanded and long threads grow the whole page           |
| Recorded briefs         | Generated at server startup by hand-authored fixture branches                                          | Available after API fetch; not independent recorded browser assets                                 |
| Summary                 | First summary item is displayed                                                                        | Works for fixture shape; additional summary items ignored                                          |
| Actions                 | Accordion, completion/reopen toggle, evidence button                                                   | Works in memory; no persistent completion, dismissal, Done for now, or undo                        |
| Questions               | Two fixtures have open question entries; accordion displays them                                       | Limited; no resolution/answer relationships                                                        |
| Waiting state           | One fixture exposes Save follow-up                                                                     | Saves an in-memory timestamp without preview or confirmation                                       |
| Dates                   | Hard-coded absolute and relative values, unresolved Friday candidates                                  | One-day display error; no date resolver, date override, or overdue rules                           |
| Decisions/commitments   | Arrays exist in domain/fixtures/API                                                                    | No actual UI rendering for these arrays                                                            |
| Response-required state | Present in API output                                                                                  | No explicit response assessment UI; informational mail still gets a prominent draft CTA            |
| Evidence                | API returns exact quote spans for current fixtures; source click applies a class to a message          | Spans currently match; navigation does not scroll/focus/highlight the supporting clause            |
| Replies                 | Three intent tabs, text editing, recorded SSE deltas, review/copy button, regenerate                   | Basic flow works; unsafe facts, wrong recipients, races, editing corruption, and lifecycle defects |
| Live analysis           | Server route and SDK call exist                                                                        | UI command is a toast; source serialization is broken; schema/grounding validation absent          |
| Live replies            | Non-streaming SDK request, followed by application-side chunking                                       | Not actual live provider streaming; cancellation does not abort the provider                       |
| Command palette         | Case-insensitive substring search, arrows, Enter, pointer actions                                      | Basic behavior works; incomplete commands, shortcut mismatch, no modal focus management            |
| Metrics                 | Some browser durations, process-global API array, local drawer                                         | Partial; no real benchmark reports, provider timing, cost, failures, or session isolation          |
| Responsive styling      | Three columns on wide desktop; brief below workspace below 1181 px; horizontal queue on narrow screens | Adapts but violates specified information architecture and hides follow-ups on narrow screens      |
| Security                | Plain React text, server-side key, SDK `store: false`, a body cap, version checks                      | These positives exist; session/origin/budget/schema/header controls are missing                    |
| Tests/docs              | Three fixture tests, simple validator, seven short docs, README                                        | Checks pass but cover almost none of the required risk behavior                                    |

### Useful behavior worth preserving

The visual direction is coherent: restrained dark surfaces, readable main email text, clear sender/subject hierarchy, and a recognizable queue-reader-brief layout. Literal script content in the injection fixture remains text: the audit found zero script elements inside `.message-body` and no ordinary-path client error. All returned fixture evidence spans matched their source slices. Ordinary recorded SSE included completion, and concatenated recruiter deltas matched the completed text. The action checkbox toggles, clipboard flow is explicit, live mode defaults off, and the browser JavaScript bundle is about **97.28 KB gzip**, within the specification's 250 KiB initial JS cap. These are useful foundations, not evidence of live-model quality.

## 3. Actual technology stack

Versions are from the installed lockfile state, not only broad ranges in `package.json`.

| Layer                   | Actually used                                                                    | Gap or implication                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/package manager | Node 24.19.0; pnpm 11.19.0 in this environment                                   | No repository engine/package-manager pin or reproducible production image                                                                           |
| Frontend                | React/React DOM 19.3.0; TypeScript 6.0.3; Vite 8.3.2; Lucide 0.544.0             | Small app, but application state and transport are concentrated in a 1,173-line component file                                                      |
| Styling                 | Handwritten CSS, system font fallback                                            | No Tailwind/Radix as selected in the spec; layout/accessibility must still meet acceptance criteria                                                 |
| Server                  | Fastify 5.12.5; `@fastify/static` 8.3.0; `@fastify/cors` 11.3.0; built-in logger | Direct route logic; no repositories, session middleware, security admission layer, or dependency readiness                                          |
| AI                      | OpenAI SDK 5.23.2; configurable model string with a default snapshot             | Default snapshot and provider quality were not verified in this audit; no structured output, token/cost accounting, or prompt/schema version system |
| State/query             | `useState`, direct fetch, one AbortController ref                                | TanStack Query 5.104.1 wraps the app, but no `useQuery`/`useMutation` is used                                                                       |
| Routing                 | BrowserRouter wrapper                                                            | React Router 7.18.4 is installed, but no route state or route restoration is implemented                                                            |
| Validation/parsing      | TypeScript assertions, JSON.parse, hand-written SSE parser                       | Zod 4.6.5 and eventsource-parser 3.1.1 are installed but unused                                                                                     |
| Persistence             | In-memory Maps/arrays and React state                                            | SQLite, better-sqlite3, Drizzle/migrations, IndexedDB repository, and durable budget ledger are absent                                              |
| Quality                 | Vitest 3.2.7, ESLint 9.39.5, Prettier                                            | Only three fixture tests; lint config enables no substantive correctness rules                                                                      |
| Delivery                | Package scripts and static serving                                               | No Dockerfile, Railway config, CI workflows, backup tooling, actual walkthrough, or deployment report                                               |

The technology choices are not themselves the reason the product fails. The rebuild needs clear contracts and domain/state boundaries, correct build output separation, and the selected persistence/security systems. Do not add unused wrappers to imply features are implemented.

## 4. Check results

| Check                                | Result          | What it establishes                                                                                            |
| ------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm fixtures:validate`             | Passed          | Ten nonempty threads, extraction presence, matching message thread IDs                                         |
| `pnpm typecheck`                     | Passed          | Static TypeScript compatibility; `any` and casts bypass runtime contracts                                      |
| `pnpm test`                          | Passed, 3 tests | Scenario count/state, partial-coverage metadata, literal injection text/warning                                |
| `pnpm lint`                          | Passed          | Parsing/configured rules; substantive rule coverage is essentially absent                                      |
| `pnpm format:check`                  | Passed          | Formatting of selected application files                                                                       |
| `pnpm build`                         | Passed          | Client asset generation; does not leave an executable server                                                   |
| `pnpm start` immediately after build | **Failed**      | `MODULE_NOT_FOUND` for `dist/src/server.js`                                                                    |
| Source-run API/client happy path     | Passed in part  | Initial thread, normal recorded generation, action toggle, literal source text                                 |
| Fault/race tests                     | **Failed**      | Stale selection/draft, EOF, bootstrap failure, malformed extraction, edit corruption                           |
| axe workspace                        | **Failed**      | Critical `button-name` at one node; serious `color-contrast` at 25 nodes; moderate duplicate unnamed landmarks |
| axe palette                          | **Failed**      | Same critical name issue; serious contrast at 28 nodes; additional region issues                               |
| axe completed reply                  | **Failed**      | Critical name issue; serious contrast at 26 nodes; landmark issue                                              |
| Real live provider/evals/host        | Not run         | No claim of validated live quality, real TTFT, or deployed readiness                                           |

## 5. Detailed defects and required changes

### TL-01 — Production build deletes the server

**Blocker · Reproduced.** `package.json:8`, `tsconfig.json:13`, `vite.config.ts:12`.

`build` runs TypeScript into `dist`, then Vite uses the same output directory and cleans it. Only HTML/CSS/JS client assets remain. The following documented workflow fails:

```text
pnpm build
pnpm start
```

Actual error: `Cannot find module .../dist/src/server.js`. Earlier source/compiled-process smoke tests did not establish this workflow.

**Rebuild:** Use distinct client/server outputs, e.g. `dist/web` and `dist/api`, with the server static root set accordingly. Add an E2E smoke that starts the actual packaged build from a clean checkout. **Pass:** Build, start, health/readiness, first brief, and recorded reply succeed without running TypeScript compilation again afterward.

### TL-02 — Live analysis receives `[object Object]` instead of the email

**High · Code-confirmed, deterministic expression reproduced.** `src/server.ts:111`.

`thread.messages.map(message => ({...})).join('\n')` stringifies each object to `[object Object]`. All IDs, sender metadata, timestamps, and body text are lost. No extraction prompt can recover the thread from that input.

**Rebuild:** JSON-serialize a bounded canonical source envelope, registry, viewer, and coverage window. Test the actual provider adapter input with a scripted provider. **Pass:** It contains exact source bodies and metadata and respects message/byte/token bounds.

### TL-03 — Live results are unvalidated and merged with recordings

**High · Code-confirmed; client crash reproduced with malformed response.** `src/server.ts:135`, `src/server.ts:249`, `src/app.tsx:180`, `src/app.tsx:756`.

The model is asked for unspecified compact JSON, with no strict schema. A parsed candidate is spread over a recorded extraction, cast to `Extraction`, and cached. Missing model fields inherit recording content; wrong arrays/enums/owners/evidence/coverage are accepted. Candidate fields can replace thread identity and semantic data. The client trusts this output and has no error boundary. Fault injection of `actions: null` produces `Cannot read properties of null (reading 'length')` and an empty page.

**Rebuild:** Separate raw AI and validated domain schemas, strict provider output, exact evidence checks, owner/version/coverage checks, conservative downgrade rules, bounded repair, and a recoverable client boundary. Never backfill live semantics from a recording and label them live. **Pass:** Malformed/refused/incomplete output fails safely, invalid output is not cached, and the current valid brief remains usable.

### TL-04 — Live replies are simulated streaming and provider cancellation is ineffective

**High · Code-confirmed.** `src/server.ts:84`, `src/server.ts:95`, `src/server.ts:335`.

The SDK call is non-streaming and awaited in full; only afterward is the completed body split into application chunks. The AbortSignal is checked after the call but not passed to the SDK request. Disconnecting/cancelling cannot stop the in-flight provider request. No hard 20s/45s deadlines, first-text fallback, 5s heartbeat, or stream backpressure control exists. SDK default retry behavior is not explicitly coordinated with the required two-total-attempt cap.

**Rebuild:** Consume actual provider deltas, pass the abort signal through, account for all attempts, enforce total deadlines, heartbeat/idle rules and queue limits, and preserve provisional text on interruption. **Pass:** A timed scripted provider demonstrates first text before completion, upstream abort delivery, bounded retry, and exact terminal behavior.

### TL-05 — No live cost, concurrency, or abuse admission controls

**Blocker for public live mode · Missing/code-confirmed.** `src/server.ts:13`, `src/server.ts:17`, `src/server.ts:201`, `src/server.ts:304`.

`liveEnabled` requires only a key and flag. An active-runs Map stores controllers but enforces no semaphore. No signed sessions, request/attempt quotas, global daily budget, token reservation, cost reconciliation, single-flight, connection caps, restart ledger, or idempotency records exist. Bootstrap advertises `maxLiveAttempts: 12` without enforcement.

**Rebuild:** Implement the specification's durable global budget and signed-session admission before exposing live requests. **Pass:** Scripted calls prove session/global quotas, four-global/two-session concurrency, $5/day default ceiling, restart safety, and fail-closed DB behavior. Recorded browser mode must remain usable when live admission fails.

### TL-06 — Origin/session security and response headers are absent

**Blocker for public live mode · Reproduced/missing.** `src/server.ts:22`, `src/server.ts:449`.

Reflected CORS with credentials is enabled, not exact-origin access. A POST with `Origin: https://audit.invalid` succeeds; the metrics response reflects that origin. Stream/API writes require no session. Session and run-status endpoints are missing. CSP, nosniff, required request-ID header, no-store operational caching, and the other specified browser controls are absent in the inspected responses. An unknown API GET with `Accept: text/html` returns the SPA with 200 rather than an API 404.

**Rebuild:** Exact same-origin POST checks, Fetch Metadata rules, signed cookie middleware, scoped operational reads, production headers, and an API-specific 404 boundary. **Pass:** Foreign/missing origin and tampered/expired cookies fail with stable safe errors; `/api/*` never falls into a 200 HTML fallback.

### TL-07 — Request validation and idempotency are not implemented

**High · Reproduced.** `src/server.ts:203`, `src/server.ts:306`.

Bodies are asserted to types rather than validated. `mode: 'bogus'`, `intent: 'bogus'` returns a 200 stream with bogus provenance; invalid mode avoids the live-disabled branch. Unknown fields and overlong facts are silently accepted/truncated. Reusing one `Idempotency-Key` starts two different completed reply runs, both 200. General body limit is 128 KiB, not the specified 32 KiB, and metrics have no separate 20 KiB schema.

**Rebuild:** Strict shared schemas, explicit 400/413/422 outcomes, route/session-scoped body-HMAC idempotency, and context/version checks. **Pass:** Same completed reply key returns 410; different body with the same key returns 409; invalid enums/keys/size reject before opening SSE or calling AI.

### TL-08 — Late stream events contaminate another thread

**High · Reproduced with deterministic fault.** `src/app.tsx:175`, `src/app.tsx:227`, `src/app.tsx:252`.

There is one global draft and AbortController. Thread switching does not abort the old generation. The stream parser discards run/thread/version/sequence metadata and callbacks update global state. A delayed recruiter response was accepted while the project thread was open; opening Answer with facts there exposed `OLD RECRUITER DRAFT`. The intentionally mismatched thread version was ignored.

**Rebuild:** Per-thread in-memory drafts, frozen run identity/context, transport envelope validation, cancellation on switch, and explicit late-event rejection. **Pass:** Start A, switch to B, deliver late A events: B cannot change; A's provisional text is retained only in A's slot with an interrupted state.

### TL-09 — Out-of-order thread fetches overwrite the current selection

**High · Reproduced.** `src/app.tsx:175`.

Thread loads have no cancellation or request generation guard. A rapid Meeting then Project selection, with Meeting delayed, ended on Meeting despite Project being selected last. The reproduction used immediate DOM click dispatch to avoid Playwright's auto-wait delaying the second gesture; the underlying requests and UI setters are real.

**Rebuild:** Abort previous loads or guard commits by the latest requested ID/version, and keep explicit loading/error state per requested selection. **Pass:** Last deliberate selection wins independently of network completion order.

### TL-10 — EOF and invalid SSE envelopes leave indefinite or incorrect run state

**High · Reproduced/code-confirmed.** `src/app.tsx:66`.

EOF is treated as successful return regardless of terminal event. A stream containing start and partial text, then EOF, leaves “Generating…” and disabled controls indefinitely. The parser validates no protocol version, identity, duplicate/gap sequence, terminal count, frame size, or stream idle deadline. It only recognizes one-line LF-delimited frames and silently drops an unfinished trailing frame.

**Rebuild:** A bounded real SSE parser feeding a run reducer; exactly one terminal, no inferred completion from EOF, and explicit `PROTOCOL_ERROR`/interrupted states. **Pass:** Test chunk fragmentation, duplicate/gap sequences, malformed JSON, wrong identity, missing terminal, heartbeat delays, and final buffer handling.

### TL-11 — Editing during generation corrupts text and bypasses the review gate

**High · Reproduced.** `src/app.tsx:253`, `src/app.tsx:673`, `src/app.tsx:283`.

The editor remains writable while generation is active. Typing changes `draftState` to editable; subsequent deltas append to the user edit, enabling Review while the request continues. The completed event replaces the entire draft and discards the user's edit. Observed intermediate text: `AUDIT MANUAL EDITThanks for reaching out. I’m `; observed final text: the original full generated reply.

**Rebuild:** Separate generation state from draft revision/review state. Either make provisional text read-only or require cancellation before editing. Only complete current revisions can be reviewed/copied; regeneration preserves the previous editable draft and undo history. **Pass:** No edit is silently overwritten; active generation cannot be reviewed/copied by button or shortcut.

### TL-12 — Default recordings fabricate availability and promises

**High · Reproduced.** `src/server.ts:65`, `src/server.ts:382`.

The recruiter acknowledgment invents “Tuesday afternoon and Thursday morning,” which neither source nor user supplied. It also adds promises/signature contrary to the fixed P0 constraints. The generic recording promises to follow up shortly. `lintFlags` is always empty, so these violations are copyable after review. A custom personal fact was accepted in recorded mode and concatenated into supposed reviewed output instead of receiving unsupported-input handling.

**Rebuild:** Grounded immutable recordings keyed by exact fixture/version/recipient/intent/empty-facts input, explicit unsupported-input UI/API, and a shared draft lint pipeline rerun after edits. Acknowledgments must not manufacture an answer to missing personal facts. **Pass:** Zero unsupported recipients, availability, numbers/dates, or promises across recorded cases; custom recorded inputs follow the specified explicit alternative.

### TL-13 — Recipient selection points replies at the viewer

**High · Reproduced.** `src/app.tsx:629`, `src/server.ts:383`.

Both client and server use the final message sender as recipient. Waiting-on-reply is outbound from Alex to Maya: panel displays **To Alex Rivera**, while the body says **Hi Maya**. Customer escalation also ends with Alex's outbound message. Reply-All/last-valid-inbound/recipient-unavailable rules are absent.

**Rebuild:** One deterministic recipient service used by preview, request validation, and completion. Outbound waiting threads target the last outbound non-viewer recipients; unknown identity requires an explicit generic fallback. **Pass:** Recipient IDs, names, addresses, and body context agree across inbound, outbound, missing-sender, same-name, and group fixtures.

### TL-14 — User facts leak between thread contexts

**High · Reproduced.** `src/app.tsx:134`, `src/app.tsx:184`, `src/app.tsx:246`.

`facts` is global and not reset on thread change. An audit fact entered for recruiter appeared in the project thread's facts input. Every `startReply`, including acknowledgment/clarification, sends the hidden facts array. This can attach irrelevant private facts to a later live request. Intent/source/error state also survives selection in inconsistent ways.

**Rebuild:** Context-scoped ephemeral facts and draft revisions; freeze exact selected facts per deliberate run and send facts only where intended. Clear or restore the correct per-thread context on switch. **Pass:** Facts entered in A cannot appear or be transmitted from B, and a plain acknowledgment does not silently transmit stale facts.

### TL-15 — Evidence controls do not navigate to or expose the supporting span

**High · Reproduced.** `src/app.tsx:769`, `src/app.tsx:1032`, `src/app.tsx:1090`.

Source click sets only `focusedEvidence`. No `scrollIntoView`, focus handoff, exact quote highlight, or evidence inspection is implemented. In the long thread, the supporting message stayed at approximately **y = 4,621 px**; focus remained on the Source button. All source labels are identical and `EvidenceLink.id` is unused.

**Rebuild:** Evidence inspector or inline supporting span with exact quote, sender/time, provenance, and guarded focus/scroll. Give each link a meaningful accessible name. **Pass:** From a visible brief item, V/click reveals and focuses its specific clause, even in a long thread, without losing reader context.

### TL-16 — Some recorded citations are valid substrings but do not support their claims

**High · Code-confirmed.** `src/fixtures.ts:403`, `src/fixtures.ts:444`, `src/fixtures.ts:594`, `src/fixtures.ts:659`.

Examples: customer decision “A workaround was reproduced in staging” cites only “we do not have a confirmed fix date yet”; waiting commitment “hold the report” cites the request clause rather than the hold statement; project summary says the fixture is available but its summary sources are the review/deadline clauses. Summary evidence is mechanically chosen from the first two inserted IDs. Evidence reconstruction searches the first matching quote, losing occurrence/message intent when text repeats. All summary basis labels are explicit regardless of interpretation.

**Rebuild:** Independently review recordings against clause-level evidence; persist the actual validated evidence objects rather than reconstructing a second quote dictionary. Distinguish substring validity from semantic entailment. **Pass:** Every consequential recording claim has relevant support and correct basis; duplicate-occurrence and quoted-history tests resolve the intended source.

### TL-17 — Date-only values display one day early; date rules are absent

**High · Reproduced/missing.** `src/app.tsx:97`, `src/app.tsx:878`, `src/fixtures.ts:496`.

`new Date('2026-10-09')` is midnight UTC, then formatting in New York produces Oct 8. The project deadline displayed `2026-10-09 / Resolves to Oct 8`. Relative dates are hard-coded, there is no resolver/DST validation, datetime/range UI is incomplete, deadlines carry insufficient source-zone metadata, and no confirmation override/overdue behavior exists.

**Rebuild:** Separate plain calendar dates from instants; resolve only supported absolute/source-local relative phrases with explicit zone provenance and invariants. Add a local confirm-date flow. **Pass:** Date-only values keep their calendar date in every viewer zone; ambiguous and DST cases remain unresolved; instants/ranges are displayed accurately.

### TL-18 — Follow-up scheduling is wrong and falsely claims persistence

**High · Reproduced/code-confirmed.** `src/app.tsx:301`, `src/app.tsx:571`.

Save immediately creates `Date.now() + (2 + scenarioOffset) days`, without preview or confirmation. This is elapsed calendar time, not two business days at 09:00 from the scenario clock. It can create reminders even where follow-up is not recommended. All saved reminders appear under Due regardless of due state, cannot be edited/cancelled/snoozed, and disappear on reload. Audit observed count 1 before reload and 0 afterward; localStorage was empty and IndexedDB had no database.

**Rebuild:** Browser-local versioned reminder repository, preview, editable app-default date/time, confirmation, due derivation from scenario clock, and append-message cancellation. **Pass:** Friday defaults to Tuesday at 09:00 local, no save before confirmation, reload preserves reminders, and an appended inbound message cancels waiting with the specified conservative reason.

### TL-19 — Task state, Done for now, dismissal, and undo are incomplete

**Medium · Reproduced/missing.** `src/app.tsx:141`, `src/app.tsx:309`, `src/app.tsx:1097`.

Completion is only a global React array keyed by action ID. Reload clears it; it is not namespaced by thread/version. Source `state` is ignored and unclear actions can be completed without distinguishing applicability. No dismissal, thread disposition, reset confirmation, 20-entry undo, or deadline overrides exist.

**Rebuild:** Typed IndexedDB repositories and an in-memory undo service implementing specified user-state semantics. **Pass:** Completion/dismissal/disposition survive reload, old-version state is not silently mapped to changed actions, U restores the latest supported local action, and storage failure shows an honest fallback.

### TL-20 — Scenario clock is the host clock with a day offset

**Medium · Reproduced/code-confirmed.** `src/app.tsx:146`, `src/app.tsx:303`, `src/app.tsx:738`, `src/server.ts:160`.

Bootstrap supplies October 5 scenario time, but UI/reminders use `Date.now()`. The audit displayed Scenario time Oct 6 on first load. Changing real date or host environment changes deterministic demo behavior; the advance control does not derive overdue/reminder status.

**Rebuild:** One scenario-clock service anchored to bootstrap plus session offset; viewer/source zones remain separate. **Pass:** Fixed fixture results and reminder defaults do not drift with the machine's date, and advancing the scenario produces the defined due-state transitions.

### TL-21 — Several visible controls are placeholders and required semantic sections are not rendered

**Medium · Reproduced/code-confirmed.** `src/app.tsx:351`, `src/app.tsx:549`, `src/app.tsx:604`, `src/app.tsx:752`, `src/app.tsx:1070`.

Analyze only toasts and makes no `/analyze` request. Search threads is a div, not a searchable input. Message Reply, Attach, More, reader More, and Brief options have no handlers. Earlier messages are not manually expandable. Decisions and commitments never render; Dates & decisions displays only deadlines/warnings. Response state is not shown, and the informational fixture has no Done for now while prominently proposing a reply.

**Rebuild:** Connect relevant controls to application services; remove or clearly disable unsupported actions. Render the required brief hierarchy, status/basis and response assessment. **Pass:** Each enabled visible action produces its named effect, Analyze reaches the API/recorded service, and no-action mail has appropriate disposition instead of an unnecessary primary draft suggestion.

### TL-22 — Keyboard behavior disagrees with labels and specification

**Medium · Reproduced/code-confirmed.** `src/app.tsx:386`, `docs/demo-script.md`.

Shift+R is captured as ordinary R and starts Acknowledge; test showed no facts field. R always regenerates instead of focusing an existing draft. C/L/V/E/U and queue/action arrow behavior are missing, despite labels/help advertising some of them. Mod+Enter only checks the draft ref, not facts; no regenerate chord. A opens a section but does not focus an item. Escape in a text input always cancels; Escape with reply open outside editing closes instead of first cancelling. The X labelled Close reply cancels but leaves the panel open. No single-key disable preference or IME guard exists. The documentation says R returns to the queue, contradicting the app.

**Rebuild:** Context-aware command registry, one shortcut dispatcher with overlay/run priority, platform labels, focus behavior, and pointer parity. **Pass:** Implement every row of the spec's Exact keyboard map and test typing, modifiers, IME, existing drafts, all overlays, and no-action cases.

### TL-23 — Modal/focus and accessibility behavior fail launch gates

**High for accessibility acceptance · Reproduced/missing.** `src/app.tsx:932`, `src/app.tsx:975`, `src/styles.css:19`.

Palette and performance overlays have no dialog semantics, trap, inert background, invoker restoration, or polite lifecycle announcements. Performance remains open after Escape. The reader More button is unnamed. Landmarks are unnamed/ambiguous and source links are undifferentiated. Axe found critical button-name and serious contrast issues on all three audited surfaces. Example contrast: selected preview **2.96:1**; ordinary muted preview **3.83:1**, below 4.5:1. Color tokens and visible outlines alone did not meet the gate.

**Rebuild:** Accessible primitives, labelled landmarks/buttons/inputs, focus restoration and traps, aria-expanded/selection/revision status, and contrast-safe tokens. **Pass:** Zero serious/critical axe findings on required surfaces plus keyboard-only and documented NVDA/VoiceOver walkthroughs. Do not claim axe substitutes for manual screen-reader testing.

### TL-24 — Layout hides the next action and fails long-thread workspace behavior

**Medium · Reproduced.** `src/app.tsx:127`, `src/styles.css:52`, `src/styles.css:156`, `src/styles.css:328`.

Default section is Waiting on others, so the first next action and open question are collapsed on initial load. The shell has a minimum height rather than a bounded desktop viewport; even the initial 1440×900 page is 953 px tall. The long reader grows to thousands of pixels instead of scrolling independently. On 1024×900 the brief starts at y=924, below the viewport; it should be compactly available above the messages. The CTA's label/description are laid out as competing horizontal flex children rather than a clean text stack.

**Rebuild:** Fit desktop shell to available height, independently scroll queue/reader/brief, show the first actionable row/question by default, and put compact brief above reader at intermediate widths. **Pass:** At 1440×900 summary and primary action are visible without page scroll; long source inspection does not move the whole workspace; 960–1279 layout preserves brief priority.

### TL-25 — Narrow screens lose follow-ups and have undersized controls

**Medium · Reproduced.** `src/styles.css:1063`, `src/styles.css:1090`, `src/styles.css:706`.

At 320 px the page itself had no horizontal overflow on the default scenario, a positive result. However `.sidebar-foot` is hidden entirely, so reminders have no visible list. Narrow shortcut labels remain visible. Source links are about 12 px high; intent tabs 25 px; Close reply 30×30; bottom buttons 32×17; desktop task checkbox 18×18. These do not meet specified desktop/touch targets. CSS zoom emulation produced 2,168 px scroll width at a 1,440 px viewport; real browser zoom remains a required manual check.

**Rebuild:** Narrow drawer/stack with accessible reminder access, 44 px touch targets, hidden shortcut-only decoration, and robust zoom layout. **Pass:** Queue, brief, reminder, command, and review/copy functionality remain reachable at 320 px and real 200% zoom without horizontal page scroll.

### TL-26 — Initial API failure becomes an unrecoverable loading screen

**High · Reproduced.** `src/app.tsx:205`, `src/app.tsx:503`.

Bootstrap/list rejection sets a toast but leaves loading true. Early splash return hides the toast and all controls. Fault injection produced only “Loading Threadline,” with zero buttons. Recorded mode also depends on the API; no browser-local recorded fallback exists if DB/server capability fails.

**Rebuild:** Explicit bootstrap states, independent bundled recorded capability, useful failure UI, and user-triggered retry/reset. **Pass:** Unavailable bootstrap/API/DB shows actionable status and permits the defined recorded fallback; no spinner can remain indefinitely after terminal failure.

### TL-27 — Mode change silently resets the selected thread and draft

**Medium · Reproduced.** `src/app.tsx:153`, `src/app.tsx:175`, `src/app.tsx:205`.

`recordMetric` depends on mode; `loadThread` depends on it; bootstrap effect depends on `loadThread`. Changing mode therefore reruns bootstrap and loads recruiter, resetting draft state. With bootstrap capability stubbed on, switching mode from Project returned to recruiter. This is a dependency-triggered reset, not an autonomous infinite React render loop. Development StrictMode may additionally duplicate initial setup, with no cleanup/guard.

**Rebuild:** Bootstrap independent of mutable UI mode, provenance fixed per run, explicit mode switch without navigation, and effect cleanup. **Pass:** Switching recorded/live preserves selected thread and deliberate local state and does not issue unexpected bootstraps/generations.

### TL-28 — Cache identity, freshness, and recorded/live separation are wrong

**High for live correctness · Code-confirmed/missing.** `src/server.ts:19`, `src/server.ts:186`, `src/domain.ts:114`.

Cache is keyed only by thread ID. Intelligence ignores version/source query parameters and always returns a live cached extraction if present, even when the user requests recorded mode. Freshness is always true and age zero. No tuple of schema/prompt/normalizer/resolver/selection/model versions, TTL, content validation, single-flight, or stale-result states exists. Thread version excludes participant registry changes and uses a 32-bit FNV-like hash rather than the specified canonical SHA-256 identity.

**Rebuild:** Full deterministic identity tuple, explicit source query, compatible fresh/stale lookup, validated SQLite cache, corruption eviction, and provenance-aware client keys. **Pass:** Recording and live result cannot overwrite each other's meaning; participant or normalization/version changes invalidate compatibility; old entries cannot be displayed as fresh current output.

### TL-29 — Metrics are globally readable, unbounded, forgeable, and incompletely measured

**High for isolation; medium for observability · Reproduced/code-confirmed.** `src/server.ts:417`, `src/server.ts:428`, `src/app.tsx:153`, `src/app.tsx:975`.

Any visitor can POST arbitrary event fields and read all visitors' recent samples. An event with negative duration and `content: 'AUDIT CONTENT SHOULD BE REJECTED'` was accepted and returned. The array grows indefinitely; taking the last 200 for responses does not bound storage. Percentiles combine source modes and lack session/build/profile/status dimensions. UI timestamps measure request completion, not confirmed paint; follow-up/copy duration is a literal zero. No first visible reply, palette paint, provider TTFT, token/cost, failure, or benchmark measurements are collected. Replay server durations are calculated delays, not measured elapsed time. The drawer claims separate published benchmarks, which are absent.

**Rebuild:** Strict content-free events, bounded/scoped storage, origin/session/rate checks, monotonic measured timings, separate provider/UI/recorded dimensions, and reports with n/failures. **Pass:** Arbitrary content/negative/nonfinite durations reject, visitors see only their session, mode distributions stay separate, and reports contain actual measurements rather than claims.

### TL-30 — Fixtures do not exercise the promised edge cases

**Medium · Reproduced/static review.** `src/fixtures.ts:39`, `src/fixtures.ts:157`, `src/fixtures.ts:248`.

- Meeting has three messages, includes viewer availability already, and lacks the specified four-message changed-proposal/no-known-availability scenario.
- Project has no changed decision/supersession and omits the dependency's exact timestamp from extracted deadlines.
- Long thread has 44 messages but only **3,394 body characters**. This does not support the claim that its source exceeds 12,000 estimated tokens. Content is uniform short updates, with no repeated quotations or reversed older decision. Only three of four registered participants speak. August timestamps cycle backward once; the final “latest” row is August 16 after older rows dated August 28.
- Metadata fixture has identical text under different sender/timestamp metadata, which must **not** be deduplicated; it contains no actual exact duplicate to prove removal and no repeated quoted commitment. Preview claims “the duplicate is ignored” without such a pipeline.
- Injection lacks the full encoded/fake-delimiter cases from the specification.
- Append-message variant, oversized-newest and corrupt system-test fixtures are absent.

**Rebuild:** Canonical sources plus independent recordings/gold labels satisfying every fixture row. **Pass:** Real duplicates, corruption, chronological order, supersession, body budgets, unknown identities, and append invalidation are asserted rather than cosmetically named.

### TL-31 — Canonicalization and semantic domain contracts are skeletal

**High for trustworthy extraction · Missing/code-confirmed.** `src/domain.ts`, `src/fixtures.ts:278`, `src/fixtures.ts:676`.

There is no NFC/newline/quoted-authored segmentation, robust deduplication, occurrence selection, supersession model/cycle handling, deterministic date resolver, coverage budget selector, reply lint, source identity/recipient validator, or immutable extraction version metadata. `makeEvidence` only uses first `indexOf` and declares every quote authored. Recorded `createdAt` changes on every process start despite stable recording ID. The UI cannot reconstruct the complete provenance contract from current domain types.

**Rebuild:** Pure domain services and strict contracts as separate modules/packages with adversarial tests. **Pass:** Every specification invariant is executable and covered; record creation/provenance is fixed in a reviewed manifest, not regenerated wall-clock metadata.

### TL-32 — Environment setup and readiness/deployment claims are misleading

**High for deployment · Code-confirmed/missing.** `.env.example`, `README.md`, `src/server.ts:153`, `src/server.ts:458`.

README says copying `.env.example` to `.env` enables live mode, but no dotenv, `--env-file`, `loadEnvFile`, or equivalent is used by start/dev. `APP_ORIGIN` is unused. `/readyz` returns `database: true` with no database. Server listens on all interfaces without configured validation and lacks explicit listen rejection/graceful shutdown. Docker/Railway single-instance configuration, mounted database, migrations, backup/recovery, CI, secret scan, hosted smoke, and walkthrough artifact are absent.

**Rebuild:** Validated environment loading, dependency-aware readiness, single-instance deployment, proper shutdown, and actual ops artifacts. **Pass:** Documented env/start workflow works, missing secrets disable live safely, DB failure fails readiness/live admission, and a clean containerized production smoke passes.

### TL-33 — Test/evaluation suite cannot establish the required quality

**High for release acceptance · Missing.** `tests/domain.test.ts`, `scripts/validate-fixtures.ts`, `eslint.config.js`.

Three fixture tests do not cover build/start, endpoints, date correctness, recipient rules, source semantics, stream races/EOF, malformed provider output, copy review, storage, budgets, security, or UI. Fixture validation checks only nonempty messages/extraction presence/thread IDs. There are no real temporary DB tests, HTTP SSE integration, frontend component tests, E2E/axe gates, performance tests, 24-thread independent corpus/labels, scripted eval harness, held-out adjudication, or live release report. ESLint's installed plugin has no meaningful rules enabled.

**Rebuild:** Risk-based tests and the required CI/eval harness before public live integration. **Pass:** Named failure behaviors pass, source/date/version/budget/cancellation helpers meet the specified coverage target, axe gates pass, packaged production startup is tested, and live acceptance is reported separately from deterministic recordings.

### TL-34 — Documentation overstates implementation and contains conflicting guidance

**Medium · Code-confirmed.** `README.md`, `docs/ai-system.md`, `docs/performance.md`, `docs/demo-script.md`.

AI docs imply an extraction validation boundary although no runtime schema/evidence validation exists. Performance docs claim bootstrap/extraction/brief-ready timing events that code does not emit. Drawer/docs imply separately published reports without artifacts. Demo script misstates R behavior. README's complete-local-vertical-slice framing obscures broken packaged startup and missing persistence. `docs/limitations.md`, ADRs, actual visual/measurement links, live quality report, backup instructions, and recorded walkthrough are missing or shallow.

**Rebuild:** Describe verified behavior and explicit limitations only; update docs from the finished implementation and linked evidence. **Pass:** A fresh reviewer can run the app, follow the demo exactly, inspect measurements/evals, and distinguish actual implementation from planned work.

## 6. Loops, hangs, and state machines

No autonomous infinite render loop was established. The concrete problematic loops/states are:

| Trigger                  | Observed or code-confirmed result                                    | Required termination                                                     |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Bootstrap/list failure   | Endless loading splash; hidden error toast                           | Recoverable failed bootstrap, recorded fallback, explicit retry          |
| SSE EOF without terminal | Endless Generating state                                             | Interrupted terminal state with retained partial text                    |
| Slow provider            | No application hard deadline, heartbeat, or upstream abort           | Total deadline, first-text fallback, idle detection, cost reconciliation |
| Mode flip                | Dependency chain reboots and resets to recruiter                     | Stable bootstrap and explicit mode-scoped operation                      |
| Repeated R               | Always aborts/restarts/clears draft                                  | Existing draft focus; explicit regeneration only                         |
| Rapid thread changes     | Latest response wins instead of latest selection                     | Request-generation guard/cancel                                          |
| Late old stream          | Global draft updated in new context                                  | Run/thread/version matching and late-event rejection                     |
| Close reply X            | Cancels but never closes                                             | Defined cancel/close priority with preserved memory draft                |
| Escape with Performance  | Performance overlay stays open; lower-priority reply action can fire | Highest-overlay close with focus restoration                             |
| Malformed extraction     | Render exception blanks app                                          | Strict validation and recoverable boundary                               |

The rebuild needs explicit reducers for bootstrap, selection, generation, draft revisions, overlays, and reminders. Adding another boolean to the current global component will not resolve these interactions reliably.

## 7. P0 traceability

| Spec P0 item                                              | Current status                                         | Findings to resolve           |
| --------------------------------------------------------- | ------------------------------------------------------ | ----------------------------- |
| 1. Ten scenarios plus append variant                      | Ten names exist; scenario content/variant incomplete   | TL-30, TL-31                  |
| 2. Three regions, pointer/keyboard parity                 | Visual shell exists; parity/layout/focus incomplete    | TL-15, TL-21–25               |
| 3. Reviewed initial briefs and bounded live reanalysis    | API recordings exist; live UI/input/controls broken    | TL-02–07, TL-21, TL-26–28     |
| 4. Complete action brief semantics                        | Several fields hidden or missing                       | TL-16–17, TL-21, TL-31        |
| 5. Evidence/date validation                               | Current quote slices match; domain pipeline absent     | TL-03, TL-15–17, TL-31        |
| 6. Live/recorded replies, edit/cancel/review/copy         | Happy path exists; unsafe/state defects                | TL-04, TL-08, TL-10–14, TL-22 |
| 7. Supported recording combinations/custom input behavior | Generic generation masquerades as recordings           | TL-12–14                      |
| 8. Completion/dismissal/Done/reminders/undo               | Only memory checkbox/reminder stub                     | TL-18–20                      |
| 9. Cache, dedupe, timeout, idempotency, cost ceilings     | Most absent                                            | TL-04–10, TL-28               |
| 10. Timings/provenance/benchmarks                         | Partial local panel only                               | TL-29                         |
| 11. Tests/evals/accessibility/deployment smoke            | Basic checks pass; launch quality gates absent/failing | TL-01, TL-23, TL-33           |
| 12. Security/docs/hosted demo/walkthrough                 | Local docs exist; delivery/controls incomplete         | TL-05–07, TL-32–34            |

Do not assign a completion percentage from this table. Each P0 row contains independent acceptance gates; no row here proves full release acceptance.

## 8. Rebuild plan for the other agent

### Phase A — Reproducible execution and contracts

1. Preserve the existing app as an inspectable reference. Preserve read-only synced `sources/` material.
2. Separate web/API build directories; pin runtime/package manager; add clean-build/start smoke.
3. Establish the specification's contracts/domain package boundaries and strict request/response/SSE schemas.
4. Create pure canonicalization, SHA-256 identity, evidence/owner/recipient/date/coverage/lint services.
5. Fix the fixtures and author independent recording manifests and labels. Add append/corrupt/oversized sources.

### Phase B — Recorded-first product correctness

1. Make bundled reviewed recordings usable independently of API/live availability.
2. Implement thread-scoped request/run/draft state with stale-event rejection, EOF handling, cancellation and revision review.
3. Correct recipients, grounded recordings, facts isolation, date display, and evidence inspection.
4. Implement IndexedDB user state, scenario clock, preview/confirm reminders, Done for now, dismissal, and undo.
5. Render the complete brief; wire or remove placeholder controls; implement the exact keyboard map and focus behavior.
6. Fix workspace height, intermediate brief placement, narrow access, touch targets, contrast, and modal semantics.

### Phase C — Controlled live service

1. Implement SQLite/Drizzle migrations, cache tuple/TTL, run/idempotency repositories, and persisted cost ledger.
2. Implement signed sessions, exact-origin checks, safe headers/errors/log redaction, strict payload limits, and rate/concurrency limits.
3. Add a scripted provider adapter first; demonstrate actual stream/abort/timeout/backpressure and output validation.
4. Add the real provider adapter with strict JSON output, bounded retries/repair, frozen draft context, same coverage, no tools, and usage reconciliation.
5. Keep real-provider calls out of ordinary CI; keep live disabled unless the deliberate live release checks pass.

### Phase D — Evidence and delivery

1. Build the required tests, 24-thread eval corpus, independently authored gold labels, matcher/adjudication, and reports.
2. Measure UI paint and real provider TTFT separately with n, failures, source, cache, environment, and build labels.
3. Produce CI, Docker/Railway single-instance/volume config, backup/restore, health/readiness, and deployment smoke.
4. Update README/docs/ADRs with actual screenshots and results; record the walkthrough and document limitations.
5. If hosting or paid live evaluation requires credentials or deliberate launch authorization that is unavailable, finish the reviewable local work and report that specific external gate. Do not fabricate deployed/live success.

### Required regression cases before claiming rebuilt

| Test                           | Exact passing behavior                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Clean build/start              | Executable built API survives Vite build and serves the built client                                    |
| Initial outage                 | Actionable failure and recorded fallback, not a permanent splash                                        |
| Reversed request latency       | Last selected thread remains selected                                                                   |
| Cross-thread stream            | Late A deltas never mutate B                                                                            |
| Protocol gap/EOF/wrong version | Interrupted/protocol-error state, partial text retained, no silent completion                           |
| Edit/review concurrency        | No write/overwrite/copy of an active incomplete run; revision invalidates review                        |
| Recruiter default              | No fabricated windows, accommodations, or promises                                                      |
| Outbound recipient             | Maya is recipient on waiting thread; viewer is excluded                                                 |
| Facts isolation                | A facts cannot enter B request; recordings reject unsupported custom input                              |
| Plain dates                    | October 9 remains October 9 across viewer zones                                                         |
| Reminder                       | Friday + two business days = Tuesday 09:00 user zone; preview required; reload persists                 |
| Append variant                 | New inbound message cancels waiting reminder with conservative reason                                   |
| Malformed model output         | No blank-page crash, no invalid cache, existing valid brief retained                                    |
| Session/origin/budget          | Foreign/tampered/over-budget requests reject before provider dispatch                                   |
| Idempotency                    | Same-key changed body 409; active duplicate 409; completed reply replay 410                             |
| Cache source/version           | Recorded/live separation and freshness are correct                                                      |
| Metrics                        | Content-free, bounded, session-scoped, failures/source separated                                        |
| Evidence                       | Exact relevant span scrolled/focused with meaningful source label                                       |
| Keyboard/modals                | Full specified map, modal priority, focus restoration, typing/IME safe                                  |
| Accessibility/layout           | Zero serious/critical axe; manual assistive checks; primary action visible; 320 px/real zoom functional |
| Deployment                     | Actual production host SSE/cancel/headers/DB restart tested and documented                              |

## 9. Ready-to-use instruction for the rebuilding agent

> Rebuild Threadline using `deliverables/Threadline-Implementation-Specification.md` as the authoritative P0 contract and this audit as a defect/verification checklist. The existing application is a source-run visual demo, not a complete product. Preserve its useful visual direction and fictional fixture identities while replacing the missing domain, state, persistence, provider, security, and operational foundations. Begin by reproducing TL-01 and the high-severity fault cases, then implement the phased plan and regression table. Do not describe a feature as complete because a dependency is installed, an API route exists, a button toasts, or fixture snapshots pass. Do not enable public live AI until schema/grounding, origin/session, durable budget, concurrency, abort, and release-quality gates pass. Do not claim live quality or hosted performance from recordings. Deliver runnable source, a clean packaged startup, required tests/docs, and a status table linking each resolved finding to its validation. Preserve all read-only synced project sources. Report any real external deployment/evaluation gate honestly, with the local work finished and reviewable.

## 10. Limits of this audit

This is a comprehensive source-and-local-runtime audit of the supplied project, not a penetration-test certificate or a live-model accuracy certification. Ordinary API/UI flows, deterministic network faults, layout measurements, and axe checks were exercised. Real provider billing/cancellation, hosted proxies, Firefox/WebKit, NVDA/VoiceOver, and actual browser zoom require the rebuild's separate acceptance checks. Recorded substring validity was checked across returned evidence, but it does not prove semantic entailment; explicit counterexamples are documented in TL-16. A passing bundle size or three fixture tests must not be used to imply those untested gates passed.
