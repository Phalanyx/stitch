import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';
import { BehaviorState, Plan, ToolCall } from './types';
import { TOOL_DEFINITIONS } from '@/lib/tools/agentTools';

function fallbackPlan(behavior: BehaviorState): Plan {
  const calls: ToolCall[] = [];

  if (behavior.phase !== 'unknown') {
    calls.push({
      tool: 'suggest_next_action',
      args: { phase: behavior.phase },
      rationale: 'Provide a next-step suggestion based on the user phase.',
    });
  }

  return { calls };
}

export async function planToolCalls(
  behavior: BehaviorState,
  toolNames: string[],
  prompt: string
): Promise<Plan> {
  const aiText = await callGeminiText(
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

  const filtered = aiCalls.filter((call) => toolNames.includes(call.tool));
  if (filtered.length === 0) {
    return fallbackPlan(behavior);
  }

  return { calls: filtered };
}
