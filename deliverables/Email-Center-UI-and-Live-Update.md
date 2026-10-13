# Email Center / Threadline — UI and live workflow update

Date: October 12, 2026. Application directory: `D:\Pranav\Work\Job Applications\Fall 2026 - Mar 2027\Superhuman\Email Center`.

This update supersedes the earlier audit's UI and provider descriptions. Earlier screenshots and recorded timings describe the previous interface.

## What changed

- Navy (`#112847`) anchors the header; blue (`#2469ed`) marks actions and selection. Mail content uses white surfaces, real separators, stronger type hierarchy and consistent controls. Responsive layouts cover desktop, smaller windows and mobile widths.
- “Mails” replaces visible thread terminology. Removed synthetic/recorded/measured badges and the diagnostic footer. Performance and example-clock controls remain available through the command palette.
- Sender-colored initial avatars identify people in the list, conversation and account header. These are initials, not fabricated profile photographs.
- Inbox, Needs a reply, Follow-ups and search filter actual mail state. Empty folders/searches explain what will appear there.
- Populated overview sections sort first. Empty sections are grey and disabled; populated sections expand/collapse. The initial section matches the selected mail's available information.
- The optional guide opens on request and remains permanently dismissed for that browser once closed, including after reload and reset.
- New mail accepts an incoming sender, address, subject and message. It creates a session-scoped source, selects it and fetches a live overview. Added mail uses the actual calendar for reminders; the existing examples retain their repeatable calendar.
- Live replies use the supplied facts for Answer, stream actual provider content and still require review before copying. Edits/fact changes invalidate that review.

## Live AI and credentials

The official OpenRouter SDK uses exactly `nvidia/nemotron-3-ultra-550b-a55b:free`. Every request carries zero prompt/completion/request price ceilings; no alternative or paid model is configured. Latency routing selects among eligible providers for that model. Application retries are explicit user actions.

The supplied credential exists only in the server environment/private `.env`. Windows permissions grant access to the current user and SYSTEM. Git/Docker exclusions keep environment files out of source/build packaging. The server listens on `127.0.0.1:3000` for this local preview. No key is exposed through bootstrap, UI, streamed events, raw provider errors or update notes. The browser bundle and project artifacts are checked against the actual secret without printing it.

Sources/facts go to OpenRouter/NVIDIA when live AI is invoked. The free model may retain/train on submitted text; the new-mail dialog asks for example content and warns against private information. Added mails expire with their anonymous signed session (up to 24 hours) and disappear on reset/restart. Their analysis cache is memory-only with a one-hour TTL. SQLite retains run/quota metadata but not custom mail bodies, reply facts or drafts. Browser drafts/facts remain in tab memory.

## Bugs found and fixed during this update

1. **Free-call accounting:** absent paid-provider tariffs could produce a non-finite cost. OpenRouter now settles at zero while still enforcing provider-attempt quotas. Cache hits do not consume a provider attempt.
2. **Real-calendar reminders:** added mail initially inherited the fixed example date. New mail now uses the actual New York date, weekends and DST when choosing a reminder.
3. **Reply-needed semantics:** a real model response found a current viewer request but called response state “unclear” because no reply had arrived. The prompt now defines whether the viewer needs to reply next; grounded current requests in the newest authored incoming mail deterministically establish that need. Quoted/outbound requests do not trigger that rule.
4. **Timeouts and incomplete output:** a provider deadline now reports a timeout separately from user cancellation. Existing overviews survive failures. Truncated streams cannot become completed/reviewable drafts without manual editing.
5. **New-mail accessibility:** eliminated duplicate banner landmarks, focused the first input, excluded disabled inputs from focus trapping and prevented Escape from closing a pending submit.
6. **Reply intent styling:** corrected the CSS selector to style the actual intent controls.
7. **Mode and queue state:** resetting/appending examples preserves configured live reply capability; queue reply-state reads validated cached analysis, including ephemeral custom results.

## Verification

- **57 automated tests passed** across domain, storage, offline, API/provider/protocol and React workflows.
- TypeScript checks, ESLint, Prettier checks, fixture validation and production build passed.
- Compiled-server smoke passed: built assets, health/readiness, session, ten examples, recorded analysis and reply.
- Production dependency audit reported no known vulnerabilities.
- Credential scan checked 68 source/test/document/artifact/browser-build files against the actual server key and found **zero leaks**. The private `.env` retained its restricted Windows permissions.
- Actual OpenRouter SDK cancellation was verified against a local HTTP stream; automated tests make no external model calls.
- Semantic accessibility checks passed for the main view, command palette and new-mail dialog. Tests cover guide dismissal across reset/reload, populated-section sorting, filters/empty states, custom input → live Fetch, review/copy guards and stale-result rejection.
- Provider boundary tests reject fabricated quotes/owners, incomplete output and unexpected nonzero reported charges. They verify reasoning exclusion, the exact model/zero-price request, custom session isolation, memory-only cache and zero-tariff quota enforcement.

### Real free-model observations

The revised compact prompt produced a validated example overview in **35,165 ms**, with **709 input tokens / 1,454 output tokens**, including **927 reasoning tokens**. The provider reported **cost 0**.

After fixing reply-needed semantics, the compiled app's full custom-mail workflow passed: signed session → added mail → live overview → private cache → live answer from supplied facts → correct recipient → settled completed runs. Overview took **14,830 ms** and reply took **8,511 ms**. The reply used “I prefer video.” Actual content deltas were observed. The verification session's added mail was removed after success.

These are individual local observations, not latency guarantees or a reliability benchmark. Earlier experimentation included a 90-second timeout and an unavailable catalog request. Free capacity can queue, fail or rate-limit; the application preserves state and supports explicit retry.

Manual checks: `pnpm exec tsx scripts/probe-openrouter.ts`, `pnpm exec tsx scripts/verify-live.ts`, and `pnpm exec tsx scripts/check-secrets.ts`. The first two make actual free-model requests and are excluded from routine tests.

## Review limits

The new UI has not received a fresh rendered-browser inspection: automatic browser access was explicitly rejected by the environment's browser policy. No alternate browser/CDP/headless workaround was used. The old screenshots must not be presented as the current design. Automated UI/semantic checks and code/CSS review passed; final visual judgment requires viewing the running page.

Literal evidence checks and a few live examples do not prove semantic correctness on arbitrary mail, prompt-injection immunity, user productivity or employer ROI. Broad corpus evaluation, native screen-reader testing, hosted/proxy behavior and Docker execution remain unverified. This is an inspectable portfolio application with real live generation, not an authenticated production mailbox. It does not send mail or connect to an inbox.

Open the running preview at [localhost:3000](http://localhost:3000/) and refresh an already-open tab to load the new assets.
