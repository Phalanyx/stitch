import { NextRequest, NextResponse } from 'next/server';
import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';
import { createClient } from '@/lib/supabase/server';
import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';
import {
  AudioReference,
  ToolDecision,
  executeTool,
  buildDecisionPrompt,
  buildConversationPrompt,
} from '@/lib/agents/shared';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatContext = {
  clips?: VideoReference[];
  audioClips?: AudioReference[];
};

type ChatRequest = {
  messages: ChatMessage[];
  context?: ChatContext;
};

type ChatResponse = {
  message: string;
  toolUsed: string;
  action?: TimelineAction;
};

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ChatRequest;
    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'messages must be provided' },
        { status: 400 }
      );
    }

    const clips = body.context?.clips ?? [];
    const audioClips = body.context?.audioClips ?? [];
    const lastUser = body.messages[body.messages.length - 1]?.content ?? '';

    // Build the decision prompt with examples and context
    const decisionPrompt = buildDecisionPrompt(lastUser, clips, audioClips);

    // Get tool decision from Gemini
    const decisionText = await callGeminiText(decisionPrompt);

    // Parse the decision with debug logging
    let decision: ToolDecision = { tool: 'none' };
    if (decisionText) {
      const parsed = parseJsonFromText<ToolDecision>(decisionText);
      if (parsed) {
        decision = parsed;
      } else {
        // Log parse failure for debugging
        console.warn('[Chat Agent] Failed to parse tool decision');
        console.warn('[Chat Agent] Raw response:', decisionText);
      }
    }

    // Execute the tool
    const result = await executeTool(decision, user.id, clips, audioClips);

    // If tool execution was successful and returned data
    if (result.success && decision.tool !== 'none') {
      const response: ChatResponse = {
        message: result.data,
        toolUsed: decision.tool,
      };
      if (result.action) {
        response.action = result.action;
      }
      return NextResponse.json(response);
    }

    // If tool execution failed, return the error message
    if (!result.success) {
      return NextResponse.json({
        message: result.error,
        toolUsed: decision.tool,
      } satisfies ChatResponse);
    }

    // For 'none' tool or empty result, generate a conversational response
    const conversationPrompt = buildConversationPrompt(lastUser);
    const responseText = await callGeminiText(conversationPrompt);

    return NextResponse.json({
      message: responseText ?? 'Unable to generate a response.',
      toolUsed: 'none',
    } satisfies ChatResponse);
  } catch (error) {
    console.error('[Chat Agent] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
