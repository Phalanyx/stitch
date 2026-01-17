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
  metadataCache?: Map<string, JsonValue>;
  onAudioCreated?: (audio: AudioMetadata) => void;
};

type ChatOrchestratorOutput = {
  response: string;
  toolResults: ToolResult[];
};

export async function runChatOrchestrator(
  input: ChatOrchestratorInput
): Promise<ChatOrchestratorOutput> {
  const tools = createClientToolRegistry({
    metadataCache: input.metadataCache,
    onAudioCreated: input.onAudioCreated,
  });
  const planText = await callChatLlm(
    [
      'You are a planner that chooses which tools to call in order.',
      'Return JSON array only, each item: {"tool":"toolName","args":{...}}.',
      `Tools: ${JSON.stringify(TOOL_DEFINITIONS)}`,
      `User message: ${input.message}`,
      `Known clip ids: ${input.knownClipIds.join(', ') || 'none'}`,
      'Prefer metadata-based tools when the user asks about clip content or names.',
      'Use list_uploaded_videos when the user asks about uploaded videos or library.',
      'Use create_audio_from_text when the user wants narration, voiceover, or spoken audio.',
      'Pick up to 3 tool calls. Return [] if none are needed.',
      'Use find_clip with args {"id":"..."} when the user references a clip id.',
      'Use get_video_metadata with args {"videoId":"..."} for a clip video id.',
    ].join('\n')
  );

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

  for (const call of plan) {
    const toolResult = await runToolCall(tools, input.context, call);
    toolResults.push(toolResult);

    const satisfactionText = await callChatLlm(
      [
        'You are a validator that checks if the user request is satisfied.',
        'Return JSON only: {"satisfied":true|false,"response":"..."}',
        `User message: ${input.message}`,
        `Tool results: ${JSON.stringify(toolResults)}`,
        'If satisfied, include a concise response without raw ids unless asked.',
      ].join('\n')
    );

    const satisfaction = parseJsonFromText<SatisfactionCheck>(satisfactionText);
    if (satisfaction?.satisfied) {
      satisfied = true;
      finalResponse = satisfaction.response ?? '';
      break;
    }
  }

  if (!satisfied) {
    finalResponse = await callChatLlm(
      [
        'You are a helpful assistant for a video editor.',
        `User message: ${input.message}`,
        `Tool results: ${JSON.stringify(toolResults)}`,
        'Prefer fileName or summary over raw ids unless the user asked for ids.',
        'Answer in 1-3 sentences, using tool results when relevant.',
      ].join('\n')
    );
  }

  return {
    response: finalResponse || 'Unable to generate a response.',
    toolResults,
  };
}
