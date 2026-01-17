import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';
import { BehaviorState, Plan, ToolCall } from './types';

function fallbackPlan(behavior: BehaviorState): Plan {
  const calls: ToolCall[] = [];

  if (behavior.phase === 'editing') {
    calls.push({
      tool: 'suggestTimelineTips',
      args: { phase: behavior.phase },
      rationale: 'User is editing; provide contextual tips or shortcuts.',
    });
  }

  if (behavior.phase === 'previewing') {
    calls.push({
      tool: 'surfaceExportHelp',
      args: { phase: behavior.phase },
      rationale: 'User is previewing; surface export or playback guidance.',
    });
  }

  if (behavior.phase === 'exporting') {
    calls.push({
      tool: 'surfaceExportHelp',
      args: { phase: behavior.phase },
      rationale: 'User is exporting; catch errors or improve success rate.',
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
      `Allowed tools: ${toolNames.join(', ')}`,
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
