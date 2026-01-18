import { callGeminiText } from './gemini';
import { callCerebrasText, CerebrasAgent } from './cerebras';

export type LLMProvider = 'gemini' | 'cerebras';
export type LLMAgent = CerebrasAgent;

export interface LLMOptions {
  provider?: LLMProvider;
  agent?: LLMAgent;
}

function getProviderForAgent(agent?: LLMAgent): LLMProvider | undefined {
  if (agent === 'chat' && process.env.LLM_PROVIDER_CHAT) {
    return process.env.LLM_PROVIDER_CHAT as LLMProvider;
  }
  if (agent === 'behavior' && process.env.LLM_PROVIDER_BEHAVIOR) {
    return process.env.LLM_PROVIDER_BEHAVIOR as LLMProvider;
  }
  if (process.env.LLM_PROVIDER) {
    return process.env.LLM_PROVIDER as LLMProvider;
  }
  return undefined;
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function hasCerebrasKey(): boolean {
  return Boolean(
    process.env.CEREBRAS_API_KEY ||
      process.env.CEREBRAS_API_KEY_1 ||
      process.env.CEREBRAS_API_KEY_2
  );
}

function getDefaultProvider(): LLMProvider {
  if (hasGeminiKey()) return 'gemini';
  if (hasCerebrasKey()) return 'cerebras';
  return 'gemini'; // Will fail with missing key error
}

function getFallbackProvider(primary: LLMProvider): LLMProvider | null {
  if (primary === 'gemini' && hasCerebrasKey()) return 'cerebras';
  if (primary === 'cerebras' && hasGeminiKey()) return 'gemini';
  return null;
}

async function callProvider(
  provider: LLMProvider,
  prompt: string,
  agent?: LLMAgent
): Promise<string | null> {
  if (provider === 'gemini') {
    return callGeminiText(prompt);
  }
  if (provider === 'cerebras') {
    return callCerebrasText(prompt, agent);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

export async function callLLMText(
  prompt: string,
  options: LLMOptions = {}
): Promise<string | null> {
  const { agent } = options;

  // Determine primary provider
  const configuredProvider = options.provider || getProviderForAgent(agent);
  const primaryProvider = configuredProvider || getDefaultProvider();

  console.log(`[LLMService] Request for agent: ${agent || 'default'}`);
  console.log(`[LLMService] Configured provider: ${configuredProvider}, using: ${primaryProvider}`);

  try {
    const result = await callProvider(primaryProvider, prompt, agent);

    if (result) {
      return result;
    }

    // If explicitly configured, do NOT fallback
    if (configuredProvider) {
      return null;
    }

    // If primary returned null/empty, try fallback
    const fallbackProvider = getFallbackProvider(primaryProvider);
    if (fallbackProvider) {
      console.log(`[LLMService] Primary provider (${primaryProvider}) returned empty, trying fallback: ${fallbackProvider}`);
      return callProvider(fallbackProvider, prompt, agent);
    }

    return null;
  } catch (error) {
    console.error(`[LLMService] Primary provider (${primaryProvider}) failed:`, error);

    // If explicitly configured, do NOT fallback
    if (configuredProvider) {
      throw error;
    }

    // Try fallback on error
    const fallbackProvider = getFallbackProvider(primaryProvider);
    if (fallbackProvider) {
      console.log(`[LLMService] Trying fallback provider: ${fallbackProvider}`);
      try {
        return await callProvider(fallbackProvider, prompt, agent);
      } catch (fallbackError) {
        console.error(`[LLMService] Fallback provider (${fallbackProvider}) also failed:`, fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}

export function hasAnyLLMKey(): boolean {
  return hasGeminiKey() || hasCerebrasKey();
}

export function parseJsonFromText<T>(text: string | null): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
      ? objectStart
      : Math.min(objectStart, arrayStart);
  if (start === -1) return null;
  const objectEnd = trimmed.lastIndexOf('}');
  const arrayEnd = trimmed.lastIndexOf(']');
  const end = Math.max(objectEnd, arrayEnd);
  if (end === -1 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
