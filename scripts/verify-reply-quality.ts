// Manual free-model checks using example mails and notes. No credentials printed.
import { createRouterClient, routerReply, routerModel } from '../src/openrouter-provider.js';
import { threads } from '../src/fixtures.js';
import { createCustomMail } from '../src/custom-mail.js';
import { lintDraft } from '../src/workflow.js';
process.loadEnvFile();
const meeting = threads.find((mail) => mail.id === 'meeting-coordination')!;
const cases = [
  {
    name: 'screenshot-early-morning',
    mail: meeting,
    notes: ['I am busy mostly this week and will probably have to take it early in the morning'],
    check: (text: string) =>
      /morning/i.test(text) &&
      /probably|likely|might|maybe|could|would/i.test(text) &&
      text.includes('?'),
  },
  {
    name: 'confirmed-wednesday',
    mail: meeting,
    notes: ['Wednesday at 11am ET works for me.'],
    check: (text: string) =>
      /Wednesday/i.test(text) &&
      /11\s*(?:am|a\.m\.)/i.test(text) &&
      !/I prefer Tuesday|Tuesday.*works for me/i.test(text),
  },
  {
    name: 'tentative-recruiter',
    mail: threads[0],
    notes: ['Early mornings might work next week, but I am not ready to confirm an exact time.'],
    check: (text: string) =>
      /morning/i.test(text) &&
      /might|may|probably|could|would|likely/i.test(text) &&
      !/I (?:am available|can meet|will attend)/i.test(text),
  },
  {
    name: 'video-preference',
    mail: createCustomMail({
      senderName: 'Casey Example',
      senderEmail: 'casey@example.com',
      subject: 'Choose your interview format',
      body: 'Could you confirm whether you prefer video or phone? We can offer either format.',
    }),
    notes: ['I prefer video.'],
    check: (text: string) =>
      /video/i.test(text) &&
      !/prefer phone|video.*available\?/i.test(text) &&
      !/Do you have.*video.*\?/i.test(text),
  },
];
try {
  const client = await createRouterClient();
  if (!client) throw new Error('PROVIDER_NOT_CONFIGURED');
  for (const item of cases.filter(
    (item) => process.argv.length < 3 || process.argv.slice(2).includes(item.name),
  )) {
    const started = performance.now();
    const result = await routerReply(
      client,
      item.mail,
      'answer',
      item.notes,
      AbortSignal.timeout(45000),
      async () => {},
    );
    const lintFlags = lintDraft(result.text, item.notes);
    const passed = item.check(result.text) && lintFlags.length === 0;
    console.log(
      JSON.stringify({
        case: item.name,
        model: routerModel(),
        passed,
        durationMs: Math.round(performance.now() - started),
        lintFlags,
        exampleReply: result.text,
        usage: result.usage,
      }),
    );
    if (!passed) throw new Error('REPLY_QUALITY_FAILED');
  }
} catch (error) {
  const value = error as { message?: string; name?: string; statusCode?: number };
  console.error(
    JSON.stringify({
      status: 'failed',
      code:
        value.message && /^[A-Z_0-9]{1,64}$/.test(value.message)
          ? value.message
          : 'PROVIDER_FAILED',
      type: value.name,
      httpStatus: value.statusCode,
    }),
  );
  process.exitCode = 1;
}
