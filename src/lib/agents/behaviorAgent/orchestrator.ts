import { interpretBehavior } from './interpreter';
import { createMemory, ingestNewEvents } from './memory';
import { planToolCalls } from './planner';
import { runToolsSequentially } from './toolRunner';
import {
  EventRecord,
  OrchestratorContext,
  OrchestratorOutput,
  ToolRegistry,
  MemoryState,
  JsonValue,
} from './types';
import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';
import { AudioReference } from '@/lib/agents/shared/types';

// Extended options for running the behavior agent
export type BehaviorAgentOptions = {
  previousMemory?: MemoryState;
  userId?: string;
  clips?: VideoReference[];
  audioClips?: AudioReference[];
};

export async function runBehaviorAgent(
  events: EventRecord[],
  tools: ToolRegistry,
  options: BehaviorAgentOptions = {}
): Promise<OrchestratorOutput> {
  const previousMemory = options.previousMemory ?? createMemory();

  const { memory: nextMemoryBase, newEvents } = ingestNewEvents(events, previousMemory);
  const behavior = await interpretBehavior(newEvents, {
    ...nextMemoryBase,
    behaviorState: previousMemory.behaviorState,
  });

  const memory = {
    ...nextMemoryBase,
    behaviorState: behavior,
    summary: behavior.summary,
  };

  const plan = await planToolCalls(behavior, Object.keys(tools));

  const context: OrchestratorContext = {
    events,
    newEvents,
    memory,
    behavior,
    // Include optional timeline context
    userId: options.userId,
    clips: options.clips,
    audioClips: options.audioClips,
  };

  const results = await runToolsSequentially(tools, context, plan.calls);

  // Extract actions from tool results
  const actions: TimelineAction[] = [];
  for (const result of results) {
    if (result.ok && result.output) {
      const output = result.output as Record<string, JsonValue>;
      if (output.action && typeof output.action === 'object') {
        const action = output.action as Record<string, JsonValue>;
        if (action.type && action.payload) {
          actions.push({
            type: action.type as TimelineAction['type'],
            payload: action.payload as TimelineAction['payload'],
          } as TimelineAction);
        }
      }
    }
  }

  return {
    memory,
    behavior,
    plan,
    results,
    actions: actions.length > 0 ? actions : undefined,
  };
}
