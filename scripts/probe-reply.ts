// Manual free-model check using example content only; no credentials printed.
import { createRouterClient, routerReply, routerModel } from '../src/openrouter-provider.js';
import { createCustomMail } from '../src/custom-mail.js';
import { lintDraft } from '../src/workflow.js';
process.loadEnvFile();
try {
  const client = await createRouterClient();
  if (!client) throw new Error('PROVIDER_NOT_CONFIGURED');
  const mail = createCustomMail({
    senderName: 'Casey Example',
    senderEmail: 'casey@example.com',
    subject: 'Choose your interview format',
    body: 'Hi Alex,\nCould you confirm whether you prefer video or phone for our conversation? Our team can offer either format.\nThanks,\nCasey',
  });
  const facts = ['I prefer video.'];
  const started = performance.now();
  const result = await routerReply(
    client,
    mail,
    'answer',
    facts,
    AbortSignal.timeout(45000),
    async () => {},
  );
  console.log(
    JSON.stringify({
      model: routerModel(),
      durationMs: Math.round(performance.now() - started),
      factsUsed: /\bvideo\b/i.test(result.text),
      lintFlags: lintDraft(result.text, facts),
      exampleReply: result.text,
      usage: result.usage,
    }),
  );
} catch (error) {
  const value = error as { name?: string; message?: string; statusCode?: number };
  console.log(
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
