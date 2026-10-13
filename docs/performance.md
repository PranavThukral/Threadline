# Performance

The Performance dialog reports recent local interaction events, retaining the source and cache layer of each event. Durations include thread loading, analysis completion, usable recorded/live replies and workflow review/copy/follow-up. Events are individually shown; recorded playback and live provider latency are not averaged into a shared model-performance claim.

The server validates metric names, numeric ranges, IDs and source enums. It stores at most 200 events per session and 2,000 globally with a one-day retention period. Reads are scoped to the current signed session. These events are browser-reported diagnostics, not trusted billing records or tamper-proof measurements.

Run `pnpm build` then `pnpm benchmark:built` for isolated localhost HTTP timings. The benchmark measures source plus brief fetch/JSON parsing in two sequential requests, thirty warm samples after ten initial samples, plus three recorded reply streams. Raw samples and p50/p95 are written under `deliverables/verification` with source hashes.

The benchmark excludes React paint, WAN conditions, deployed proxy overhead, paid inference and human task duration. Recorded reply streaming deliberately paces text; that terminal duration is playback, not model generation time. No percentage time-saving or employer ROI claim is justified by these measurements alone.
