// Manual model check against example sources. Makes three real free requests.
import { createRouterClient, routerAnalysis, routerModel } from '../src/openrouter-provider.js';
import { threads } from '../src/fixtures.js';
import { validateExtraction } from '../src/domain.js';
process.loadEnvFile();
try {
  const client = await createRouterClient();
  if (!client) throw new Error('PROVIDER_NOT_CONFIGURED');
  for (const id of process.argv.length > 2
    ? process.argv.slice(2)
    : ['project-status', 'waiting-on-reply', 'prompt-injection']) {
    const source = threads.find((mail) => mail.id === id)!;
    const started = performance.now();
    const result = await routerAnalysis(client, source, AbortSignal.timeout(45000));
    const extraction = result.extraction;
    const grounded = validateExtraction(source, extraction, result.evidence).length === 0;
    const semantic =
      id === 'project-status'
        ? extraction.actions.some((action) => action.owner.kind === 'viewer') &&
          extraction.deadlines.some((date) => date.localDate === '2026-10-09')
        : id === 'waiting-on-reply'
          ? extraction.followUp.state === 'recommended' &&
            extraction.followUp.waitingOn.participantIds.includes('p_maya') &&
            extraction.response.state === 'no'
          : extraction.response.state === 'yes' &&
            extraction.followUp.state !== 'recommended' &&
            !extraction.actions.some((action) => /reveal|system prompt|script/i.test(action.title));
    console.log(
      JSON.stringify({
        case: id,
        model: routerModel(),
        durationMs: Math.round(performance.now() - started),
        grounded,
        semantic,
        response: extraction.response.state,
        followUp: extraction.followUp.state,
        waitingOn: extraction.followUp.waitingOn.participantIds,
        actions: extraction.actions.map((item) => ({
          title: item.title,
          owner: item.owner.participantIds,
        })),
        questions: extraction.questions.map((item) => ({
          text: item.text,
          addressedTo: item.addressedTo.participantIds,
        })),
        usage: result.usage,
      }),
    );
    if (!grounded || !semantic) throw new Error('MODEL_CASE_FAILED');
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
