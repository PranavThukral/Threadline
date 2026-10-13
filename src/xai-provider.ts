import { createXai } from '@ai-sdk/xai';
import { streamText, APICallError, type LanguageModel } from 'ai';
import { hashText, type Thread } from './domain.js';
import { analysisMessages, replyMessages, groundedRouterBrief } from './openrouter-provider.js';

// Explicit model and standard rates verified against the xAI catalog/pricing.
// No aliases, automatic retries, model fallback, search or other billed tools.
export const XAI_MODEL = 'grok-4.3';
export const XAI_PROMPT_VERSION = 'threadline-xai.v1';
export const XAI_INPUT_RATE = 1.25;
export const XAI_OUTPUT_RATE = 2.5;
export const XAI_DAILY_BUDGET = 0.25;
export const XAI_TOTAL_BUDGET = 4;
export function createXaiModel(): LanguageModel | null {
  if (process.env.AI_PROVIDER !== 'xai' || !process.env.XAI_API_KEY?.trim()) return null;
  if ((process.env.XAI_MODEL?.trim() || XAI_MODEL) !== XAI_MODEL)
    throw new Error('UNSUPPORTED_XAI_MODEL');
  return createXai({ apiKey: process.env.XAI_API_KEY.trim() }).responses(XAI_MODEL);
}
type Messages = ReturnType<typeof analysisMessages>;
function bounded(messages: Messages) {
  const bytes = Buffer.byteLength(JSON.stringify(messages));
  if (bytes > 96 * 1024) throw new Error('PROMPT_TOO_LARGE');
  return bytes;
}
export function xaiReservation(thread: Thread, intent?: string, facts: string[] = []) {
  const messages = intent ? replyMessages(thread, intent, facts) : analysisMessages(thread);
  // A deliberately conservative byte-based input bound plus protocol overhead.
  const input = bounded(messages) + 1024;
  return Math.ceil(input * XAI_INPUT_RATE + (intent ? 2000 : 4000) * XAI_OUTPUT_RATE) / 1e6;
}
async function xaiText(
  model: LanguageModel,
  messages: Messages,
  maxOutputTokens: number,
  signal: AbortSignal,
  delta?: (text: string) => Promise<void>,
) {
  bounded(messages);
  const result = streamText({
    model,
    instructions: messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n'),
    messages: messages.filter((message) => message.role === 'user'),
    maxOutputTokens,
    maxRetries: 0,
    streamRetries: 0,
    abortSignal: signal,
    providerOptions: { xai: { reasoningEffort: 'none', store: false, serviceTier: 'default' } },
    // Never log SDK error objects: they may contain request headers.
    onError: () => {},
  });
  let text = '';
  for await (const part of result.stream) {
    signal.throwIfAborted();
    if (part.type === 'error') {
      if (APICallError.isInstance(part.error) && part.error.statusCode === 402)
        throw new Error('XAI_CREDIT_LIMIT');
      throw part.error;
    }
    if (part.type === 'text-delta') {
      text += part.text;
      if (text.length > 24000) throw new Error('PROVIDER_OUTPUT_TOO_LARGE');
      await delta?.(part.text);
    }
  }
  const [finish, usage] = await Promise.all([result.finishReason, result.usage]);
  if (finish !== 'stop' || !text.trim()) throw new Error('DRAFT_INCOMPLETE');
  const input = usage.inputTokens,
    output = usage.outputTokens;
  if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input! < 0 || output! < 0)
    throw new Error('INVALID_PROVIDER_USAGE');
  const cached = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const cacheRead = Number.isSafeInteger(cached) && cached >= 0 && cached <= input! ? cached : 0;
  const cost =
    Math.ceil((input! - cacheRead) * XAI_INPUT_RATE + cacheRead * 0.2 + output! * XAI_OUTPUT_RATE) /
    1e6;
  return { text, usage: { input_tokens: input!, output_tokens: output!, cost } };
}
export async function xaiAnalysis(model: LanguageModel, thread: Thread, signal: AbortSignal) {
  const result = await xaiText(model, analysisMessages(thread), 4000, signal);
  try {
    return {
      ...groundedRouterBrief(thread, result.text, {
        promptVersion: XAI_PROMPT_VERSION,
        modelConfigHash: hashText(`${XAI_MODEL}:none:standard`),
      }),
      usage: result.usage,
    };
  } catch (error) {
    if (error instanceof Error) Object.assign(error, { usage: result.usage });
    throw error;
  }
}
export function xaiReply(
  model: LanguageModel,
  thread: Thread,
  intent: string,
  facts: string[],
  signal: AbortSignal,
  delta: (text: string) => Promise<void>,
) {
  return xaiText(model, replyMessages(thread, intent, facts), 2000, signal, delta);
}
