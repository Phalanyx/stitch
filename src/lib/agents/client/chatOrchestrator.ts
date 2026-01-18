import { parseJsonFromText } from '@/lib/ai/gemini';
import { callChatLlm } from '@/lib/ai/chatLlmClient';
import { TOOL_DEFINITIONS, createClientToolRegistry } from '@/lib/tools/agentTools';
import { AgentContext, ToolCall, ToolResult } from './types';
import { AudioMetadata } from '@/types/audio';
import { JsonValue } from '@/lib/agents/behaviorAgent/types';
import { runToolCall } from './toolRunner';

type SatisfactionCheck = {
  satisfied: boolean;
  response?: string;
};

type ChatOrchestratorInput = {
  message: string;
  knownClipIds: string[];
  context: AgentContext;
  toolResults?: ToolResult[];
  onAudioCreated?: (audio: AudioMetadata) => void;
  onTimelineChanged?: () => void;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

type ChatOrchestratorOutput = {
  response: string;
  toolResults: ToolResult[];
};

export async function runChatOrchestrator(
  input: ChatOrchestratorInput
): Promise<ChatOrchestratorOutput> {
  const conversation = input.conversation ?? [];
  const tools = createClientToolRegistry({
    onAudioCreated: input.onAudioCreated,
    conversation,
  });
  const toolList = TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description}`).join('\n');

  const planText = await callChatLlm(
    [
      'You are a planner for a video editing assistant.',
      'IMPORTANT: Respond with ONLY a JSON array. No function calls.',
      'Format: [{"tool":"toolName","args":{...}}] or [] if no action needed.',
      '',
      'Available tools:',
      toolList,
      '',
      `User request: ${input.message}`,
      `Conversation context: ${JSON.stringify(conversation.slice(-6))}`,
      `Timeline clip IDs: ${input.knownClipIds.join(', ') || 'none'}`,
      '',
      '=== CRITICAL: ID Types ===',
      '- clipId: ID of a clip ON the timeline (get from list_clips)',
      '- videoId: ID of an uploaded source video (get from list_uploaded_videos)',
      '',
      '=== IMPORTANT: Call list_clips FIRST when ===',
      '- User says "delete/remove the last/first/second video"',
      '- User wants to delete, move, or modify any clip',
      '- You need to know which clipId to use',
      '- User asks for a transition between two timeline clips',
      '',
      '=== IMPORTANT: Call list_uploaded_videos FIRST when ===',
      '- User wants to ADD a video to the timeline',
      '- You need to find a videoId by name',
      '',
      '=== Example Patterns ===',
      '"Delete the last video" -> [{"tool":"list_clips","args":{}}] (then use last clipId)',
      '"Add my intro video" -> [{"tool":"list_uploaded_videos","args":{}}] (then use videoId)',
      '"Add a fade between clip 1 and clip 2" -> [{"tool":"list_clips","args":{}}] (then use create_transition)',
      '',
      '=== Guidelines ===',
      '- add_video: Adds uploaded video TO timeline. Needs videoId from list_uploaded_videos.',
      '- remove_video: Removes clip FROM timeline. Needs clipId from list_clips.',
      '- create_transition: Generates a transition between two adjacent clips using precedingClipId and succeedingClipId.',
      '- Return [] for simple questions that need no action',
      '- Maximum 3 actions per request',
    ].join('\n')
  );

  console.log('[ChatOrchestrator] Initial plan:', JSON.stringify(planText, null, 2));

  const rawPlan = parseJsonFromText<Array<{ tool?: string; args?: Record<string, JsonValue> }>>(
    planText
  );
  const plan: ToolCall[] =
    rawPlan
      ?.filter((call): call is { tool: string; args?: Record<string, JsonValue> } => {
        return Boolean(call?.tool) && call.tool !== 'none';
      })
      .filter((call): call is ToolCall =>
        TOOL_DEFINITIONS.some((tool) => tool.name === call.tool)
      )
      .map((call) => ({
        tool: call.tool as ToolCall['tool'],
        args: call.args ?? {},
      })) ?? [];

  const toolResults: ToolResult[] = input.toolResults ?? [];
  let satisfied = false;
  let finalResponse = '';
  let timelineChanged = false;

  // Define read-only tools (these are prerequisites, not final actions)
  const readOnlyTools = ['summarize_timeline', 'list_clips', 'list_audio', 'list_uploaded_videos'];

  // Re-planning loop (max 3 iterations to prevent infinite loops)
  let currentPlan = plan;
  for (let iteration = 0; iteration < 3 && !satisfied; iteration++) {
    console.log(`[ChatOrchestrator] Iteration ${iteration}, plan:`, JSON.stringify(currentPlan));

    // Execute tools in the current plan
    for (const call of currentPlan) {
      const toolResult = await runToolCall(tools, input.context, call);
      toolResults.push(toolResult);
      console.log('[ChatOrchestrator] Executed tool:', call.tool, 'Result:', JSON.stringify(toolResult));

      if (toolResult.changed) {
        timelineChanged = true;
      }
    }

    // Check if any modifying tool was successfully called
    const hasModifyingAction = toolResults.some(
      r => r.ok && !readOnlyTools.includes(r.tool)
    );

    // Only run satisfaction check if we've performed a modifying action
    // OR if the plan was empty (user's request might be informational)
    if (hasModifyingAction || currentPlan.length === 0) {
      try {
        const satisfactionText = await callChatLlm(
          [
            'Check if the user request was fulfilled.',
            'IMPORTANT: Respond with ONLY JSON: {"satisfied":true,"response":"..."} or {"satisfied":false}',
            '',
            `User request: ${input.message}`,
            `Conversation context: ${JSON.stringify(conversation.slice(-6))}`,
            `Actions performed: ${JSON.stringify(toolResults)}`,
            '',
            'IMPORTANT: The user request is NOT fulfilled if:',
            '- User asked to remove/delete something but no remove action was performed',
            '- User asked to add something but no add action was performed',
            '- User asked to move something but no move action was performed',
            '- Only list/summarize actions were performed for a modification request',
            '',
            'If satisfied, write a brief response describing what was done.',
          ].join('\n')
        );

        const satisfaction = parseJsonFromText<SatisfactionCheck>(satisfactionText);
        console.log('[ChatOrchestrator] Satisfaction check:', JSON.stringify(satisfaction));

        if (satisfaction?.satisfied) {
          satisfied = true;
          finalResponse = satisfaction.response ?? '';
          break;
        }
      } catch (error) {
        console.error('[ChatOrchestrator] Satisfaction check failed:', error);
        // If we performed a modifying action successfully, assume satisfied
        if (hasModifyingAction) {
          satisfied = true;
          // Generate a simple response based on the last successful modifying tool
          const lastModifyingResult = [...toolResults].reverse().find(
            r => r.ok && !readOnlyTools.includes(r.tool)
          );
          finalResponse = lastModifyingResult?.output
            ? String(lastModifyingResult.output)
            : 'Done!';
          break;
        }
      }
    }

    // If not satisfied and we haven't hit max iterations, re-plan with results
    if (!satisfied && iteration < 2) {
      console.log('[ChatOrchestrator] Re-planning with results...');
      try {
        const rePlanText = await callChatLlm(
          [
            'You are a planner for a video editing assistant.',
            'IMPORTANT: Respond with ONLY a JSON array. No function calls.',
            'Format: [{"tool":"toolName","args":{...}}] or [] if nothing more to do.',
            '',
            'Available tools:',
            toolList,
            '',
            `User request: ${input.message}`,
            `Conversation context: ${JSON.stringify(conversation.slice(-6))}`,
            `Actions already performed: ${JSON.stringify(toolResults)}`,
            '',
            'Based on the results above, what is the NEXT action needed to fulfill the request?',
            '',
            'Examples:',
            '- If list_clips returned clips and user wants to delete the last one, call remove_video with that clipId',
            '- If list_uploaded_videos returned videos and user wants to add one, call add_video with that videoId',
            '- Return [] if the request is already fulfilled or cannot be completed',
          ].join('\n')
        );

        const rePlan = parseJsonFromText<Array<{ tool?: string; args?: Record<string, JsonValue> }>>(
          rePlanText
        );
        currentPlan =
          rePlan
            ?.filter((call): call is { tool: string; args?: Record<string, JsonValue> } => {
              return Boolean(call?.tool) && call.tool !== 'none';
            })
            .filter((call): call is ToolCall =>
              TOOL_DEFINITIONS.some((tool) => tool.name === call.tool)
            )
            .map((call) => ({
              tool: call.tool as ToolCall['tool'],
              args: call.args ?? {},
            })) ?? [];

        console.log('[ChatOrchestrator] Re-plan result:', JSON.stringify(currentPlan));

        // If re-plan is empty, we're done
        if (currentPlan.length === 0) {
          break;
        }
      } catch (error) {
        console.error('[ChatOrchestrator] Re-planning failed:', error);
        // If re-planning fails, break out of the loop
        break;
      }
    }
  }

  // Generate fallback response if not satisfied
  if (!satisfied) {
    const hasErrors = toolResults.some(r => !r.ok);
    const promptParts = [
      'You are a helpful video editor assistant.',
      'Respond naturally in 1-2 sentences.',
      '',
      `User said: ${input.message}`,
      `Conversation context: ${JSON.stringify(conversation.slice(-6))}`,
    ];

    if (hasErrors) {
      const errors = toolResults.filter(r => !r.ok);
      promptParts.push('', 'These actions FAILED:');
      errors.forEach(err => promptParts.push(`- ${err.tool}: ${err.error}`));
      promptParts.push('', 'Explain clearly what went wrong. Do NOT make up reasons.');
    } else if (toolResults.length > 0) {
      promptParts.push(`Results: ${JSON.stringify(toolResults)}`);
    }

    promptParts.push('', 'Provide a helpful response.');

    try {
      finalResponse = await callChatLlm(promptParts.join('\n'));
    } catch (error) {
      console.error('[ChatOrchestrator] Fallback response generation failed:', error);
      // Provide a generic fallback
      if (hasErrors) {
        finalResponse = 'Sorry, I encountered an error while processing your request.';
      } else if (toolResults.length > 0) {
        finalResponse = 'I processed your request.';
      } else {
        finalResponse = "I'm not sure how to help with that.";
      }
    }
  }

  // Notify if timeline was modified so frontend can refetch
  if (timelineChanged && input.onTimelineChanged) {
    input.onTimelineChanged();
  }

  return {
    response: finalResponse || 'Unable to generate a response.',
    toolResults,
  };
}
