import { createHash } from 'node:crypto';
import { extractionSchema, evidenceSchema } from './contracts.js';

export type SourceMode = 'recorded' | 'live';
export type CoverageMode = 'full' | 'partial' | 'none';

export type Participant = {
  id: string;
  name: string;
  email: string | null;
  isViewer?: boolean;
};

export type Message = {
  id: string;
  threadId: string;
  senderId: string | null;
  to: string[];
  cc: string[];
  sentAt: string | null;
  timezone: string | null;
  body: string;
  order: number;
};

export type Thread = {
  id: string;
  subject: string;
  preview: string;
  latestSender: string;
  category: string;
  participants: Participant[];
  messages: Message[];
  version: string;
};

export type Evidence = {
  id: string;
  messageId: string;
  start: number;
  end: number;
  quote: string;
  location: 'authored' | 'quoted';
};

export type Owner = {
  kind: 'viewer' | 'participant' | 'group' | 'unknown';
  participantIds: string[];
  label: string | null;
};

export type ActionItem = {
  id: string;
  title: string;
  owner: Owner;
  state: 'open' | 'completed' | 'cancelled' | 'unclear';
  evidenceIds: string[];
  deadlineIds: string[];
  completionEvidenceIds?: string[];
  basis: 'explicit' | 'inferred' | 'unclear';
};

export type Question = {
  id: string;
  text: string;
  state: 'open' | 'answered' | 'unclear';
  addressedTo: Owner;
  evidenceIds: string[];
  answerEvidenceIds?: string[];
};

export type Deadline = {
  id: string;
  phrase: string;
  basisOfDate: 'explicit_absolute' | 'explicit_relative' | 'inferred' | 'ambiguous';
  precision: 'date' | 'datetime' | 'range' | 'unresolved';
  localDate: string | null;
  instantUtc: string | null;
  candidateDates: string[];
  evidenceIds: string[];
  ambiguityCode: string | null;
};

export type Extraction = {
  id: string;
  threadId: string;
  threadVersion: string;
  source: SourceMode;
  coverage: { mode: CoverageMode; included: string[]; omitted: string[]; reason: string | null };
  summary: { text: string; evidenceIds: string[]; basis: 'explicit' | 'inferred' }[];
  actions: ActionItem[];
  questions: Question[];
  commitments: {
    id: string;
    text: string;
    owner: Owner;
    evidenceIds: string[];
    state: string;
    completionEvidenceIds?: string[];
  }[];
  decisions: {
    id: string;
    text: string;
    evidenceIds: string[];
    state: string;
    supersedesIds?: string[];
  }[];
  deadlines: Deadline[];
  response: { state: 'yes' | 'no' | 'unclear'; reason: string; evidenceIds: string[] };
  followUp: {
    state: 'recommended' | 'not_needed' | 'unclear';
    reason: string;
    waitingOn: Owner;
    evidenceIds: string[];
  };
  warnings: string[];
  createdAt: string;
  schemaVersion?: string;
  promptVersion?: string;
  normalizerVersion?: string;
  modelConfigHash?: string;
  validationStatus?: 'valid' | 'degraded';
  contentHash?: string;
};

export type ApiError = {
  error: { code: string; message: string; retryable: boolean };
  requestId: string;
};

export const viewer: Participant = {
  id: 'p_alex',
  name: 'Alex Rivera',
  email: 'alex@threadline.example',
  isViewer: true,
};

export const hashText = (value: string) => {
  return createHash('sha256').update(value, 'utf8').digest('hex');
};

export const makeEvidence = (message: Message, quote: string, id: string): Evidence => {
  const start = message.body.indexOf(quote);
  if (start < 0) throw new Error(`Quote not found in ${message.id}: ${quote}`);
  return {
    id,
    messageId: message.id,
    start,
    end: start + quote.length,
    quote,
    location: 'authored',
  };
};

export const canonicalizeText = (value: string) => value.normalize('NFC').replace(/\r\n?/g, '\n');

export const validateEvidence = (thread: Thread, evidence: Evidence[]) => {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    if (seen.has(item.id)) errors.push(`duplicate evidence id ${item.id}`);
    seen.add(item.id);
    const message = thread.messages.find((candidate) => candidate.id === item.messageId);
    if (!message) {
      errors.push(`evidence ${item.id} references an unknown message`);
      continue;
    }
    const source = canonicalizeText(message.body);
    if (item.start < 0 || item.end < item.start || item.end > source.length) {
      errors.push(`evidence ${item.id} has an invalid span`);
      continue;
    }
    if (source.slice(item.start, item.end) !== item.quote) {
      errors.push(`evidence ${item.id} quote does not match its span`);
    }
  }
  return errors;
};

