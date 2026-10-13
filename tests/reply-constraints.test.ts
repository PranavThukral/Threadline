import { describe, expect, it } from 'vitest';
import { lintDraft, replyInputKey } from '../src/workflow.js';

describe('Current reply constraints', () => {
  const notes = [
    'I am busy mostly this week and will probably have to take it early in the morning',
  ];
  it('blocks the screenshot’s afternoon selection and permits a tentative request for morning options', () => {
    expect(lintDraft('Hi Maya,\n\nI prefer Tuesday at 2pm ET.\n\nBest,\nAlex', notes)).toContain(
      'The selected time conflicts with your morning preference.',
    );
    expect(
      lintDraft(
        'Hi Maya,\n\nI’m busy much of this week, so an early morning would probably work better. Do you have an early-morning option?\n\nBest,\nAlex',
        notes,
      ),
    ).toEqual([]);
  });
  it('does not let tentative notes become a firm confirmation', () => {
    expect(lintDraft('I can meet in the morning.', notes)).toContain(
      'Keep the uncertainty in your notes; this draft turns tentative availability into a firm confirmation.',
    );
  });
  it('blocks invented blanket flexibility and definite refusals from tentative notes', () => {
    expect(
      lintDraft('I’m happy to accommodate whatever fits your schedule best.', notes),
    ).toContain('This draft offers broader availability than your notes provide.');
    expect(lintDraft("I can't make either of those times.", notes)).toContain(
      'Do not turn a tentative preference into a definite rejection of the proposed times.',
    );
  });
  it('allows a supported paraphrase of explicitly confirmed availability', () => {
    expect(
      lintDraft('3am works for me.', ['I work nights; early morning at 3am works for me.']),
    ).toEqual([]);
    expect(
      lintDraft('I’m available on Wednesday at 11am ET.', ['Wednesday at 11am ET works for me.']),
    ).toEqual([]);
  });
  it('allows explicitly confirmed times and rejects a different day or a negated slot', () => {
    expect(
      lintDraft('Wednesday at 11am ET works for me.', ['Wednesday at 11am ET works for me.']),
    ).toEqual([]);
    expect(
      lintDraft('Tuesday at 11am ET works for me.', ['Wednesday at 11am ET works for me.']),
    ).toContain('The selected day conflicts with your current notes.');
    expect(
      lintDraft('I prefer Tuesday at 2pm.', [
        "I can't do Tuesday at 2pm. Wednesday at 11am works for me.",
      ]),
    ).toContain(
      'This draft selects a specific time that your current notes do not confirm. Update the draft or supply that availability.',
    );
  });
  it('invalidates only meaningful input changes and excludes unused notes for acknowledgment', () => {
    expect(replyInputKey('answer', '  Early mornings.\n\n')).toBe(
      replyInputKey('answer', 'Early mornings.'),
    );
    expect(replyInputKey('answer', 'Tuesday 2pm')).not.toBe(
      replyInputKey('answer', 'Early mornings.'),
    );
    expect(replyInputKey('answer', 'Early mornings.')).not.toBe(
      replyInputKey('clarify', 'Early mornings.'),
    );
    expect(replyInputKey('acknowledge', 'Unused notes')).toBe(
      replyInputKey('acknowledge', 'Other notes'),
    );
  });
});
