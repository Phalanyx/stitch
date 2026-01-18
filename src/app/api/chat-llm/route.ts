import { NextRequest, NextResponse } from 'next/server';
import { callLLMText, hasAnyLLMKey, LLMProvider, LLMAgent } from '@/lib/ai/llmService';

type ChatLlmRequest = {
  prompt: string;
  provider?: LLMProvider;
  agent?: LLMAgent;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatLlmRequest;
    if (!body?.prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    // Check if any API key is configured
    if (!hasAnyLLMKey()) {
      console.error('No LLM API key configured (GEMINI_API_KEY or CEREBRAS_API_KEY)');
      return NextResponse.json(
        { error: 'LLM service not configured. Please set GEMINI_API_KEY or CEREBRAS_API_KEY.' },
        { status: 503 }
      );
    }

    const text = await callLLMText(body.prompt, {
      provider: body.provider,
      agent: body.agent,
    });

    if (!text) {
      return NextResponse.json(
        { error: 'No model response. Check server logs for details.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Chat LLM error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
