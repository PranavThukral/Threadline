import { z } from 'zod';

const id = z.string().min(1).max(160);
const text = z.string().min(1).max(3000);
const ids = z.array(id).max(80);
const cited = z.array(id).min(1).max(20);
export const ownerSchema = z.strictObject({
  kind: z.enum(['viewer', 'participant', 'group', 'unknown']),
  participantIds: ids,
  label: z.string().max(160).nullable(),
});
export const evidenceSchema = z.strictObject({
  id,
  messageId: id,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: text,
  location: z.enum(['authored', 'quoted']),
});
export const extractionSchema = z.strictObject({
  id,
  threadId: id,
  threadVersion: id,
  source: z.enum(['recorded', 'live']),
  coverage: z.strictObject({
    mode: z.enum(['full', 'partial', 'none']),
    included: ids,
    omitted: ids,
    reason: text.nullable(),
  }),
  summary: z
    .array(z.strictObject({ text, evidenceIds: cited, basis: z.enum(['explicit', 'inferred']) }))
    .min(1)
    .max(8),
  actions: z
    .array(
      z.strictObject({
        id,
        title: text,
        owner: ownerSchema,
        state: z.enum(['open', 'completed', 'cancelled', 'unclear']),
        evidenceIds: cited,
        completionEvidenceIds: ids,
        deadlineIds: ids,
        basis: z.enum(['explicit', 'inferred', 'unclear']),
      }),
    )
    .max(20),
  questions: z
    .array(
      z.strictObject({
        id,
        text,
        state: z.enum(['open', 'answered', 'unclear']),
        addressedTo: ownerSchema,
        evidenceIds: cited,
        answerEvidenceIds: ids,
      }),
    )
    .max(20),
  commitments: z
    .array(
      z.strictObject({
        id,
        text,
        owner: ownerSchema,
        evidenceIds: cited,
        state: z.enum(['pending', 'fulfilled', 'cancelled', 'unclear']),
        completionEvidenceIds: ids,
      }),
    )
    .max(20),
  decisions: z
    .array(
      z.strictObject({
        id,
        text,
        evidenceIds: cited,
        state: z.enum(['current', 'superseded', 'unclear']),
        supersedesIds: ids,
      }),
    )
    .max(20),
  deadlines: z
    .array(
      z.strictObject({
        id,
        phrase: text,
        basisOfDate: z.enum(['explicit_absolute', 'explicit_relative', 'inferred', 'ambiguous']),
        precision: z.enum(['date', 'datetime', 'range', 'unresolved']),
        localDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        instantUtc: z.iso.datetime().nullable(),
        candidateDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(8),
        evidenceIds: cited,
        ambiguityCode: z.string().max(160).nullable(),
      }),
    )
    .max(20),
  response: z.strictObject({
    state: z.enum(['yes', 'no', 'unclear']),
    reason: text,
    evidenceIds: ids,
  }),
  followUp: z.strictObject({
    state: z.enum(['recommended', 'not_needed', 'unclear']),
    reason: text,
    waitingOn: ownerSchema,
    evidenceIds: ids,
  }),
  warnings: z.array(text).max(20),
  createdAt: z.iso.datetime(),
  schemaVersion: id.optional(),
  promptVersion: id.optional(),
  normalizerVersion: id.optional(),
  modelConfigHash: id.optional(),
  validationStatus: z.enum(['valid', 'degraded']).optional(),
  contentHash: id.optional(),
});
// Model semantics and evidence are separate from server-owned provenance.
export const modelResultSchema = z.strictObject({
  extraction: extractionSchema.omit({
    id: true,
    threadId: true,
    threadVersion: true,
    source: true,
    createdAt: true,
    schemaVersion: true,
    promptVersion: true,
    normalizerVersion: true,
    modelConfigHash: true,
    validationStatus: true,
    contentHash: true,
  }),
  evidence: z.array(evidenceSchema).min(1).max(80),
});
export const analyzeRequestSchema = z.strictObject({
  threadVersion: id,
  mode: z.enum(['recorded', 'live']),
});
export const replyRequestSchema = analyzeRequestSchema.extend({
  intent: z.enum(['acknowledge', 'answer', 'clarify']),
  facts: z.array(z.string().trim().min(1).max(300)).max(5),
});
export const metricSchema = z.strictObject({
  id: z.uuid(),
  operation: z.enum([
    'ui.thread_switch',
    'reply.usable',
    'analysis.completed',
    'workflow.copy',
    'workflow.followup',
  ]),
  durationMs: z.number().min(0).max(120000),
  source: z.enum(['recorded', 'live', 'deterministic']),
  cacheLayer: z.enum(['recorded_bundle', 'none', 'sqlite']),
  success: z.boolean(),
  measuredAt: z.number().int().positive(),
  profileId: z.literal('local-interaction'),
});
