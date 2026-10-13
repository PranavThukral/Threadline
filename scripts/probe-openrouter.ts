import { createRouterClient, routerAnalysis, routerModel } from '../src/openrouter-provider.js';
import { threads } from '../src/fixtures.js';
try {
  process.loadEnvFile();
  const client = await createRouterClient();
  if (!client) throw new Error('PROVIDER_NOT_CONFIGURED');
  const started = performance.now();
  const result = await routerAnalysis(client, threads[0], AbortSignal.timeout(90000));
  console.log(
    JSON.stringify({
      model: routerModel(),
      status: 'validated',
      durationMs: Math.round(performance.now() - started),
      actions: result.extraction.actions.length,
      questions: result.extraction.questions.length,
      evidence: result.evidence.length,
      usage: result.usage,
    }),
  );
} catch (error) {
  const value = error as {
    name?: string;
    statusCode?: number;
    message?: string;
    finishReason?: string;
    outputCharacters?: number;
    tokenUsage?: { input: number; output: number; reasoning: number };
  };
  // Provider errors can embed request details; never dump raw SDK errors.
  console.log(
    JSON.stringify({
      status: 'failed',
      code:
        value.message && /^[A-Z_0-9]{1,64}$/.test(value.message)
          ? value.message
          : 'PROVIDER_FAILED',
      type: value.name,
      httpStatus: value.statusCode,
      finishReason: value.finishReason,
      outputCharacters: value.outputCharacters,
      tokenUsage: value.tokenUsage,
    }),
  );
  process.exitCode = 1;
}
