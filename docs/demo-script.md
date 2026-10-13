# Employer walkthrough: three minutes

Threadline demonstrates a focused product decision: make the next email action inspectable before asking someone to trust or copy an AI draft. It gives a reviewer working evidence of interaction design, correctness boundaries, recovery behavior and engineering judgment.

## 0:00–1:00 — Safe drafting

Open Recruiter coordination. Inspect response needed, action owner and exact source evidence. Draft an acknowledgment, edit the text, review it and copy. Edit again to show that review is invalidated. With live AI configured, the reply comes from the model; without it the example uses a conservative prewritten reply. Close and reopen the panel to show draft recovery.

## 1:00–2:00 — A complete waiting workflow

Open Waiting on the revised numbers. Press F, inspect the proposed business-day date at 9 AM New York, edit it if desired and confirm the local reminder. Append the synthetic incoming reply. The queue, message count, version and brief now change together. The old reminder is flagged for review; remove it and demonstrate Undo. Advance the scenario clock to inspect due reminders. No mail is sent.

## 2:00–3:00 — Trust and resilience

Click New mail. Enter an example sender, subject and incoming request, then add it. Fetch builds an overview grounded in the actual text. Choose Answer with facts, supply your preference, generate, review and copy. Free-model responses may take tens of seconds; Fetch can be cancelled and retried. The optional Demo guide stays dismissed once closed.

For a deeper review, inspect long-history coverage, the hostile-source scenario, informational Done for now, Mod+K/J/K/V/Escape, folder filters and empty-section ordering.

## Technical evidence to inspect afterward

- [Current UI and live update](../deliverables/Email-Center-UI-and-Live-Update.md) and [previous audit](../deliverables/Threadline-Reaudit-and-Employer-Review.md).
- [Repeatable local benchmark](../deliverables/verification/Local-Benchmark.md) and raw samples/source hashes.
- Tests for stale-event races, real SDK cancellation, restart accounting, exact evidence and reviewed copying.
- [Actual architecture and tradeoffs](architecture.md), including native SQLite/IndexedDB and one-instance limits.

The employer value is demonstrated judgment and inspectable delivery. Do not claim measured user productivity, employer cost savings, live-model quality, production readiness or affiliation with Superhuman. Those would require separate evidence.
