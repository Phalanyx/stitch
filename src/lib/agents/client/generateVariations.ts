import { callChatLlm } from '@/lib/ai/chatLlmClient';
import { parseJsonFromText } from '@/lib/ai/gemini';
import { getNLParamInfo } from '@/lib/tools/agentTools';
import { ToolCall } from './types';

export type ToolOptionVariation = {
  id: string;
  value: string;
  description: string;
};

type VariationResponse = {
  variations: Array<{
    value: string;
    description: string;
  }>;
};

export async function generateVariations(
  toolCall: ToolCall,
  userMessage: string,
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<ToolOptionVariation[]> {
  const nlInfo = getNLParamInfo(toolCall.tool);
  if (!nlInfo) {
    return [];
  }

  const originalValue = String(toolCall.args?.[nlInfo.paramName] ?? '');
  if (!originalValue) {
    return [];
  }

  try {
    const prompt = [
      'Generate 3-4 alternative variations for a tool parameter.',
      'IMPORTANT: Respond with ONLY JSON in this format:',
      '{"variations":[{"value":"...", "description":"..."}]}',
      '',
      `Tool: ${toolCall.tool}`,
      `Parameter: ${nlInfo.paramName} (${nlInfo.description})`,
      `Original value: "${originalValue}"`,
      `User request: "${userMessage}"`,
      `Recent conversation: ${JSON.stringify(conversation.slice(-4))}`,
      '',
      'Create variations that:',
      '1. First variation should be the original or very close to it',
      '2. Other variations offer different approaches, specificity levels, or phrasings',
      '3. All variations should fulfill the user\'s intent',
      '4. Keep descriptions brief (under 10 words)',
      '',
      toolCall.tool === 'search_videos'
        ? 'For search queries: vary specificity, keywords, or search angles.'
        : toolCall.tool === 'create_transition'
        ? 'For transitions: vary style, mood, or visual effect descriptions.'
        : 'For text-to-speech: vary tone, pacing cues, or emphasis.',
    ].join('\n');

    const responseText = await callChatLlm(prompt);
    const parsed = parseJsonFromText<VariationResponse>(responseText);

    if (!parsed?.variations || !Array.isArray(parsed.variations)) {
      // Fallback to original value only
      return [
        {
          id: 'original',
          value: originalValue,
          description: 'Original suggestion',
        },
      ];
    }

    return parsed.variations.map((v, index) => ({
      id: index === 0 ? 'original' : `variation-${index}`,
      value: v.value,
      description: v.description,
    }));
  } catch (error) {
    console.error('[generateVariations] Error generating variations:', error);
    // Fallback to original value
    return [
      {
        id: 'original',
        value: originalValue,
        description: 'Original suggestion',
      },
    ];
  }
}
