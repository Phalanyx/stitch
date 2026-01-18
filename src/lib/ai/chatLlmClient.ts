export async function callChatLlm(prompt: string): Promise<string> {
  const response = await fetch('/api/chat-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
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
