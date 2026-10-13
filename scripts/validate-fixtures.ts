import { threads, recordedExtractions, recordedEvidence, appendScenario } from '../src/fixtures.js';
import { validateExtraction } from '../src/domain.js';

for (const thread of threads) {
  if (!thread.messages.length) throw new Error(`Empty thread: ${thread.id}`);
  if (!recordedExtractions.has(thread.id)) throw new Error(`Missing extraction: ${thread.id}`);
  const errors = validateExtraction(
    thread,
    recordedExtractions.get(thread.id)!,
    recordedEvidence(thread.id),
  );
  if (errors.length) throw new Error(`${thread.id}: ${errors.join('; ')}`);
  for (const message of thread.messages) {
    if (message.threadId !== thread.id)
      throw new Error(`Wrong message relationship: ${message.id}`);
  }
}
const appendErrors = validateExtraction(
  appendScenario.thread,
  appendScenario.extraction,
  appendScenario.evidence,
);
if (appendErrors.length) throw new Error(`Append scenario: ${appendErrors.join('; ')}`);
console.log(
  `Validated ${threads.length} threads and ${recordedExtractions.size} recorded extractions.`,
);
