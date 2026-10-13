# Email Center — unread state, mail expansion and latency

Date: October 13, 2026 (America/New_York). This update supersedes the previous UI/live-provider description. Workspace: `D:\Pranav\Work\Job Applications\Fall 2026 - Mar 2027\Superhuman\Email Center`.

## Interface and functionality

- The inbox initially has exactly **three unread incoming mails**, sorted first: product review, API review and office closure. They have a blue dot beside the sender, a blue bar and stronger text. Read mails use normal-weight sender/subject text. Selection has its own background and does not add an unread bar.
- Opening a mail marks that source version read. Read state survives reload, remains separate from reply/task state and clears with the local reset. Filtering and keyboard navigation use the actual displayed order.
- The right panel has a single **Next Step** heading. Removed the Overview label and horizontal divider bars from its header, summary, sections and date rows. Populated sections still precede inactive empty sections.
- **Inter** supplies body text and controls; **Krub** supplies headings and the brand. Both fonts are bundled and served locally with `font-display: swap`; they do not depend on an external font service.
- Example mails now have greetings, context, paragraphs and signatures. The long history uses substantive product/engineering/support notes rather than repeated filler. Existing evidence strings remain literal source substrings, and all source versions are recomputed.
- Headers and preview cards explicitly expand/collapse the full mail. A “Read full mail” control makes the action discoverable. Source citations expand the relevant mail and highlight the exact text. A highlighted mail can now collapse correctly, clearing its highlight.
- Fetch failures remain visible in Next Step with **Try again**, retaining the existing overview. They no longer disappear with a short-lived toast. Cancellation, stale-result rejection, source validation and reviewed-copy guards remain in place.

## Model and cost

Active model: **`nvidia/nemotron-3.5-lightning:free`**, through the official OpenRouter SDK and the same server-only credential. The user confirmed continuation after being told the new model and its zero-cost constraints.

Successful test calls reported **cost 0**. Every request specifies zero prompt, completion and request price ceilings. Only Lightning free and the original Ultra free are accepted by server configuration; Ultra is available only by explicit configuration, not as an automatic fallback. The active `.env` selects Lightning. Paid model variants and arbitrary model IDs are rejected. [Official Lightning free endpoint](https://openrouter.ai/nvidia/nemotron-3.5-lightning:free), [price-ceiling documentation](https://openrouter.ai/docs/guides/routing/provider-selection).

Latency improvements come from a lighter model, reasoning effort `none`, a compact request containing only useful source metadata, and reuse of validated cache. The server still requires completed output and exact evidence. It does not present partially generated claims as verified results.

## Real local observations

| Check                                              | Observed duration | Result                                                                                                |
| -------------------------------------------------- | ----------------: | ----------------------------------------------------------------------------------------------------- |
| Initial Lightning overview probe                   |          6,811 ms | Grounded; zero reasoning tokens; reported cost 0                                                      |
| Detailed custom-mail overview through compiled API |          2,510 ms | Validated live overview; response needed                                                              |
| First reply content through compiled API           |            275 ms | Actual streamed delta                                                                                 |
| Completed answer using supplied facts              |            428 ms | “I prefer video.” used; draft lint passed; correct recipient                                          |
| Cached custom-mail Fetch replay                    |             32 ms | Memory cache; no provider request                                                                     |
| API-review case                                    |          4,685 ms | Viewer action and October 9 deadline found; grounded; reported cost 0                                 |
| Waiting-mail case after direction fix              |          2,894 ms | Recipient owes reply; follow-up on Maya; grounded; reported cost 0                                    |
| Hostile-source case after follow-up fix            |          2,734 ms | Legitimate viewer request retained; no malicious action; no invented sender reminder; reported cost 0 |

These are individual observations, not latency guarantees or a representative benchmark. Free capacity can queue or rate-limit; one intermediate hostile-source check took 9.8 seconds. The previous heavy-model probe took 35.2 seconds and used 927 reasoning tokens. Do not claim that every free-model response completes in the latest observed time.

The final compiled build (`threadline-openrouter.v4`) passed the full API workflow again: **3,381 ms overview, 401 ms first reply delta, 869 ms completed reply, and 25 ms cached Fetch**. Supplied facts, recipient selection, private cache and settled runs all passed. All five bundled WOFF2 font files were served successfully; the local server reported ready with live Lightning free enabled.

## Model mistakes found and handled

1. A fast-model answer initially ignored supplied facts and asked an unrelated scheduling question. The reply prompt now contains instructions only for the selected intent; answers are instructed to use supplied facts verbatim and distinguish preference from availability. The full API reply check then passed.
2. The model initially described an outgoing request as requiring a response from the viewer. Current recipient obligations or a grounded pending follow-up in the viewer's authored outgoing mail now establish that the recipient owes the reply.
3. An incoming viewer request was incorrectly turned into a reminder for its sender, and another sample said the viewer was waiting on themself. Without a separate participant obligation or a grounded earlier outgoing request, the next step is the viewer's reply. Tests preserve legitimate participant commitments and earlier unresolved outgoing requests.

These direction/consistency rules use participants, source direction and validated literal evidence. They do not prove arbitrary model claims are semantically correct. A source-backed quote is necessary but not a complete truth test.

## Verification and limits

- **62 automated tests passed**, including unread order/count/persistence, expansion/collapse/source inspection, visible Fetch failure/retry, reply intent, evidence validation, direction rules, private custom-mail caching, reviewed copy and cancellation.
- Production build, TypeScript, ESLint, Prettier, fixture validation and packaged-server smoke **passed**.
- Production dependency audit reported no known vulnerabilities, including the new font packages.
- Credentials remain server-only in the ignored private `.env`. The source/browser/artifact scan checked **82 files and found zero credential leaks**, comparing against the actual key without printing it. Local listener stays on `127.0.0.1:3000`.
- No fresh rendered-browser inspection was possible because the environment rejected automatic browser access. No alternate browser/CDP/headless workaround was used. UI behavior and semantic accessibility were checked in jsdom; final visual judgment requires viewing the running page. Earlier screenshots do not represent this build.
- No public deployment, Docker run, broad model-quality benchmark, native screen-reader assessment or production mailbox validation is claimed. The app does not send mail or connect to an inbox.

Refresh [localhost:3000](http://localhost:3000/) to see the rebuilt interface. Manual live checks are excluded from automated tests: `scripts/probe-openrouter.ts`, `scripts/probe-reply.ts`, `scripts/verify-live.ts` and `scripts/verify-provider-cases.ts`.