export const validateExtraction = (
  thread: Thread,
  extraction: Extraction,
  evidence: Evidence[],
) => {
  const shape = extractionSchema.safeParse(extraction);
  if (!shape.success)
    return shape.error.issues.map((item) => `Invalid ${item.path.join('.')}: ${item.message}`);
  for (const item of evidence) {
    if (!evidenceSchema.safeParse(item).success) return ['Invalid evidence structure'];
  }
  const errors = validateEvidence(thread, evidence);
  if (extraction.threadId !== thread.id) errors.push('extraction thread mismatch');
  if (extraction.threadVersion !== thread.version) errors.push('extraction version mismatch');
  if (!['recorded', 'live'].includes(extraction.source)) errors.push('invalid extraction source');
  if (!['full', 'partial', 'none'].includes(extraction.coverage.mode))
    errors.push('invalid coverage mode');
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const messageIds = new Set(thread.messages.map((item) => item.id));
  const coverage = [...extraction.coverage.included, ...extraction.coverage.omitted];
  if (
    new Set(coverage).size !== coverage.length ||
    coverage.length !== messageIds.size ||
    coverage.some((id) => !messageIds.has(id))
  )
    errors.push('coverage must partition all source messages exactly once');
  if (extraction.coverage.mode === 'full' && extraction.coverage.omitted.length)
    errors.push('full coverage cannot omit messages');
  if (
    extraction.coverage.mode === 'partial' &&
    (!extraction.coverage.reason ||
      !extraction.coverage.omitted.length ||
      !extraction.coverage.included.length)
  )
    errors.push('partial coverage requires included, omitted, and a reason');
  if (extraction.coverage.mode === 'none' && extraction.coverage.included.length)
    errors.push('none coverage cannot include messages');
  const included = new Set(extraction.coverage.included);
  if (evidence.some((item) => !included.has(item.messageId)))
    errors.push('evidence references omitted source');
  const participants = new Set(thread.participants.map((item) => item.id));
  const checkOwner = (value: Owner) => {
    if (value.participantIds.some((id) => !participants.has(id)))
      errors.push('owner references unknown participant');
    if (
      value.kind === 'viewer' &&
      (value.participantIds.length !== 1 || value.participantIds[0] !== viewer.id)
    )
      errors.push('viewer owner mismatch');
    if (
      value.kind === 'participant' &&
      (value.participantIds.length !== 1 || value.participantIds[0] === viewer.id)
    )
      errors.push('participant owner mismatch');
    if (value.kind === 'unknown' && value.participantIds.length)
      errors.push('unknown owner must not identify participants');
  };
  const claimIds = [
    ...extraction.actions,
    ...extraction.questions,
    ...extraction.commitments,
    ...extraction.decisions,
    ...extraction.deadlines,
  ].map((item) => item.id);
  if (new Set(claimIds).size !== claimIds.length) errors.push('duplicate claim id');
  const deadlineIds = new Set(extraction.deadlines.map((item) => item.id));
  extraction.actions.forEach((item) => {
    checkOwner(item.owner);
    if (item.deadlineIds.some((id) => !deadlineIds.has(id)))
      errors.push('action references missing deadline');
  });
  extraction.questions.forEach((item) => checkOwner(item.addressedTo));
  extraction.commitments.forEach((item) => checkOwner(item.owner));
  checkOwner(extraction.followUp.waitingOn);
  extraction.deadlines.forEach((item) => {
    if (item.precision === 'date' && (!item.localDate || item.instantUtc))
      errors.push('date-only deadline requires a date and no instant');
    if (item.precision === 'datetime' && !item.instantUtc)
      errors.push('datetime deadline requires instant');
    if (
      item.precision === 'unresolved' &&
      (item.localDate || item.instantUtc || !item.ambiguityCode)
    )
      errors.push('unresolved deadline cannot claim a resolved date');
    for (const date of [item.localDate, ...item.candidateDates].filter(Boolean) as string[]) {
      const parsedDate = new Date(`${date}T12:00:00Z`);
      if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date)
        errors.push('invalid calendar date');
    }
  });
  const checkIds = (label: string, ids: string[]) => {
    for (const id of ids)
      if (!evidenceIds.has(id)) errors.push(`${label} references missing evidence ${id}`);
  };
  extraction.summary.forEach((item) => checkIds('summary', item.evidenceIds));
  extraction.actions.forEach((item) => checkIds('action', item.evidenceIds));
  extraction.questions.forEach((item) => checkIds('question', item.evidenceIds));
  extraction.commitments.forEach((item) => checkIds('commitment', item.evidenceIds));
  extraction.decisions.forEach((item) => checkIds('decision', item.evidenceIds));
  extraction.deadlines.forEach((item) => checkIds('deadline', item.evidenceIds));
  extraction.actions.forEach((item) => {
    checkIds('action completion', item.completionEvidenceIds ?? []);
    if (item.state === 'completed' && !item.completionEvidenceIds?.length)
      errors.push('completed action needs completion evidence');
  });
  extraction.questions.forEach((item) => {
    checkIds('answer', item.answerEvidenceIds ?? []);
    if (item.state === 'answered' && !item.answerEvidenceIds?.length)
      errors.push('answered question needs answer evidence');
  });
  extraction.commitments.forEach((item) => {
    checkIds('commitment completion', item.completionEvidenceIds ?? []);
    if (item.state === 'fulfilled' && !item.completionEvidenceIds?.length)
      errors.push('fulfilled commitment needs completion evidence');
  });
  const decisions = new Map(extraction.decisions.map((item) => [item.id, item]));
  extraction.decisions.forEach((item) => {
    for (const id of item.supersedesIds ?? [])
      if (id === item.id || decisions.get(id)?.state !== 'superseded')
        errors.push('decision supersedes an invalid prior decision');
  });
  checkIds('response', extraction.response.evidenceIds);
  checkIds('follow-up', extraction.followUp.evidenceIds);
  return [...new Set(errors)];
};

export const owner = (
  kind: Owner['kind'],
  participantIds: string[] = [],
  label: string | null = null,
): Owner => ({
  kind,
  participantIds,
  label,
});
