# Email Center — 45-second recruiter / engineering walkthrough

Read at a conversational pace, about 150 words per minute. The spoken script is 109 words; allow short pauses while clicking.

## Spoken script

“Threadline helps you turn an email into a clear, verifiable next step. I built it with React, TypeScript, Vite and Fastify, using Turso SQLite and a streamed, free Nemotron model through OpenRouter.

I’ll open Maya’s scheduling mail. The overview identifies what needs my reply; clicking the evidence reveals the exact source.

Now I’ll enter, ‘I’m busy this week; early mornings would probably work.’ The generated reply preserves that uncertainty. If I change my notes, Threadline requires an updated draft before review and copy.

This is a demo workspace: it doesn’t connect to or send email. The goal is practical—less rereading, clearer decisions, and human control over every outgoing reply.”

## Click sequence

| Time | Screen action | Expected result |
| --- | --- | --- |
| 0–12 seconds | Start with the inbox visible. | Show the three-column workspace while introducing the objective and stack. |
| 12–22 seconds | Open Maya’s scheduling mail; inspect the relevant source evidence in Next Step. | The full source expands and the supporting quote is highlighted. |
| 22–34 seconds | Open Reply → Answer with facts. Enter “I’m busy this week; early mornings would probably work.” Generate the draft. | The draft asks about an early-morning option and preserves “probably”; it should not accept Tuesday at 2 pm. |
| 34–39 seconds | Add “Wednesday at 11 am ET works for me.” to the notes. | The old draft is marked as needing an update; it cannot be reviewed or copied as current. |
| 39–45 seconds | Finish on the reply editor and review controls. | Close on the assumptions and human control. Regenerate and complete review after the recording if needed. |

Prepare Maya’s mail and the reply panel before recording. Leave time for the actual live response; the click timings are rehearsal targets, not a provider latency guarantee. This walkthrough describes the Vercel/Turso deployment; local development uses native SQLite.
