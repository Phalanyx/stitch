import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';

// Audio reference type (matches VideoReference structure for audio clips)
export interface AudioReference {
  id: string;
  audioId?: string;
  url: string;
  timestamp: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

// Context passed to agents for decision making
export interface AgentContext {
  userId: string;
  clips: VideoReference[];
  audioClips: AudioReference[];
}

// Result type for tool execution
export type ToolResult<T = string> =
  | { success: true; data: T; action?: TimelineAction }
  | { success: false; error: string };

// Tool decision from LLM
export interface ToolDecision {
  tool: string;
  args?: Record<string, unknown>;
}

// Validated arguments after flexible parsing
export interface ValidatedArgs {
  valid: true;
  parsed: Record<string, unknown>;
}

export interface InvalidArgs {
  valid: false;
  error: string;
}

export type ValidationResult = ValidatedArgs | InvalidArgs;

// Tool definition with schema and examples
export interface ToolDefinition {
  name: string;
  description: string;
  args: Record<string, string>;
  examples: ToolExample[];
}

export interface ToolExample {
  user: string;
  response: string;
}

// Database types (from Prisma)
export interface DbVideo {
  id: string;
  userId: string;
  url: string;
  fileName: string;
  duration: number | null;
  fileSize: number | null;
  createdAt: Date;
}

export interface DbAudio {
  id: string;
  userId: string;
  url: string;
  fileName: string;
  duration: number | null;
  fileSize: number | null;
  createdAt: Date;
}
