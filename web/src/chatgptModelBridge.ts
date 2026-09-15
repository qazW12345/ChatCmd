import { tr } from './i18n';

const REQUEST_TYPE = 'chatcmd-chatgpt-extension-request';
const RESPONSE_TYPE = 'chatcmd-chatgpt-extension-response';

export type ChatGptModelOptions = {
  models: string[];
  reasoningOptions: string[];
  currentModel?: string;
  currentReasoning?: string;
};

type ModelOptionsResponse = {
  type?: string;
  nonce: string;
  ok: boolean;
  error?: string;
  models?: unknown;
  reasoningOptions?: unknown;
  currentModel?: unknown;
  currentReasoning?: unknown;
};

type ModelBridgeCommand =
  | { action: 'model-options'; nonce: string; newConversationUrl?: string }
  | { action: 'reasoning-select'; nonce: string; reasoning: string; newConversationUrl?: string };

export async function discoverChatGptModelOptions(newConversationUrl?: string): Promise<ChatGptModelOptions> {
  const response = await bridge({ action: 'model-options', nonce: crypto.randomUUID(), newConversationUrl }, 12_000);
  return {
    models: cleanOptions(response.models),
    reasoningOptions: cleanOptions(response.reasoningOptions),
    currentModel: cleanOption(response.currentModel) || undefined,
    currentReasoning: cleanOption(response.currentReasoning) || undefined,
  };
}

export async function applyChatGptReasoningChoice(reasoning: string, newConversationUrl?: string) {
  const cleaned = reasoning.trim();
  if (!cleaned || cleaned.toLowerCase() === 'auto') return;
  await bridge({ action: 'reasoning-select', nonce: crypto.randomUUID(), reasoning: cleaned, newConversationUrl }, 12_000);
}

function bridge(command: ModelBridgeCommand, timeoutMs: number) {
  return new Promise<ModelOptionsResponse>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error(tr('ChatCMD ChatGPT Bridge did not respond in time.'))), timeoutMs);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || !isResponse(event.data) || event.data.nonce !== command.nonce) return;
      finish(event.data.ok ? undefined : new Error(event.data.error || tr('The extension could not complete the request.')), event.data);
    };
    const finish = (error?: Error, response?: ModelOptionsResponse) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (error) reject(error); else resolve(response ?? { nonce: command.nonce, ok: true });
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: REQUEST_TYPE, ...command }, window.location.origin);
  });
}

function isResponse(value: unknown): value is ModelOptionsResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.type === RESPONSE_TYPE && typeof record.nonce === 'string' && typeof record.ok === 'boolean';
}

function cleanOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const cleaned = cleanOption(item);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function cleanOption(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
