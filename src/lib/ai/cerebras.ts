export type CerebrasAgent = 'chat' | 'behavior';

function getCerebrasApiKey(): string | null {
  return (
    process.env.CEREBRAS_API_KEY ||
    process.env.CEREBRAS_API_KEY_1 ||
    process.env.CEREBRAS_API_KEY_2 ||
    null
  );
}

function getCerebrasModel(agent?: CerebrasAgent): string {
  if (agent === 'chat' && process.env.CEREBRAS_MODEL_CHAT) {
    return process.env.CEREBRAS_MODEL_CHAT;
  }
  if (agent === 'behavior' && process.env.CEREBRAS_MODEL_BEHAVIOR) {
    return process.env.CEREBRAS_MODEL_BEHAVIOR;
  }
  return process.env.CEREBRAS_MODEL || 'llama-3.3-70b';
}

export async function callCerebrasText(
  prompt: string,
  agent?: CerebrasAgent
): Promise<string | null> {
  const apiKey = getCerebrasApiKey();
  if (!apiKey) {
    console.error('CEREBRAS_API_KEY is not set');
    return null;
  }

  const model = getCerebrasModel(agent);

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Cerebras API error: ${response.status}`, text);
    throw new Error(`Cerebras request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    error?: { message?: string };
  };

  if (data.error) {
    console.error('Cerebras API returned error:', data.error.message);
    return null;
  }

  if (!data.choices || data.choices.length === 0) {
    console.error('Cerebras returned no choices:', JSON.stringify(data));
    return null;
  }

  const choice = data.choices[0];
  if (choice.finish_reason && choice.finish_reason !== 'stop') {
    console.warn('Cerebras finish reason:', choice.finish_reason);
  }

  const text = choice.message?.content?.trim();

  if (!text) {
    console.error('Cerebras returned empty text content');
  }

  return text || null;
}
