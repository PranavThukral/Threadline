import { writeFileSync } from 'node:fs';
import { threads, recordedExtractions, recordedEvidence, appendScenario } from '../src/fixtures.js';
writeFileSync(
  'src/recorded-bundle.json',
  JSON.stringify(
    threads.map((thread) => ({
      thread,
      extraction: recordedExtractions.get(thread.id),
      evidence: recordedEvidence(thread.id),
      appendScenario: thread.id === appendScenario.thread.id ? appendScenario : null,
    })),
  ),
);
