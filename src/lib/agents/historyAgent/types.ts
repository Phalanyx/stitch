import { CommandType } from '@/lib/commands/types';

export type SerializedCommand = {
  id: string;
  type: CommandType;
  description: string;
  timestamp: number;
};

export type SerializableHistory = {
  commands: SerializedCommand[];
  undoCount: number;
  redoCount: number;
  totalExecuted: number;
};

export type PatternObservationType = 'repetitive' | 'workflow' | 'efficiency' | 'suggestion';

export type PatternObservation = {
  id: string;
  type: PatternObservationType;
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  suggestion?: string;
  timestamp: number;
};

export type WorkflowPhase = 'setup' | 'editing' | 'refinement' | 'export';

export type HistoryAnalysis = {
  observations: PatternObservation[];
  workflowPhase: WorkflowPhase;
  efficiencyScore: number;
  summary: string;
  analyzedAt: number;
};

export type NotifyToolArgs = {
  type: PatternObservationType;
  title: string;
  description: string;
  suggestion?: string;
  confidence: number;
};
