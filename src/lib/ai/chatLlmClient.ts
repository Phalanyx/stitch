export type LLMProvider = 'gemini' | 'cerebras';
export type LLMAgent = 'chat' | 'behavior';

export interface ChatLlmOptions {
  provider?: LLMProvider;
  agent?: LLMAgent;
}

export async function callChatLlm(
  prompt: string,
  options: ChatLlmOptions = {}
): Promise<string> {
  const response = await fetch('/api/chat-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      provider: options.provider,
      agent: options.agent,
    }),
  });
  const data = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Chat LLM request failed');
  }
  if (!data.text) {
    throw new Error('Empty model response');
  }
  return data.text;
}
