import { VideoReference } from '@/types/video';
import { AgentToolOutput, ToolName } from '@/lib/tools/agentTools';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type AgentContext = {
  clips: VideoReference[];
  audioClips: VideoReference[];
};

export type ToolCall = {
  tool: ToolName;
  args?: Record<string, JsonValue>;
  rationale?: string;
};

export type ToolResult = {
  tool: ToolName;
  ok: boolean;
  output?: JsonValue;
  error?: string;
  changed?: boolean;
};

export type ToolRegistry = Record<
  ToolName,
  (args: Record<string, JsonValue>, context: AgentContext) => Promise<AgentToolOutput>
>;
