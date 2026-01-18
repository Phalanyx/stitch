import { NextRequest, NextResponse } from 'next/server';
import { callGeminiText } from '@/lib/ai/gemini';

type ChatLlmRequest = {
  prompt: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatLlmRequest;
    if (!body?.prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'LLM service not configured. Please set GEMINI_API_KEY.' },
        { status: 503 }
      );
    }

    const text = await callGeminiText(body.prompt);
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
