import { interpretBehavior } from './interpreter';
import { createMemory, ingestNewEvents } from './memory';
import { planToolCalls } from './planner';
import { runToolsSequentially } from './toolRunner';
import {
  EventRecord,
  OrchestratorContext,
  OrchestratorOutput,
  ToolRegistry,
} from './types';

export async function runBehaviorAgent(
  events: EventRecord[],
  tools: ToolRegistry,
  previousMemory = createMemory()
): Promise<OrchestratorOutput> {
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
  };

  const results = await runToolsSequentially(tools, context, plan.calls);

  return {
    memory,
    behavior,
    plan,
    results,
  };
}
