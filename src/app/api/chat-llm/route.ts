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

    const text = await callGeminiText(body.prompt);
    if (!text) {
      return NextResponse.json({ error: 'No model response' }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
