# Email Center — reply quality and color update

Date: October 13, 2026 (America/New_York). This supersedes the previous reply-generation and palette descriptions.

## The failure shown in the screenshot

The current notes said the viewer was busy and would **probably** need an early-morning time, while the visible draft chose **Tuesday at 2pm ET**. Two paths contributed to this risk:

1. Changing notes or switching reply type retained the old draft and still permitted reviewing it. Review was invalidated, but the outdated content was not clearly identified.
2. Earlier viewer availability and the sender's offered times could compete with the current notes in the model context. The previous prompt demanded literal copying of facts, producing rigid wording and still allowing weak context choices.

## What changed

- Every generated or manually adapted draft records its input signature: reply type and normalized current notes. The draft remains scoped to its source version.
- Changed notes/type show **Update draft** and a persistent notice. An outdated draft cannot be reviewed or copied. Updating submits the current notes; it does not trigger one model request per keystroke. Manually adapting the text also records the current input, then runs the content checks.
- Draft input signatures stay in tab memory along with drafts/notes. Closing, reopening or switching mails preserves their relationship; reload clears private drafting content.
- The reply prompt gives current notes priority, distinguishes offered options from accepted times, and preserves tentative language. It asks for suitable alternatives rather than inventing a time or making a blanket scheduling offer.
- Reply context excludes earlier viewer-authored messages unless one is the latest mail. Earlier incoming context remains available. Analysis still uses its bounded full source window.
- Notes are rewritten into concise professional prose rather than copied mechanically. The prompt discourages asking questions already answered by the notes/source.
- Content checks flag unsupported specific time choices, conflicting days/morning preferences, certain firm confirmations or refusals from tentative notes, and invented blanket availability. Explicitly supported clock/day availability can be paraphrased without triggering the earlier false-positive flag.

These are targeted checks, not a general semantic verifier. Complex time zones, indirect option references and arbitrary wording can still require human review. The app retains its mandatory review-before-copy boundary and does not send mail.

## Palette

The primary colors are **deep ink `#142536`** and **jade `#00796b`**. Buttons, selection, active reply intent, evidence links and overview status now use jade instead of the previous blue wash. The reply editor uses white with a jade edge; current notes sit on a light mint surface. Unread dots/bars retain blue as requested, while warnings retain their distinct semantic colors. Inter body text and Krub headings remain self-hosted.

White text on the jade action color has a calculated **5.32:1** contrast ratio. This is a token-level check, not a full rendered accessibility certification.

## Verified replies

The screenshot case through the compiled API now returned:

> Hi Maya,
>
> Early mornings would probably work better. Do you have an early-morning option?
>
> Alex Rivera

The response completed in **528 ms**, had no draft lint flags, addressed Maya and settled its run as completed. A separate explicit Wednesday-at-11am note returned the supported confirmation in **961 ms**, also with no lint flags.

Manual free-model checks also covered the screenshot constraint, explicit Wednesday availability, tentative recruiter availability and a video preference. Successful checks reported **cost 0**. A first iteration surfaced an overly broad flexibility offer and a false-positive availability lint; both were corrected before the final API checks.

The active model remains **`nvidia/nemotron-3.5-lightning:free`**, prompt revision **`threadline-openrouter.v5`**. Every request retains zero prompt/completion/request price ceilings and no paid fallback. The server credential remains in the private ignored `.env`; it is not in this report, UI or model source text.

## Verification

- **69 automated tests passed**, including a full reproduction of changing Tuesday-at-2 notes to the screenshot's morning constraint, then generating/reviewing/copying the new reply.
- Tests cover input-signature invalidation, clock/day constraints, negated slots, tentative wording, blanket offers and supported availability paraphrases, alongside the existing source, privacy, cancellation and UI suites.
- Production build, TypeScript, lint, formatting and packaged-server smoke passed.
- The credential scan checked **86 source/browser/artifact files and found zero leaks** of the actual server key.
- Manual checks use example content and are outside automated tests: `scripts/verify-reply-quality.ts` and `scripts/verify-screenshot-reply.ts`.
- The user screenshot supplied visual evidence of the original failure. No new automated browser inspection was performed because browser access was previously rejected by the environment's policy. UI behavior was tested in jsdom; the running page is the place to assess the new palette.

Individual timings and four examples are not a broad model-quality score or latency guarantee. Free-model capacity can vary. Refresh [localhost:3000](http://localhost:3000/) for the updated interface.
