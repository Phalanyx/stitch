import { callChatLlm } from '@/lib/ai/chatLlmClient';
import { parseJsonFromText } from '@/lib/ai/gemini';
import {
  HistoryAnalysis,
  NotifyToolArgs,
  PatternObservation,
  SerializableHistory,
  WorkflowPhase,
} from './types';
import { serializeHistoryForPrompt, detectRecentPatterns } from './serializer';

const MINIMUM_COMMANDS_FOR_ANALYSIS = 3;
const CONFIDENCE_THRESHOLD = 0.7;

type AnalyzerResponse = {
  observations: Array<{
    type: 'repetitive' | 'workflow' | 'efficiency' | 'suggestion';
    title: string;
    description: string;
    suggestion?: string;
    confidence: number;
  }>;
  workflowPhase: WorkflowPhase;
  efficiencyScore: number;
  summary: string;
};

export async function runHistoryAnalyzer(
  history: SerializableHistory,
  previousAnalysis?: HistoryAnalysis,
  onNotify?: (observation: PatternObservation) => void
): Promise<HistoryAnalysis> {
  // Skip analysis if not enough commands
  if (history.commands.length < MINIMUM_COMMANDS_FOR_ANALYSIS) {
    return createEmptyAnalysis();
  }

  const serializedHistory = serializeHistoryForPrompt(history);
  const detectedPatterns = detectRecentPatterns(history);

  const systemPrompt = buildAnalyzerPrompt(serializedHistory, detectedPatterns, previousAnalysis);

  try {
    const response = await callChatLlm(systemPrompt, { agent: 'chat' });
    const parsed = parseJsonFromText<AnalyzerResponse>(response);

    if (!parsed) {
      console.warn('[HistoryAgent] Failed to parse analyzer response');
      return createEmptyAnalysis();
    }

    const observations: PatternObservation[] = parsed.observations.map((obs, index) => ({
      id: `obs_${Date.now()}_${index}`,
      type: obs.type,
      title: obs.title,
      description: obs.description,
      confidence: obs.confidence,
      actionable: obs.suggestion !== undefined,
      suggestion: obs.suggestion,
      timestamp: Date.now(),
    }));

    // Notify for high-confidence observations
    const significantObservations = observations.filter(
      (obs) => obs.confidence >= CONFIDENCE_THRESHOLD
    );

    for (const obs of significantObservations) {
      onNotify?.(obs);
    }

    const analysis: HistoryAnalysis = {
      observations,
      workflowPhase: parsed.workflowPhase || 'editing',
      efficiencyScore: parsed.efficiencyScore || 0.5,
      summary: parsed.summary || '',
      analyzedAt: Date.now(),
    };

    console.log('[HistoryAgent] Analysis complete:', {
      observationCount: observations.length,
      significantCount: significantObservations.length,
      workflowPhase: analysis.workflowPhase,
    });

    return analysis;
  } catch (error) {
    console.error('[HistoryAgent] Analysis failed:', error);
    return createEmptyAnalysis();
  }
}

function buildAnalyzerPrompt(
  serializedHistory: string,
  detectedPatterns: string[],
  previousAnalysis?: HistoryAnalysis
): string {
  const parts: string[] = [
    'You are an expert video editing workflow analyzer.',
    'Your task is to analyze command history and identify patterns, inefficiencies, and opportunities for improvement.',
    '',
    'IMPORTANT: Respond with ONLY valid JSON. No markdown, no explanations.',
    '',
    '=== Command History ===',
    serializedHistory,
    '',
  ];

  if (detectedPatterns.length > 0) {
    parts.push('=== Pre-detected Patterns ===');
    parts.push(detectedPatterns.join(', '));
    parts.push('');
  }

  if (previousAnalysis) {
    parts.push('=== Previous Analysis ===');
    parts.push(`Workflow phase: ${previousAnalysis.workflowPhase}`);
    parts.push(`Efficiency score: ${previousAnalysis.efficiencyScore}`);
    parts.push(`Previous observations: ${previousAnalysis.observations.length}`);
    parts.push('');
  }

  parts.push('=== Analysis Instructions ===');
  parts.push('Analyze the command history and identify:');
  parts.push('1. Repetitive patterns (same action type repeated frequently)');
  parts.push('2. Workflow patterns (sequences indicating setup/editing/refinement/export phases)');
  parts.push('3. Efficiency issues (high undo rate, backtracking, redundant actions)');
  parts.push('4. Actionable suggestions (specific tips to improve workflow)');
  parts.push('');
  parts.push('=== Guidelines ===');
  parts.push('- Only report SIGNIFICANT patterns (confidence > 0.7)');
  parts.push('- Suggestions should be specific and actionable');
  parts.push('- Avoid stating the obvious');
  parts.push('- Focus on patterns that would genuinely help the user');
  parts.push('- High undo rate (>30%) suggests user is experimenting or making mistakes');
  parts.push('- Repeated add/remove cycles suggest indecision about content');
  parts.push('');
  parts.push('=== Response Format ===');
  parts.push('Respond with this exact JSON structure:');
  parts.push('{');
  parts.push('  "observations": [');
  parts.push('    {');
  parts.push('      "type": "repetitive" | "workflow" | "efficiency" | "suggestion",');
  parts.push('      "title": "Short title (5 words max)",');
  parts.push('      "description": "What you observed",');
  parts.push('      "suggestion": "Optional actionable tip",');
  parts.push('      "confidence": 0.0-1.0');
  parts.push('    }');
  parts.push('  ],');
  parts.push('  "workflowPhase": "setup" | "editing" | "refinement" | "export",');
  parts.push('  "efficiencyScore": 0.0-1.0,');
  parts.push('  "summary": "Brief summary of the editing session"');
  parts.push('}');
  parts.push('');
  parts.push('If no significant patterns are found, return empty observations array.');

  return parts.join('\n');
}

function createEmptyAnalysis(): HistoryAnalysis {
  return {
    observations: [],
    workflowPhase: 'editing',
    efficiencyScore: 0.5,
    summary: 'Not enough data for analysis.',
    analyzedAt: Date.now(),
  };
}

export function formatObservationForChat(observation: PatternObservation): string {
  let message = `I noticed: ${observation.title}. ${observation.description}`;
  if (observation.suggestion) {
    message += ` Tip: ${observation.suggestion}`;
  }
  return message;
}
