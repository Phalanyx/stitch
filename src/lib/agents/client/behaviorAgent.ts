import { parseJsonFromText } from '@/lib/ai/gemini';
import { callChatLlm } from '@/lib/ai/chatLlmClient';
import {
  BehaviorState,
  EventRecord,
  MemoryState,
  OrchestratorOutput,
} from '@/lib/agents/behaviorAgent/types';
import { createMemory, ingestNewEvents } from '@/lib/agents/behaviorAgent/memory';
import { TOOL_DEFINITIONS, createClientToolRegistry } from '@/lib/tools/agentTools';
import { runToolsSequentially } from './toolRunner';
import { AgentContext, ToolCall } from './types';

const EDITING_EVENTS = new Set(['clip_added', 'clip_removed', 'clip_moved', 'clip_trimmed']);
const PREVIEW_EVENTS = new Set(['preview_play', 'preview_pause', 'preview_seek']);
const EXPORT_EVENTS = new Set(['export_started', 'export_completed', 'export_failed']);

function nextPhase(
  events: EventRecord[],
  fallback: BehaviorState['phase']
): BehaviorState['phase'] {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = events[i]?.type;
    if (EXPORT_EVENTS.has(type)) return 'exporting';
    if (PREVIEW_EVENTS.has(type)) return 'previewing';
    if (EDITING_EVENTS.has(type)) return 'editing';
  }
  return fallback ?? 'unknown';
}

async function interpretBehavior(
  newEvents: EventRecord[],
  memory: MemoryState
): Promise<BehaviorState> {
  const eventCounts = { ...memory.behaviorState.eventCounts };
  let lastEventType = memory.behaviorState.lastEventType;

  for (const event of newEvents) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    lastEventType = event.type;
  }

  const fallbackPhase = nextPhase(newEvents, memory.behaviorState.phase);
  const fallbackSummary = lastEventType
    ? `Last action: ${lastEventType}.`
    : memory.behaviorState.summary;

  const aiText = await callChatLlm(
    [
      'You interpret user behavior in a video editor.',
      'Return JSON only: {"phase":"editing|previewing|exporting|idle|unknown","summary":"..."}',
      `Previous summary: ${memory.behaviorState.summary}`,
      `Event counts: ${JSON.stringify(eventCounts)}`,
      `New events: ${JSON.stringify(newEvents)}`,
    ].join('\n')
  );

  const aiResult = parseJsonFromText<{ phase?: BehaviorState['phase']; summary?: string }>(
    aiText
  );
  const phase = aiResult?.phase ?? fallbackPhase;
  const summary = aiResult?.summary ?? fallbackSummary;

  return {
    summary,
    lastEventType,
    eventCounts,
    phase,
  };
}

function fallbackPlan(behavior: BehaviorState): ToolCall[] {
  if (behavior.phase === 'unknown') {
    return [];
  }
  return [
    {
      tool: 'suggest_next_action',
      args: { phase: behavior.phase },
      rationale: 'Provide a next-step suggestion based on the user phase.',
    },
  ];
}

async function planToolCalls(behavior: BehaviorState, prompt: string): Promise<ToolCall[]> {
  const aiText = await callChatLlm(
    [
      'You are a planner that chooses which tools to call in order.',
      'Return JSON array only, each item: {"tool":"toolName","args":{...},"rationale":"..."}',
      `Tools: ${JSON.stringify(TOOL_DEFINITIONS)}`,
      `User prompt: ${prompt}`,
      `Behavior summary: ${behavior.summary}`,
      `Behavior phase: ${behavior.phase}`,
      `Event counts: ${JSON.stringify(behavior.eventCounts)}`,
      'Pick up to 2 tool calls.',
    ].join('\n')
  );

  const aiCalls = parseJsonFromText<ToolCall[]>(aiText);
  if (!aiCalls || !Array.isArray(aiCalls)) {
    return fallbackPlan(behavior);
  }

  const allowed = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
  const filtered = aiCalls.filter((call) => allowed.has(call.tool));
  if (filtered.length === 0) {
    return fallbackPlan(behavior);
  }

  return filtered;
}

export async function runBehaviorAgentClient(options: {
  events: EventRecord[];
  memory?: MemoryState;
  prompt?: string;
  context: AgentContext;
}): Promise<OrchestratorOutput> {
  const previousMemory = options.memory ?? createMemory();
  const { memory: nextMemoryBase, newEvents } = ingestNewEvents(
    options.events,
    previousMemory
  );
  const behavior = await interpretBehavior(newEvents, {
    ...nextMemoryBase,
    behaviorState: previousMemory.behaviorState,
  });

  const memory = {
    ...nextMemoryBase,
    behaviorState: behavior,
    summary: behavior.summary,
  };

  const planPrompt =
    options.prompt ||
    `Interpret behavior and run tools to improve the editing experience. ${behavior.summary}`;
  const calls = await planToolCalls(behavior, planPrompt);

  const tools = createClientToolRegistry();
  const results = await runToolsSequentially(tools, options.context, calls);

  return {
    memory,
    behavior,
    plan: { calls },
    results,
  };
}
