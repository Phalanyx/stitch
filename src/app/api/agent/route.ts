import { NextRequest, NextResponse } from 'next/server';
import { createMemory } from '@/lib/agents/behaviorAgent/memory';
import { runBehaviorAgent } from '@/lib/agents/behaviorAgent/orchestrator';
import { createToolRegistry } from '@/lib/agents/behaviorAgent/tools';
import { EventRecord, MemoryState } from '@/lib/agents/behaviorAgent/types';
import { createClient } from '@/lib/supabase/server';

type AgentRequest = {
  events: EventRecord[];
  memory?: MemoryState;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AgentRequest;

    if (!Array.isArray(body?.events)) {
      return NextResponse.json(
        { error: 'events must be an array' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tools = createToolRegistry();
    const memory = body.memory ?? createMemory();

    const output = await runBehaviorAgent(body.events, tools, memory, user.id);

    return NextResponse.json(output);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
