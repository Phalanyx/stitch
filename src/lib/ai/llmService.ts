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

  console.log(`[LLMService] Using provider: ${primaryProvider}, agent: ${agent || 'default'}`);

  try {
    const result = await callProvider(primaryProvider, prompt, agent);

    if (result) {
      return result;
    }

    // If primary returned null/empty, try fallback
    const fallbackProvider = getFallbackProvider(primaryProvider);
    if (fallbackProvider) {
      console.log(`[LLMService] Primary provider returned empty, trying fallback: ${fallbackProvider}`);
      return callProvider(fallbackProvider, prompt, agent);
    }

    return null;
  } catch (error) {
    console.error(`[LLMService] Primary provider (${primaryProvider}) failed:`, error);

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
