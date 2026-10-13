# Local verification benchmark

Measured 2026-10-06T20:46:58.383Z, v24.19.0.

Windows localhost, one Node process, SQLite in memory, four independent anonymous sessions (one per pass), recorded corpus, no network shaping.

Two sequential HTTP requests and JSON parsing per switch; no React paint, provider latency, or user time saved measured. Pass 0 is excluded from warm percentiles. Recorded reply pacing is artificial playback.

- Warm source + brief: p50 18.00 ms; p95 19.84 ms; 30 samples.
- Recorded replies: 11.0 ms first delta / 93.7 ms terminal; 1.2 ms first delta / 81.7 ms terminal; 10.3 ms first delta / 92.5 ms terminal.
- Corpus: 11/11 pass structural and evidence validation, including the appended reply. This does not measure live-model semantic accuracy.

[Raw samples, corpus checks and source hashes](local-benchmark.json).
