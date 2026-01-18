export async function callGeminiText(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    return null;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(`Gemini API error: ${response.status}`, text);
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: {
      blockReason?: string;
    };
  };

  // Check for blocked content
  if (data.promptFeedback?.blockReason) {
    console.error('Gemini blocked the prompt:', data.promptFeedback.blockReason);
    return null;
  }

  // Check for empty candidates
  if (!data.candidates || data.candidates.length === 0) {
    console.error('Gemini returned no candidates:', JSON.stringify(data));
    return null;
  }

  const candidate = data.candidates[0];
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.warn('Gemini finish reason:', candidate.finishReason);
  }

  const text = candidate.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    console.error('Gemini returned empty text content');
  }

  return text || null;
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
