import type { Thread } from './domain.js';
import { viewer } from './viewer.js';

export const SCENARIO_BASE = '2026-10-05T14:00:00.000Z';
export function scenarioInstant(offset: number): string {
  const date = new Date(Date.UTC(2026, 9, 5 + offset)).toISOString().slice(0, 10);
  return new Date(Date.parse(reminderAtNine(date)) + 3600000).toISOString();
}
export function deadlineOverdue(
  deadline: { precision: string; localDate: string | null; instantUtc: string | null },
  now: string,
  sourceTimezone: string | null,
): boolean | null {
  if (deadline.precision === 'datetime' && deadline.instantUtc)
    return Date.parse(now) > Date.parse(deadline.instantUtc);
  if (deadline.precision !== 'date' || !deadline.localDate || !sourceTimezone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: sourceTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(now));
    const date = ['year', 'month', 'day']
      .map((type) => parts.find((part) => part.type === type)?.value)
      .join('-');
    return date > deadline.localDate;
  } catch {
    return null;
  }
}
export function recipientFor(thread: Thread): string[] {
  const known = new Set(
    thread.participants
      .filter((p) => p.email && !p.isViewer && p.id !== viewer.id)
      .map((p) => p.id),
  );
  const latest = thread.messages.at(-1);
  if (!latest || !latest.senderId) return [];
  if (latest.senderId !== viewer.id) return known.has(latest.senderId) ? [latest.senderId] : [];
  return [...new Set(latest.to.filter((id) => known.has(id)))];
}
export function formatDate(value: string | null, timezone = 'America/New_York') {
  if (!value) return 'Date unresolved';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: dateOnly ? 'UTC' : timezone,
    }).format(new Date(dateOnly ? `${value}T12:00:00Z` : value));
  } catch {
    return 'Date unresolved';
  }
}
export function businessFollowUp(offset: number): string {
  // Calendar arithmetic in UTC preserves the scenario's New York wall date,
  // regardless of the host timezone. Resolve 09:00 NY using Intl, including DST.
  return businessFollowUpFrom(scenarioInstant(offset));
}
export function businessFollowUpFrom(now: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const localDate = ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
  const day = new Date(`${localDate}T00:00:00Z`);
  for (let count = 0; count < 2;) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (![0, 6].includes(day.getUTCDay())) count++;
  }
  return reminderAtNine(day.toISOString().slice(0, 10));
}
export function reminderAtNine(localDate: string): string {
  const day = new Date(`${localDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== localDate
  )
    throw new Error('Choose a valid calendar date.');
  const desired = day.getTime() + 9 * 3600000;
  let result = desired;
  for (let pass = 0; pass < 3; pass++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(result));
    const get = (name: string) => Number(parts.find((p) => p.type === name)?.value);
    const wall = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    result += desired - wall;
  }
  return new Date(result).toISOString();
}
export function formatTimestamp(value: string | null) {
  if (!value) return 'Date unknown';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    }).format(new Date(value));
  } catch {
    return 'Date unknown';
  }
}
export function replyInputKey(intent: string, notes: string) {
  return JSON.stringify([
    intent,
    intent === 'answer'
      ? notes
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : [],
  ]);
}
function clockTimes(text: string) {
  return [...text.toLowerCase().matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/g)].map(
    (match) => {
      const hour = Number(match[1]);
      return (hour % 12) * 60 + Number(match[2] ?? 0) + (match[3].startsWith('p') ? 720 : 0);
    },
  );
}
export function lintDraft(text: string, facts: string[] = []) {
  const flags: string[] = [];
  if (!text.trim()) flags.push('The draft is empty.');
  if (
    /ignore previous|system prompt|<script|javascript:|\[[^\]]*(?:insert|todo|placeholder)[^\]]*\]/i.test(
      text,
    )
  )
    flags.push('Remove instruction-like content or unresolved placeholders.');
  const unconfirmed = facts.reduce(
    (body, fact) => (fact.trim() ? body.replaceAll(fact, '') : body),
    text,
  );
  const notes = facts.join(' ');
  const noteClauses = notes.split(/(?:[\n;]|(?<=[.!?])\s+|\bbut\b|\bhowever\b)/i);
  const negative =
    /\b(?:cannot|can't|won't|doesn't|not available|unavailable|not work|don't|do not)\b/i;
  const confirmedClauses = noteClauses.filter((clause) => !negative.test(clause));
  const confirmedTimes = confirmedClauses.flatMap(clockTimes);
  const choices = text
    .split(/(?:\n|(?<=[.!?])\s+)/)
    .filter(
      (sentence) =>
        /\b(?:I (?:prefer|choose|confirm|(?:can|could) (?:do|meet|attend)|am available|will (?:join|attend))|I[’'](?:m available|d (?:prefer|like))|works? (?:best )?for me|my (?:preferred time|availability)|(?:sounds?|looks?) (?:good|great)|is (?:perfect|great)|let[’']s (?:meet|do))\b/i.test(
          sentence,
        ) &&
        !/\b(?:cannot|can't|won't|doesn't|not available|not work|don't|do not)\b/i.test(sentence),
    );
  const selectedTimes = choices.flatMap(clockTimes);
  if (selectedTimes.some((time) => !confirmedTimes.includes(time)))
    flags.push(
      'This draft selects a specific time that your current notes do not confirm. Update the draft or supply that availability.',
    );
  const earlyMorning = /\bearly(?:[- ]| in (?:the )?)mornings?\b/i.test(notes);
  const morning = /\bmornings?\b/i.test(notes);
  if (
    selectedTimes.some(
      (time) =>
        !confirmedTimes.includes(time) &&
        ((earlyMorning && (time < 300 || time >= 600)) || (morning && (time < 300 || time >= 720))),
    )
  )
    flags.push('The selected time conflicts with your morning preference.');
  const days = (value: string) =>
    (value.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi) ?? []).map(
      (day) => day.toLowerCase(),
    );
  const confirmedDays = new Set(confirmedClauses.flatMap(days));
  if (confirmedDays.size && choices.flatMap(days).some((day) => !confirmedDays.has(day)))
    flags.push('The selected day conflicts with your current notes.');
  if (
    /\b(?:probably|maybe|might|possibly|tentative|likely)\b/i.test(notes) &&
    choices.some(
      (sentence) =>
        /\b(?:I (?:am available|can (?:do|meet|attend)|will (?:join|attend))|I[’']m available|works? for me)\b/i.test(
          sentence,
        ) && !/\b(?:probably|maybe|might|possibly|tentative|likely|if)\b/i.test(sentence),
    )
  )
    flags.push(
      'Keep the uncertainty in your notes; this draft turns tentative availability into a firm confirmation.',
    );
  const availabilityClaims = unconfirmed
    .split(/(?:\n|(?<=[.!?])\s+)/)
    .filter((sentence) => /\b(?:I(?:’|'| a)m available|I can (?:do|meet))\b/i.test(sentence));
  const unsupportedAvailability = availabilityClaims.some((sentence) => {
    const times = clockTimes(sentence),
      selectedDays = days(sentence);
    return (
      !times.length ||
      !confirmedClauses.some(
        (clause) =>
          /\b(?:available|free|can (?:do|meet|attend)|works? (?:well )?for me|confirmed)\b/i.test(
            clause,
          ) &&
          times.every((time) => clockTimes(clause).includes(time)) &&
          selectedDays.every((day) => days(clause).includes(day)),
      )
    );
  });
  if (
    unsupportedAvailability ||
    /\b(?:I(?:’|'| wi)ll (?:send|deliver|complete|finish|review|share|schedule|confirm)|I will (?:send|deliver|complete|finish|review|share|schedule|confirm))\b/i.test(
      unconfirmed,
    )
  )
    flags.push('Confirm availability or commitments in your facts before reviewing.');
  if (
    /\b(?:probably|maybe|might|possibly|tentative|likely)\b/i.test(notes) &&
    /\b(?:I (?:can[’']t|cannot) (?:make|do|meet|attend) (?:either|any|those|the proposed)|neither (?:time|option)|both.*(?:can[’']t|cannot))\b/i.test(
      unconfirmed,
    ) &&
    !negative.test(notes)
  )
    flags.push(
      'Do not turn a tentative preference into a definite rejection of the proposed times.',
    );
  const unbounded = /\b(?:anytime|any (?:time|day)|whenever|whatever (?:fits|works|suits|time))\b/i;
  if (unbounded.test(text) && !unbounded.test(notes))
    flags.push('This draft offers broader availability than your notes provide.');
  return flags;
}
export function recordedDraft(thread: Thread, intent: string) {
  const name =
    thread.participants.find((p) => p.id === recipientFor(thread)[0])?.name.split(' ')[0] ??
    'there';
  const questions: Record<string, string> = {
    'recruiter-coordination':
      'Could you clarify whether the accommodations question is required before scheduling?',
    'meeting-coordination': 'Could you confirm whether Tuesday is still available?',
    'project-status': 'Could you confirm where the test fixture is located?',
    'customer-escalation': 'Which diagnostic details would be most useful?',
    'ambiguous-deadline': 'Could you confirm the calendar date for Friday?',
    'long-project-history': 'Could you confirm the calendar date for the checklist review?',
    'prompt-injection':
      'What constraints should we check before deciding whether the experiment can run?',
  };
  return `Hi ${name},\n\n${intent === 'clarify' ? (questions[thread.id] ?? 'Could you clarify the remaining request in the thread?') : 'Thank you for the update. I’ve received your message.'}\n\nBest,\nAlex`;
}
