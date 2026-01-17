import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';
import { AudioReference } from '@/lib/agents/shared/types';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type EventRecord = {
  id?: string;
  ts?: number;
  type: string;
  props?: Record<string, JsonValue>;
};

export type BehaviorState = {
  summary: string;
  lastEventType?: string;
  eventCounts: Record<string, number>;
  phase: 'idle' | 'editing' | 'previewing' | 'exporting' | 'unknown';
};

export type MemoryState = {
  lastIndex: number;
  summary: string;
  behaviorState: BehaviorState;
};

export type ToolCall = {
  tool: string;
  args: Record<string, JsonValue>;
  rationale?: string;
};

export type ToolResult = {
  tool: string;
  ok: boolean;
  output?: JsonValue;
  error?: string;
};

export type ToolRegistry = Record<
  string,
  (args: Record<string, JsonValue>, context: OrchestratorContext) => Promise<JsonValue>
>;

export type Plan = {
  calls: ToolCall[];
};

export type OrchestratorContext = {
  events: EventRecord[];
  newEvents: EventRecord[];
  memory: MemoryState;
  behavior: BehaviorState;
};

export type OrchestratorOutput = {
  memory: MemoryState;
  behavior: BehaviorState;
  plan: Plan;
  results: ToolResult[];
};
