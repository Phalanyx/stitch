import { NextRequest, NextResponse } from 'next/server';
import { ModelMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';
import { AudioReference } from '@/lib/agents/shared';
import { chatWithTools } from '@/lib/ai/vercel-ai';
import {
  getMessages,
  addMessages,
} from '@/lib/ai/conversationStore';

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
  sessionId?: string;
};

type ChatResponse = {
  message: string;
  toolUsed: string;
  action?: TimelineAction;
  sessionId?: string;
};

// Convert client messages to ModelMessages
function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

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
    const sessionId = body.sessionId || crypto.randomUUID();

    // Get existing conversation history from store
    const existingMessages = getMessages(sessionId);

    // Get new messages (only the ones not in history)
    // Usually this is just the last user message
    const newMessages = toModelMessages(body.messages);
    const lastMessage = newMessages[newMessages.length - 1];

    // Combine history with new message
    const allMessages: ModelMessage[] = [...existingMessages];
    if (lastMessage) {
      allMessages.push(lastMessage);
    }

    // Call AI with tools
    const result = await chatWithTools(allMessages, {
      userId: user.id,
      clips,
      audioClips,
    });

    // Save the new user message and assistant response to conversation history
    if (lastMessage) {
      addMessages(sessionId, [
        lastMessage,
        { role: 'assistant', content: result.message },
      ]);
    }

    const response: ChatResponse = {
      message: result.message,
      toolUsed: result.toolUsed,
      sessionId,
    };

    if (result.action) {
      response.action = result.action;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Chat Agent] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
