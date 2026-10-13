import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  hashText,
  makeEvidence,
  viewer,
  canonicalizeText,
  owner,
  type Thread,
  type Extraction,
} from './domain.js';

export const newMailSchema = z.strictObject({
  subject: z.string().trim().min(1).max(160),
  senderName: z.string().trim().min(1).max(80),
  senderEmail: z.email().max(160),
  body: z.string().trim().min(1).max(10000),
});
export function createCustomMail(input: z.infer<typeof newMailSchema>): Thread {
  const id = `mail-${randomUUID()}`,
    sender = `person-${randomUUID()}`;
  const body = canonicalizeText(input.body);
  const participants = [viewer, { id: sender, name: input.senderName, email: input.senderEmail }];
  const messages = [
    {
      id: `message-${randomUUID()}`,
      threadId: id,
      senderId: sender,
      to: [viewer.id],
      cc: [],
      sentAt: new Date().toISOString(),
      timezone: 'America/New_York',
      body,
      order: 0,
    },
  ];
  return {
    id,
    subject: input.subject,
    preview: body.slice(0, 160),
    latestSender: input.senderName,
    category: 'Inbox',
    participants,
    messages,
    version: hashText(JSON.stringify({ id, subject: input.subject, participants, messages })),
  };
}
export function pendingBrief(thread: Thread) {
  const message = thread.messages[0];
  const evidence = [makeEvidence(message, message.body.slice(0, 300), 'e_source')];
  const extraction: Extraction = {
    id: `pending-${thread.version}`,
    threadId: thread.id,
    threadVersion: thread.version,
    source: 'recorded',
    coverage: {
      mode: 'full',
      included: thread.messages.map((item) => item.id),
      omitted: [],
      reason: null,
    },
    summary: [
      {
        text: 'Fetch an overview to see the requests and next steps in this mail.',
        basis: 'explicit',
        evidenceIds: ['e_source'],
      },
    ],
    actions: [],
    questions: [],
    commitments: [],
    decisions: [],
    deadlines: [],
    response: { state: 'unclear', reason: 'This mail has not been analyzed yet.', evidenceIds: [] },
    followUp: {
      state: 'unclear',
      reason: 'Fetch an overview first.',
      waitingOn: owner('unknown'),
      evidenceIds: [],
    },
    warnings: [],
    createdAt: new Date().toISOString(),
  };
  return { extraction, evidence };
}
