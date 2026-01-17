import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createMemory } from '@/lib/agents/behaviorAgent/memory';
import { runBehaviorAgent } from '@/lib/agents/behaviorAgent/orchestrator';
import { createToolRegistry } from '@/lib/agents/behaviorAgent/tools';
import { EventRecord, MemoryState } from '@/lib/agents/behaviorAgent/types';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/lib/agents/shared/types';

type AgentContext = {
  clips?: VideoReference[];
  audioClips?: AudioReference[];
};

type AgentRequest = {
  events: EventRecord[];
  memory?: MemoryState;
  context?: AgentContext;
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

    const body = (await request.json()) as AgentRequest;

    if (!Array.isArray(body?.events)) {
      return NextResponse.json(
        { error: 'events must be an array' },
        { status: 400 }
      );
    }

    const tools = createToolRegistry();
    const memory = body.memory ?? createMemory();

    // Run the behavior agent with full context
    const output = await runBehaviorAgent(body.events, tools, {
      previousMemory: memory,
      userId: user.id,
      clips: body.context?.clips ?? [],
      audioClips: body.context?.audioClips ?? [],
    });

    return NextResponse.json(output);
  } catch (error) {
    console.error('[Behavior Agent] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
