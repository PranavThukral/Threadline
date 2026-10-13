import { describe, expect, it } from 'vitest';
import { recordedEvidence, recordedExtractions, threads } from '../src/fixtures.js';
import { hashText, validateExtraction } from '../src/domain.js';

describe('Threadline fixtures', () => {
  it('contains the required synthetic scenarios', () => {
    expect(threads).toHaveLength(10);
    expect(recordedExtractions.get('recruiter-coordination')?.response.state).toBe('yes');
    expect(recordedExtractions.get('informational-update')?.response.state).toBe('no');
  });

  it('keeps long-thread coverage explicit', () => {
    const extraction = recordedExtractions.get('long-project-history');
    expect(extraction?.coverage.mode).toBe('partial');
    expect(extraction?.coverage.omitted.length).toBeGreaterThan(0);
  });

  it('preserves source spans for the injection fixture', () => {
    const thread = threads.find((item) => item.id === 'prompt-injection')!;
    expect(thread.messages[0].body).toContain('<script>');
    expect(recordedExtractions.get(thread.id)?.warnings[0]).toContain('untrusted');
  });

  it('validates every reviewed extraction against exact evidence spans', () => {
    for (const thread of threads) {
      const extraction = recordedExtractions.get(thread.id)!;
      expect(validateExtraction(thread, extraction, recordedEvidence(thread.id))).toEqual([]);
    }
  });
  it('requires explicit evidence for completed actions, fulfilled commitments and answered questions', () => {
    const thread = threads[0];
    const value = structuredClone(recordedExtractions.get(thread.id)!);
    value.actions[0].state = 'completed';
    value.questions[0].state = 'answered';
    const errors = validateExtraction(thread, value, recordedEvidence(thread.id));
    expect(errors).toContain('completed action needs completion evidence');
    expect(errors).toContain('answered question needs answer evidence');
    const project = threads.find((item) => item.id === 'project-status')!;
    const brief = structuredClone(recordedExtractions.get(project.id)!);
    brief.commitments[0].completionEvidenceIds = [];
    expect(validateExtraction(project, brief, recordedEvidence(project.id))).toContain(
      'fulfilled commitment needs completion evidence',
    );
  });

  it('uses full SHA-256 content hashes, removes exact duplicates and preserves distinct people', () => {
    expect(hashText('threadline')).toMatch(/^[a-f0-9]{64}$/);
    const metadata = threads.find((item) => item.id === 'metadata-and-duplicates')!;
    expect(metadata.messages).toHaveLength(3);
    expect(metadata.participants.filter((p) => p.name === 'Jordan Lee')).toHaveLength(2);
    expect(metadata.messages[0].senderId).not.toBe(metadata.messages[1].senderId);
  });

  it('keeps the long source materially larger than the short fixtures', () => {
    const long = threads.find((item) => item.id === 'long-project-history')!;
    expect(
      long.messages.reduce((total, message) => total + message.body.length, 0),
    ).toBeGreaterThan(20_000);
  });
});
