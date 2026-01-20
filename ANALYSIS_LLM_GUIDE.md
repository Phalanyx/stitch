# Analysis & LLM Code Documentation

This document provides comprehensive documentation for all analysis and LLM-related code in the Stitch video editing application.

---

## Table of Contents

1. [Overview](#1-overview)
2. [LLM Service Architecture](#2-llm-service-architecture)
3. [Analysis Systems](#3-analysis-systems)
4. [Chat Integration](#4-chat-integration)
5. [User Preferences System](#5-user-preferences-system)
6. [Quick Reference](#6-quick-reference)

---

## 1. Overview

### Purpose

The analysis and LLM systems in Stitch provide:
- **Intelligent chat interface** for natural language video editing commands
- **Workflow analysis** to detect patterns and suggest improvements
- **User preference learning** to personalize responses and editing suggestions
- **Multi-provider LLM abstraction** with automatic fallback support

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ useChatAgent │    │useHistoryAgent│    │   Preferences    │  │
│  │    Hook      │    │    Hook       │    │     Panel        │  │
│  └──────┬───────┘    └──────┬────────┘    └────────┬─────────┘  │
└─────────┼───────────────────┼──────────────────────┼────────────┘
          │                   │                      │
          ▼                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ /api/chat-llm│    │  History     │    │/api/preferences/ │  │
│  │              │    │ Orchestrator │    │    analyze       │  │
│  └──────┬───────┘    └──────┬────────┘    └────────┬─────────┘  │
└─────────┼───────────────────┼──────────────────────┼────────────┘
          │                   │                      │
          ▼                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LLM Service Layer                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    llmService.ts                           │ │
│  │  ┌─────────────┐              ┌─────────────┐              │ │
│  │  │  gemini.ts  │◄──fallback──►│ cerebras.ts │              │ │
│  │  └─────────────┘              └─────────────┘              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     External LLM APIs                           │
│     Google Gemini API          Cerebras API                     │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Input** → Chat hook receives message
2. **Chat Orchestrator** → Plans tool calls using LLM
3. **Tool Execution** → Executes video editing operations
4. **Response Generation** → LLM generates natural language response
5. **History Analysis** → Background analysis of editing patterns
6. **Preference Extraction** → LLM extracts user preferences from conversations

---

## 2. LLM Service Architecture

### Core Provider Abstraction

**File:** `src/lib/ai/llmService.ts`

This is the main entry point for all LLM calls. It provides:
- Provider selection based on environment configuration
- Automatic fallback between providers
- Agent-specific provider routing

```typescript
import { callGeminiText } from './gemini';
import { callCerebrasText, CerebrasAgent } from './cerebras';

export type LLMProvider = 'gemini' | 'cerebras';
export type LLMAgent = CerebrasAgent;

export interface LLMOptions {
  provider?: LLMProvider;
  agent?: LLMAgent;
}

function getProviderForAgent(agent?: LLMAgent): LLMProvider | undefined {
  if (agent === 'chat' && process.env.LLM_PROVIDER_CHAT) {
    return process.env.LLM_PROVIDER_CHAT as LLMProvider;
  }
  if (agent === 'behavior' && process.env.LLM_PROVIDER_BEHAVIOR) {
    return process.env.LLM_PROVIDER_BEHAVIOR as LLMProvider;
  }
  if (process.env.LLM_PROVIDER) {
    return process.env.LLM_PROVIDER as LLMProvider;
  }
  return undefined;
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function hasCerebrasKey(): boolean {
  return Boolean(
    process.env.CEREBRAS_API_KEY ||
      process.env.CEREBRAS_API_KEY_1 ||
      process.env.CEREBRAS_API_KEY_2
  );
}

function getDefaultProvider(): LLMProvider {
  if (hasGeminiKey()) return 'gemini';
  if (hasCerebrasKey()) return 'cerebras';
  return 'gemini'; // Will fail with missing key error
}

function getFallbackProvider(primary: LLMProvider): LLMProvider | null {
  if (primary === 'gemini' && hasCerebrasKey()) return 'cerebras';
  if (primary === 'cerebras' && hasGeminiKey()) return 'gemini';
  return null;
}

async function callProvider(
  provider: LLMProvider,
  prompt: string,
  agent?: LLMAgent
): Promise<string | null> {
  if (provider === 'gemini') {
    return callGeminiText(prompt);
  }
  if (provider === 'cerebras') {
    return callCerebrasText(prompt, agent);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

export async function callLLMText(
  prompt: string,
  options: LLMOptions = {}
): Promise<string | null> {
  const { agent } = options;

  // Determine primary provider
  const configuredProvider = options.provider || getProviderForAgent(agent);
  const primaryProvider = configuredProvider || getDefaultProvider();

  console.log(`[LLMService] Request for agent: ${agent || 'default'}`);
  console.log(`[LLMService] Configured provider: ${configuredProvider}, using: ${primaryProvider}`);

  try {
    const result = await callProvider(primaryProvider, prompt, agent);

    if (result) {
      return result;
    }

    // If explicitly configured, do NOT fallback
    if (configuredProvider) {
      return null;
    }

    // If primary returned null/empty, try fallback
    const fallbackProvider = getFallbackProvider(primaryProvider);
    if (fallbackProvider) {
      console.log(`[LLMService] Primary provider (${primaryProvider}) returned empty, trying fallback: ${fallbackProvider}`);
      return callProvider(fallbackProvider, prompt, agent);
    }

    return null;
  } catch (error) {
    console.error(`[LLMService] Primary provider (${primaryProvider}) failed:`, error);

    // If explicitly configured, do NOT fallback
    if (configuredProvider) {
      throw error;
    }

    // Try fallback on error
    const fallbackProvider = getFallbackProvider(primaryProvider);
    if (fallbackProvider) {
      console.log(`[LLMService] Trying fallback provider: ${fallbackProvider}`);
      try {
        return await callProvider(fallbackProvider, prompt, agent);
      } catch (fallbackError) {
        console.error(`[LLMService] Fallback provider (${fallbackProvider}) also failed:`, fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}

export function hasAnyLLMKey(): boolean {
  return hasGeminiKey() || hasCerebrasKey();
}

export function parseJsonFromText<T>(text: string | null): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
      ? objectStart
      : Math.min(objectStart, arrayStart);
  if (start === -1) return null;
  const objectEnd = trimmed.lastIndexOf('}');
  const arrayEnd = trimmed.lastIndexOf(']');
  const end = Math.max(objectEnd, arrayEnd);
  if (end === -1 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
```

### Google Gemini Integration

**File:** `src/lib/ai/gemini.ts`

```typescript
export async function callGeminiText(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    return null;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  console.log(`[Gemini] Using model: ${model}`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(`Gemini API error: ${response.status}`, text);
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: {
      blockReason?: string;
    };
  };

  // Check for blocked content
  if (data.promptFeedback?.blockReason) {
    console.error('Gemini blocked the prompt:', data.promptFeedback.blockReason);
    return null;
  }

  // Check for empty candidates
  if (!data.candidates || data.candidates.length === 0) {
    console.error('Gemini returned no candidates:', JSON.stringify(data));
    return null;
  }

  const candidate = data.candidates[0];
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.warn('Gemini finish reason:', candidate.finishReason);
  }

  const text = candidate.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    console.error('Gemini returned empty text content');
  }

  return text || null;
}

export function parseJsonFromText<T>(text: string | null): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
      ? objectStart
      : Math.min(objectStart, arrayStart);
  if (start === -1) return null;
  const objectEnd = trimmed.lastIndexOf('}');
  const arrayEnd = trimmed.lastIndexOf(']');
  const end = Math.max(objectEnd, arrayEnd);
  if (end === -1 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
```

### Cerebras Integration

**File:** `src/lib/ai/cerebras.ts`

```typescript
export type CerebrasAgent = 'chat' | 'behavior';

function getCerebrasApiKey(): string | null {
  return (
    process.env.CEREBRAS_API_KEY ||
    process.env.CEREBRAS_API_KEY_1 ||
    process.env.CEREBRAS_API_KEY_2 ||
    null
  );
}

function getCerebrasModel(agent?: CerebrasAgent): string {
  if (agent === 'chat' && process.env.CEREBRAS_MODEL_CHAT) {
    return process.env.CEREBRAS_MODEL_CHAT;
  }
  if (agent === 'behavior' && process.env.CEREBRAS_MODEL_BEHAVIOR) {
    return process.env.CEREBRAS_MODEL_BEHAVIOR;
  }
  return process.env.CEREBRAS_MODEL || 'llama-3.3-70b';
}

export async function callCerebrasText(
  prompt: string,
  agent?: CerebrasAgent
): Promise<string | null> {
  const apiKey = getCerebrasApiKey();
  if (!apiKey) {
    console.error('CEREBRAS_API_KEY is not set');
    return null;
  }

  const model = getCerebrasModel(agent);

  console.log(`[Cerebras] Using model: ${model}`);

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Cerebras API error: ${response.status}`, text);
    throw new Error(`Cerebras request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    error?: { message?: string };
  };

  if (data.error) {
    console.error('Cerebras API returned error:', data.error.message);
    return null;
  }

  if (!data.choices || data.choices.length === 0) {
    console.error('Cerebras returned no choices:', JSON.stringify(data));
    return null;
  }

  const choice = data.choices[0];
  if (choice.finish_reason && choice.finish_reason !== 'stop') {
    console.warn('Cerebras finish reason:', choice.finish_reason);
  }

  const text = choice.message?.content?.trim();

  if (!text) {
    console.error('Cerebras returned empty text content');
  }

  return text || null;
}
```

### Client-Side LLM Wrapper

**File:** `src/lib/ai/chatLlmClient.ts`

This client-side wrapper calls the backend API for LLM operations:

```typescript
export type LLMProvider = 'gemini' | 'cerebras';
export type LLMAgent = 'chat' | 'behavior';

export interface ChatLlmOptions {
  provider?: LLMProvider;
  agent?: LLMAgent;
}

export async function callChatLlm(
  prompt: string,
  options: ChatLlmOptions = {}
): Promise<string> {
  const response = await fetch('/api/chat-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      provider: options.provider,
      agent: options.agent,
    }),
  });
  const data = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Chat LLM request failed');
  }
  if (!data.text) {
    throw new Error('Empty model response');
  }
  return data.text;
}
```

---

## 3. Analysis Systems

### History Analysis

The history analysis system monitors user editing patterns to provide workflow insights and suggestions.

#### Type Definitions

**File:** `src/lib/agents/historyAgent/types.ts`

```typescript
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
```

#### History Serializer

**File:** `src/lib/agents/historyAgent/serializer.ts`

```typescript
import { SerializableHistory, SerializedCommand } from './types';

type CommandTypeCategory = 'video' | 'audio' | 'layer' | 'batch';

function getCommandCategory(type: string): CommandTypeCategory {
  if (type.startsWith('video:')) return 'video';
  if (type.startsWith('audio:')) return 'audio';
  if (type.startsWith('layer:')) return 'layer';
  return 'batch';
}

function getCategoryCounts(commands: SerializedCommand[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cmd of commands) {
    const category = getCommandCategory(cmd.type);
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

export function serializeHistoryForPrompt(history: SerializableHistory): string {
  const { commands, undoCount, totalExecuted } = history;

  if (commands.length === 0) {
    return 'No commands in history yet.';
  }

  // Calculate undo rate
  const undoRate = totalExecuted > 0 ? Math.round((undoCount / totalExecuted) * 100) : 0;

  // Get last 5 command types
  const recentTypes = commands.slice(-5).map(c => c.type);

  // Get category breakdown
  const categoryCounts = getCategoryCounts(commands);
  const categoryParts = Object.entries(categoryCounts)
    .map(([cat, count]) => `${cat}:${count}`)
    .join(' ');

  // Build compact single-line output
  return `Stats: ${totalExecuted} cmds, ${undoCount} undos (${undoRate}%) | Recent: ${recentTypes.join(', ')} | Types: ${categoryParts}`;
}

export function detectRecentPatterns(history: SerializableHistory): string[] {
  const patterns: string[] = [];
  const { commands, undoCount, totalExecuted } = history;

  if (commands.length < 3) return patterns;

  // High undo rate
  if (totalExecuted > 5 && undoCount / totalExecuted > 0.3) {
    patterns.push('high_undo_rate');
  }

  // Check for repeated action types in recent commands
  const recentCommands = commands.slice(-10);
  const typeCounts: Record<string, number> = {};
  for (const cmd of recentCommands) {
    typeCounts[cmd.type] = (typeCounts[cmd.type] || 0) + 1;
  }

  for (const [type, count] of Object.entries(typeCounts)) {
    if (count >= 4) {
      patterns.push(`repeated_${type}`);
    }
  }

  // Check for add-then-undo pattern (backtracking)
  const addThenUndoCount = countAddThenUndoPatterns(commands);
  if (addThenUndoCount >= 2) {
    patterns.push('add_then_undo');
  }

  return patterns;
}

function countAddThenUndoPatterns(commands: SerializedCommand[]): number {
  let count = 0;
  const addTypes = ['video:add', 'audio:add', 'layer:add'];

  for (let i = 0; i < commands.length - 1; i++) {
    // Look for add followed by the same item being potentially undone
    // Since we don't have direct undo tracking in commands, we look for
    // add followed by remove of similar type
    if (addTypes.includes(commands[i].type)) {
      const removeType = commands[i].type.replace(':add', ':remove');
      if (commands[i + 1]?.type === removeType) {
        count++;
      }
    }
  }

  return count;
}
```

#### History Orchestrator

**File:** `src/lib/agents/historyAgent/orchestrator.ts`

```typescript
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
```

### Preference Analysis

**File:** `src/app/api/preferences/analyze/route.ts`

This API endpoint uses LLM to extract user preferences from conversations and feedback:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { callLLMText, parseJsonFromText } from '@/lib/ai/llmService';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type FeedbackInput = {
  type: 'like' | 'dislike';
  messageContent: string;
  feedbackText?: string;
};

type ExtractedPreferences = {
  likes: string[];
  dislikes: string[];
};

// POST: Analyze conversation history to extract user preferences
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const conversation = body.conversation as ConversationMessage[] | undefined;
  const feedback = body.feedback as FeedbackInput | undefined;

  // Validate input - need either conversation or feedback
  if (!conversation && !feedback) {
    return NextResponse.json({ error: 'No conversation or feedback provided' }, { status: 400 });
  }

  if (conversation && (!Array.isArray(conversation) || conversation.length === 0)) {
    return NextResponse.json({ error: 'Invalid conversation format' }, { status: 400 });
  }

  // Fetch existing preferences
  let profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { userLikes: true, userDislikes: true },
  });

  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        sessionVideo: [],
        sessionAudio: [],
        userLikes: '',
        userDislikes: '',
      },
      select: { userLikes: true, userDislikes: true },
    });
  }

  const existingLikes = profile.userLikes;
  const existingDislikes = profile.userDislikes;

  // Build prompt for preference extraction
  let prompt: string;

  if (feedback) {
    // Feedback-specific prompt
    const feedbackContext = feedback.feedbackText
      ? `User feedback: "${feedback.feedbackText}"`
      : 'No additional feedback text provided.';

    if (feedback.type === 'like') {
      prompt = `You are analyzing user feedback on a video editing assistant's response.
The user LIKED this assistant response, indicating they appreciated the editing approach.

Assistant response that was liked:
"${feedback.messageContent}"

${feedbackContext}

Current saved preferences:
Likes: ${existingLikes || 'None saved yet'}
Dislikes: ${existingDislikes || 'None saved yet'}

Based on this positive feedback, extract what video editing styles or approaches the user appreciates.
Focus on:
- Editing styles (fast-paced, slow, cinematic)
- Transition types (smooth, abrupt, fade, cut)
- Visual effects preferences
- Audio preferences
- Pacing and rhythm
- Color grading preferences
- Communication style preferences

IMPORTANT:
- Only extract NEW preferences that are not already in the saved preferences
- Be concise - use short phrases, not sentences
- Return valid JSON only

Return JSON format:
{"likes": ["preference1", "preference2"], "dislikes": []}

If no new preferences can be extracted, return: {"likes": [], "dislikes": []}`;
    } else {
      prompt = `You are analyzing user feedback on a video editing assistant's response.
The user DISLIKED this assistant response, indicating they want something different.

Assistant response that was disliked:
"${feedback.messageContent}"

${feedbackContext}

Current saved preferences:
Likes: ${existingLikes || 'None saved yet'}
Dislikes: ${existingDislikes || 'None saved yet'}

Based on this negative feedback, extract what video editing styles or approaches the user wants to AVOID.
Focus on:
- Editing styles to avoid
- Transition types to avoid
- Visual effects to avoid
- Audio approaches to avoid
- Pacing issues
- Color grading to avoid
- Communication style issues

IMPORTANT:
- Only extract NEW preferences that are not already in the saved preferences
- Be concise - use short phrases, not sentences
- Return valid JSON only

Return JSON format:
{"likes": [], "dislikes": ["thing_to_avoid1", "thing_to_avoid2"]}

If no new preferences can be extracted, return: {"likes": [], "dislikes": []}`;
    }
  } else {
    // Conversation-based prompt (original logic)
    const conversationText = conversation!
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    prompt = `You are analyzing a conversation between a user and a video editing assistant.
Extract any video editing preferences the user has expressed (likes and dislikes).

Focus on video editing preferences such as:
- Editing styles (fast-paced, slow, cinematic)
- Transition types (smooth, abrupt, fade, cut)
- Visual effects preferences
- Audio preferences
- Pacing and rhythm
- Color grading preferences
- Any other video production preferences

Current saved preferences:
Likes: ${existingLikes || 'None saved yet'}
Dislikes: ${existingDislikes || 'None saved yet'}

Conversation to analyze:
${conversationText}

IMPORTANT:
- Only extract NEW preferences that are not already in the saved preferences
- Be concise - use short phrases, not sentences
- Return valid JSON only

Return JSON format:
{"likes": ["preference1", "preference2"], "dislikes": ["preference1", "preference2"]}

If no new preferences found, return: {"likes": [], "dislikes": []}`;
  }

  try {
    const response = await callLLMText(prompt, { agent: 'chat' });
    const extracted = parseJsonFromText<ExtractedPreferences>(response);

    if (!extracted) {
      return NextResponse.json({
        success: true,
        message: 'No preferences extracted',
        updated: false,
      });
    }

    // Merge new preferences with existing ones
    const mergePreferences = (existing: string, newItems: string[]): string => {
      if (newItems.length === 0) return existing;

      const existingItems = existing
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      const uniqueNew = newItems.filter(
        (item) => !existingItems.includes(item.toLowerCase())
      );

      if (uniqueNew.length === 0) return existing;

      const combined = existing ? `${existing}, ${uniqueNew.join(', ')}` : uniqueNew.join(', ');
      return combined;
    };

    const updatedLikes = mergePreferences(existingLikes, extracted.likes || []);
    const updatedDislikes = mergePreferences(existingDislikes, extracted.dislikes || []);

    // Only update if there are changes
    const hasChanges = updatedLikes !== existingLikes || updatedDislikes !== existingDislikes;

    if (hasChanges) {
      await prisma.profile.update({
        where: { id: user.id },
        data: {
          userLikes: updatedLikes,
          userDislikes: updatedDislikes,
        },
      });
    }

    return NextResponse.json({
      success: true,
      updated: hasChanges,
      newLikes: extracted.likes || [],
      newDislikes: extracted.dislikes || [],
      userLikes: updatedLikes,
      userDislikes: updatedDislikes,
    });
  } catch (error) {
    console.error('Error analyzing preferences:', error);
    return NextResponse.json(
      { error: 'Failed to analyze preferences' },
      { status: 500 }
    );
  }
}
```

---

## 4. Chat Integration

### Chat Orchestrator

**File:** `src/lib/agents/client/chatOrchestrator.ts`

The main orchestration engine that coordinates LLM calls, tool execution, and response generation:

```typescript
import { parseJsonFromText } from '@/lib/ai/gemini';
import { callChatLlm } from '@/lib/ai/chatLlmClient';
import { TOOL_DEFINITIONS, createClientToolRegistry, hasNLParameter, getNLParamInfo } from '@/lib/tools/agentTools';
import { AgentContext, ToolCall, ToolResult } from './types';
import { AudioMetadata } from '@/types/audio';
import { JsonValue } from '@/lib/agents/behaviorAgent/types';
import { runToolCall } from './toolRunner';
import { generateVariations, ToolOptionVariation } from './generateVariations';
import { PatternObservation } from '@/lib/agents/historyAgent/types';

type SatisfactionCheck = {
  satisfied: boolean;
  response?: string;
};

export type ToolOptionsPreview = {
  toolName: string;
  paramName: string;
  originalIntent: string;
  variations: ToolOptionVariation[];
  pendingToolCall: ToolCall;
  pendingPlan: ToolCall[];
};

type ChatOrchestratorInput = {
  message: string;
  knownClipIds: string[];
  context: AgentContext;
  toolResults?: ToolResult[];
  onAudioCreated?: (audio: AudioMetadata) => void;
  onTimelineChanged?: () => void | Promise<void>;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  showToolOptionsPreview?: boolean;
  patternNotifications?: PatternObservation[];
  resumeWithSelection?: {
    toolCall: ToolCall;
    selectedValue: string;
    pendingPlan: ToolCall[];
  };
};

type ChatOrchestratorOutput = {
  response: string;
  toolResults: ToolResult[];
  toolOptionsPreview?: ToolOptionsPreview;
  isPaused?: boolean;
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

  // Handle resumption with selected value
  if (input.resumeWithSelection) {
    const { toolCall, selectedValue, pendingPlan } = input.resumeWithSelection;
    const nlInfo = getNLParamInfo(toolCall.tool);

    if (nlInfo) {
      // Update the tool call with the selected value
      const updatedToolCall: ToolCall = {
        ...toolCall,
        args: {
          ...toolCall.args,
          [nlInfo.paramName]: selectedValue,
        },
      };

      // Execute with the updated plan
      return executeToolPlan(
        [updatedToolCall, ...pendingPlan],
        tools,
        input,
        conversation,
        toolList
      );
    }
  }

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
    ].join('\n'),
    { agent: 'chat' }
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

  // Check if we should show tool options preview for the first NL tool in the plan
  if (input.showToolOptionsPreview && plan.length > 0) {
    const firstNLToolIndex = plan.findIndex(call => hasNLParameter(call.tool));
    if (firstNLToolIndex !== -1) {
      const nlToolCall = plan[firstNLToolIndex];
      const nlInfo = getNLParamInfo(nlToolCall.tool);

      if (nlInfo) {
        const originalValue = String(nlToolCall.args?.[nlInfo.paramName] ?? '');
        if (originalValue) {
          console.log('[ChatOrchestrator] Generating variations for:', nlToolCall.tool, nlInfo.paramName);

          const variations = await generateVariations(nlToolCall, input.message, conversation);

          // Return paused state with variations
          return {
            response: '',
            toolResults: [],
            isPaused: true,
            toolOptionsPreview: {
              toolName: nlToolCall.tool,
              paramName: nlInfo.paramName,
              originalIntent: input.message,
              variations,
              pendingToolCall: nlToolCall,
              pendingPlan: plan.slice(firstNLToolIndex + 1),
            },
          };
        }
      }
    }
  }

  // Execute the plan normally
  return executeToolPlan(plan, tools, input, conversation, toolList);
}

// Extracted execution logic for reuse in normal and resumed execution
async function executeToolPlan(
  initialPlan: ToolCall[],
  tools: ReturnType<typeof createClientToolRegistry>,
  input: ChatOrchestratorInput,
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
  toolList: string
): Promise<ChatOrchestratorOutput> {
  const toolResults: ToolResult[] = input.toolResults ?? [];
  let satisfied = false;
  let finalResponse = '';
  let timelineChanged = false;

  // Define read-only tools (these are prerequisites, not final actions)
  const readOnlyTools = ['summarize_timeline', 'list_clips', 'list_audio', 'list_uploaded_videos'];

  // Re-planning loop (max 3 iterations to prevent infinite loops)
  let currentPlan = initialPlan;
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
        const satisfactionPromptParts = [
          'Check if the user request was fulfilled.',
          'IMPORTANT: Respond with ONLY JSON: {"satisfied":true,"response":"..."} or {"satisfied":false}',
          '',
          `User request: ${input.message}`,
          `Conversation context: ${JSON.stringify(conversation.slice(-6))}`,
          `Actions performed: ${JSON.stringify(toolResults)}`,
        ];

        // Include pattern notifications in satisfaction check
        if (input.patternNotifications && input.patternNotifications.length > 0) {
          satisfactionPromptParts.push('');
          satisfactionPromptParts.push('=== Workflow Observations ===');
          for (const notification of input.patternNotifications) {
            satisfactionPromptParts.push(`- ${notification.title}: ${notification.description}`);
            if (notification.suggestion) {
              satisfactionPromptParts.push(`  Tip: ${notification.suggestion}`);
            }
          }
          satisfactionPromptParts.push('');
          satisfactionPromptParts.push('If the response mentions completing an action, you may naturally include a relevant workflow tip.');
        }

        satisfactionPromptParts.push('');
        satisfactionPromptParts.push('IMPORTANT: The user request is NOT fulfilled if:');
        satisfactionPromptParts.push('- User asked to remove/delete something but no remove action was performed');
        satisfactionPromptParts.push('- User asked to add something but no add action was performed');
        satisfactionPromptParts.push('- User asked to move something but no move action was performed');
        satisfactionPromptParts.push('- Only list/summarize actions were performed for a modification request');
        satisfactionPromptParts.push('');
        satisfactionPromptParts.push('If satisfied, write a brief response describing what was done.');

        const satisfactionText = await callChatLlm(
          satisfactionPromptParts.join('\n'),
          { agent: 'chat' }
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
          ].join('\n'),
          { agent: 'chat' }
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

    // Include pattern notifications if available
    if (input.patternNotifications && input.patternNotifications.length > 0) {
      promptParts.push('');
      promptParts.push('=== Workflow Observations ===');
      promptParts.push('The following patterns were detected in the user\'s editing workflow:');
      for (const notification of input.patternNotifications) {
        promptParts.push(`- ${notification.title}: ${notification.description}`);
        if (notification.suggestion) {
          promptParts.push(`  Tip: ${notification.suggestion}`);
        }
      }
      promptParts.push('');
      promptParts.push('If relevant to the user\'s question, naturally mention these observations.');
      promptParts.push('Only mention insights that are genuinely helpful. Don\'t force them into the response.');
    }

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
      finalResponse = await callChatLlm(promptParts.join('\n'), { agent: 'chat' });
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
    await input.onTimelineChanged();
  }

  return {
    response: finalResponse || 'Unable to generate a response.',
    toolResults,
  };
}
```

### useChatAgent Hook

**File:** `src/hooks/useChatAgent.ts`

The main React hook that integrates chat, tool execution, and history tracking:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runChatOrchestrator, ToolOptionsPreview } from '@/lib/agents/client/chatOrchestrator';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { ToolCall } from '@/lib/agents/client/types';
import { useHistoryAgent } from './useHistoryAgent';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createLLMBatchCommand } from '@/lib/commands';

export type ToolOptionsData = ToolOptionsPreview;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool_options';
  content: string;
  feedback?: 'like' | 'dislike';
  toolOptions?: ToolOptionsData;
};

type PendingSelection = {
  toolCall: ToolCall;
  pendingPlan: ToolCall[];
  originalMessage: string;
  toolName: string;
  paramName: string;
  originalIntent: string;
};

function generateId(): string {
  return crypto.randomUUID();
}

export function useChatAgent(
  clips: VideoReference[],
  audioClips: VideoReference[],
  onAudioCreated?: (audio: AudioMetadata) => void,
  onTimelineChanged?: () => void | Promise<void>
) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: generateId(),
      role: 'assistant',
      content: 'Ask me about your timeline, clips, or what to do next.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showToolOptionsPreview, setShowToolOptionsPreview] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [isRunningFullAnalysis, setIsRunningFullAnalysis] = useState(false);

  const {
    analysis: historyAnalysis,
    isAnalyzing: isAnalyzingHistory,
    analyze: analyzeHistory,
    consumeNotifications,
  } = useHistoryAgent();

  const clipsRef = useRef(clips);
  const audioRef = useRef(audioClips);
  const onAudioCreatedRef = useRef(onAudioCreated);
  const onTimelineChangedRef = useRef(onTimelineChanged);

  clipsRef.current = clips;
  audioRef.current = audioClips;
  onAudioCreatedRef.current = onAudioCreated;
  onTimelineChangedRef.current = onTimelineChanged;

  useEffect(() => {
    fetch('/api/preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.showToolOptionsPreview !== undefined) {
          setShowToolOptionsPreview(data.showToolOptionsPreview);
        }
      })
      .catch(() => {});
  }, []);

  const knownClipIds = useMemo(
    () => clips.map((clip) => clip.videoId ?? clip.id),
    [clips]
  );

  const handleEditTracked = useCallback(async (original: string, edited: string) => {
    if (!pendingSelection) return;

    await fetch('/api/tool-edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: pendingSelection.toolName,
        paramName: pendingSelection.paramName,
        originalValue: original,
        editedValue: edited,
        userContext: pendingSelection.originalIntent,
      }),
    });
  }, [pendingSelection]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');

    const conversationMessages = [...messages, userMessage]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const patternNotifications = consumeNotifications();

    // Capture state BEFORE LLM execution (deep copy)
    const beforeClips = JSON.parse(JSON.stringify(useTimelineStore.getState().clips));
    const beforeAudioLayers = JSON.parse(JSON.stringify(useAudioTimelineStore.getState().audioLayers));

    try {
      const result = await runChatOrchestrator({
        message: trimmed,
        knownClipIds,
        context: {
          clips: clipsRef.current,
          audioClips: audioRef.current,
        },
        onAudioCreated: onAudioCreatedRef.current,
        onTimelineChanged: onTimelineChangedRef.current,
        conversation: conversationMessages,
        showToolOptionsPreview,
        patternNotifications,
      });

      // After orchestrator completes (refetch awaited inside), capture AFTER state
      const afterClips = useTimelineStore.getState().clips;
      const afterAudioLayers = useAudioTimelineStore.getState().audioLayers;

      // Check if timeline changed
      const clipsChanged = JSON.stringify(beforeClips) !== JSON.stringify(afterClips);
      const audioChanged = JSON.stringify(beforeAudioLayers) !== JSON.stringify(afterAudioLayers);

      if (clipsChanged || audioChanged) {
        const batchCommand = createLLMBatchCommand({
          description: `AI: ${trimmed.slice(0, 40)}${trimmed.length > 40 ? '...' : ''}`,
          beforeClips,
          afterClips: JSON.parse(JSON.stringify(afterClips)),
          beforeAudioLayers,
          afterAudioLayers: JSON.parse(JSON.stringify(afterAudioLayers)),
        });
        useHistoryStore.getState().addWithoutExecute(batchCommand);
      }

      if (result.isPaused && result.toolOptionsPreview) {
        setPendingSelection({
          toolCall: result.toolOptionsPreview.pendingToolCall,
          pendingPlan: result.toolOptionsPreview.pendingPlan,
          originalMessage: trimmed,
          toolName: result.toolOptionsPreview.toolName,
          paramName: result.toolOptionsPreview.paramName,
          originalIntent: result.toolOptionsPreview.originalIntent,
        });

        setMessages((current) => [
          ...current,
          {
            id: generateId(),
            role: 'tool_options',
            content: '',
            toolOptions: result.toolOptionsPreview,
          },
        ]);
      } else {
        const assistantContent = result.response || 'Unable to generate a response.';
        setMessages((current) => [
          ...current,
          {
            id: generateId(),
            role: 'assistant',
            content: assistantContent,
          },
        ]);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Failed to reach chat agent.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [
    input,
    isSending,
    messages,
    knownClipIds,
    showToolOptionsPreview,
    consumeNotifications,
  ]);

  const selectToolOption = useCallback(async (selectedValue: string) => {
    if (!pendingSelection || isSending) return;

    setIsSending(true);
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));

    const conversationMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Capture state BEFORE LLM execution (deep copy)
    const beforeClips = JSON.parse(JSON.stringify(useTimelineStore.getState().clips));
    const beforeAudioLayers = JSON.parse(JSON.stringify(useAudioTimelineStore.getState().audioLayers));

    try {
      const result = await runChatOrchestrator({
        message: pendingSelection.originalMessage,
        knownClipIds,
        context: {
          clips: clipsRef.current,
          audioClips: audioRef.current,
        },
        onAudioCreated: onAudioCreatedRef.current,
        onTimelineChanged: onTimelineChangedRef.current,
        conversation: conversationMessages,
        resumeWithSelection: {
          toolCall: pendingSelection.toolCall,
          selectedValue,
          pendingPlan: pendingSelection.pendingPlan,
        },
      });

      // After orchestrator completes (refetch awaited inside), capture AFTER state
      const afterClips = useTimelineStore.getState().clips;
      const afterAudioLayers = useAudioTimelineStore.getState().audioLayers;

      // Check if timeline changed
      const clipsChanged = JSON.stringify(beforeClips) !== JSON.stringify(afterClips);
      const audioChanged = JSON.stringify(beforeAudioLayers) !== JSON.stringify(afterAudioLayers);

      if (clipsChanged || audioChanged) {
        const batchCommand = createLLMBatchCommand({
          description: `AI: ${pendingSelection.originalMessage.slice(0, 40)}${pendingSelection.originalMessage.length > 40 ? '...' : ''}`,
          beforeClips,
          afterClips: JSON.parse(JSON.stringify(afterClips)),
          beforeAudioLayers,
          afterAudioLayers: JSON.parse(JSON.stringify(afterAudioLayers)),
        });
        useHistoryStore.getState().addWithoutExecute(batchCommand);
      }

      const assistantContent = result.response || 'Unable to generate a response.';
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: assistantContent,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Failed to complete selection.',
        },
      ]);
    } finally {
      setPendingSelection(null);
      setIsSending(false);
    }
  }, [pendingSelection, isSending, messages, knownClipIds]);

  const cancelToolOptions = useCallback(() => {
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));
    setMessages((current) => [
      ...current,
      {
        id: generateId(),
        role: 'assistant',
        content: 'Action cancelled. What would you like to do instead?',
      },
    ]);
    setPendingSelection(null);
  }, []);

  const markMessageFeedback = useCallback((messageId: string, feedback: 'like' | 'dislike') => {
    setMessages((current) =>
      current.map((m) => (m.id === messageId ? { ...m, feedback } : m))
    );
  }, []);

  const runFullAnalysis = useCallback(async () => {
    if (isRunningFullAnalysis || isAnalyzingHistory) return;

    setIsRunningFullAnalysis(true);

    try {
      // Build conversation for preference analysis
      const conversationMessages = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Run both analyses in parallel
      await Promise.all([
        analyzeHistory(),
        fetch('/api/preferences/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: conversationMessages }),
        }).catch((err) => console.error('Preference analysis failed:', err)),
      ]);
    } finally {
      setIsRunningFullAnalysis(false);
    }
  }, [isRunningFullAnalysis, isAnalyzingHistory, messages, analyzeHistory]);

  return {
    messages,
    input,
    setInput,
    isSending,
    sendMessage,
    selectToolOption,
    cancelToolOptions,
    hasPendingSelection: pendingSelection !== null,
    markMessageFeedback,
    historyAnalysis,
    isAnalyzingHistory,
    analyzeHistory,
    handleEditTracked,
    runFullAnalysis,
    isRunningFullAnalysis,
  };
}
```

### useHistoryAgent Hook

**File:** `src/hooks/useHistoryAgent.ts`

```typescript
import { useCallback, useRef, useState } from 'react';
import { useHistoryStore } from '@/stores/historyStore';
import { runHistoryAnalyzer } from '@/lib/agents/historyAgent/orchestrator';
import { HistoryAnalysis, PatternObservation } from '@/lib/agents/historyAgent/types';

export function useHistoryAgent() {
  const [analysis, setAnalysis] = useState<HistoryAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState<PatternObservation[]>([]);

  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;

  const getSerializableHistory = useHistoryStore((state) => state.getSerializableHistory);

  const handleNotify = useCallback((observation: PatternObservation) => {
    console.log('[useHistoryAgent] Received notification:', observation.title);
    setPendingNotifications((prev) => [...prev, observation]);
  }, []);

  const analyze = useCallback(async () => {
    if (isAnalyzing) {
      console.log('[useHistoryAgent] Analysis already in progress, skipping');
      return analysisRef.current;
    }

    setIsAnalyzing(true);
    console.log('[useHistoryAgent] Starting analysis...');

    try {
      const history = getSerializableHistory();
      const result = await runHistoryAnalyzer(history, analysisRef.current ?? undefined, handleNotify);
      setAnalysis(result);
      console.log('[useHistoryAgent] Analysis complete');
      return result;
    } catch (error) {
      console.error('[useHistoryAgent] Analysis failed:', error);
      return analysisRef.current;
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, getSerializableHistory, handleNotify]);

  const clearNotifications = useCallback(() => {
    setPendingNotifications([]);
  }, []);

  const consumeNotifications = useCallback(() => {
    const notifications = [...pendingNotifications];
    setPendingNotifications([]);
    return notifications;
  }, [pendingNotifications]);

  return {
    analysis,
    isAnalyzing,
    analyze,
    pendingNotifications,
    clearNotifications,
    consumeNotifications,
  };
}
```

---

## 5. User Preferences System

### Database Schema

**File:** `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Profile {
  id                     String   @id @db.Uuid
  sessionVideo           Json     @default("[]") @map("session_video")
  sessionAudio           Json     @default("[]") @map("session_audio")
  userLikes              String   @default("") @map("user_likes") @db.Text
  userDislikes           String   @default("") @map("user_dislikes") @db.Text
  showToolOptionsPreview Boolean  @default(false) @map("show_tool_options_preview")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  @@map("profiles")
}

model Video {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId             String   @map("user_id") @db.Uuid
  url                String
  fileName           String   @map("file_name")
  duration           Float?
  createdAt          DateTime @default(now()) @map("created_at")
  twelveLabsId       String?  @map("twelve_labs_id")
  twelveLabsTaskId   String?  @map("twelve_labs_task_id")
  twelveLabsStatus   String?  @map("twelve_labs_status")
  summary            String?  @db.Text
  audioId            String?  @unique @map("audio_id") @db.Uuid
  audio              Audio?   @relation(fields: [audioId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@map("videos")
}

model Audio {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  url       String
  fileName  String   @map("file_name")
  duration  Float?
  fileSize  BigInt?  @map("file_size")
  createdAt DateTime @default(now()) @map("created_at")
  video     Video?

  @@index([userId])
  @@map("audio")
}

model MessageFeedback {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  feedbackType   String   @map("feedback_type")
  messageContent String   @map("message_content") @db.Text
  feedbackText   String?  @map("feedback_text") @db.Text
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("message_feedback")
}

model ToolEditHistory {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String   @map("user_id") @db.Uuid
  toolName      String   @map("tool_name")
  paramName     String   @map("param_name")
  originalValue String   @map("original_value") @db.Text
  editedValue   String   @map("edited_value") @db.Text
  userContext   String?  @map("user_context") @db.Text
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("tool_edit_history")
}
```

### Preferences API

**File:** `src/app/api/preferences/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET: Fetch user preferences (likes and dislikes)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { userLikes: true, userDislikes: true, showToolOptionsPreview: true },
    });

    // Create profile if it doesn't exist
    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          id: user.id,
          sessionVideo: [],
          sessionAudio: [],
          userLikes: '',
          userDislikes: '',
          showToolOptionsPreview: false,
        },
        select: { userLikes: true, userDislikes: true, showToolOptionsPreview: true },
      });
    }

    return NextResponse.json({
      userLikes: profile.userLikes,
      userDislikes: profile.userDislikes,
      showToolOptionsPreview: profile.showToolOptionsPreview,
    });
  } catch (error) {
    console.error('[Preferences GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

// POST: Update user preferences
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { userLikes, userDislikes, showToolOptionsPreview } = body;

  const updateData: { userLikes?: string; userDislikes?: string; showToolOptionsPreview?: boolean } = {};
  if (userLikes !== undefined) {
    updateData.userLikes = String(userLikes);
  }
  if (userDislikes !== undefined) {
    updateData.userDislikes = String(userDislikes);
  }
  if (showToolOptionsPreview !== undefined) {
    updateData.showToolOptionsPreview = Boolean(showToolOptionsPreview);
  }

  await prisma.profile.upsert({
    where: { id: user.id },
    update: updateData,
    create: {
      id: user.id,
      sessionVideo: [],
      sessionAudio: [],
      userLikes: userLikes ?? '',
      userDislikes: userDislikes ?? '',
      showToolOptionsPreview: showToolOptionsPreview ?? false,
    },
  });

  return NextResponse.json({ success: true });
}
```

### Extending User Preferences: Adding User Name Personalization

To add user name personalization to the system, follow these steps:

#### Step 1: Update Database Schema

Add a `userName` field to the Profile model in `prisma/schema.prisma`:

```prisma
model Profile {
  id                     String   @id @db.Uuid
  sessionVideo           Json     @default("[]") @map("session_video")
  sessionAudio           Json     @default("[]") @map("session_audio")
  userLikes              String   @default("") @map("user_likes") @db.Text
  userDislikes           String   @default("") @map("user_dislikes") @db.Text
  showToolOptionsPreview Boolean  @default(false) @map("show_tool_options_preview")
  userName               String?  @map("user_name")  // NEW FIELD
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  @@map("profiles")
}
```

Then run:
```bash
npx prisma migrate dev --name add_user_name
```

#### Step 2: Update Preferences API

Modify `src/app/api/preferences/route.ts`:

```typescript
// GET: Add userName to the select
let profile = await prisma.profile.findUnique({
  where: { id: user.id },
  select: {
    userLikes: true,
    userDislikes: true,
    showToolOptionsPreview: true,
    userName: true,  // NEW
  },
});

// Return userName in response
return NextResponse.json({
  userLikes: profile.userLikes,
  userDislikes: profile.userDislikes,
  showToolOptionsPreview: profile.showToolOptionsPreview,
  userName: profile.userName,  // NEW
});

// POST: Handle userName updates
const { userLikes, userDislikes, showToolOptionsPreview, userName } = body;

const updateData: {
  userLikes?: string;
  userDislikes?: string;
  showToolOptionsPreview?: boolean;
  userName?: string;  // NEW
} = {};

if (userName !== undefined) {
  updateData.userName = String(userName);
}
```

#### Step 3: Inject User Context into Chat Orchestrator

Modify the chat orchestrator to include user preferences in prompts. Update `src/lib/agents/client/chatOrchestrator.ts`:

```typescript
type ChatOrchestratorInput = {
  message: string;
  knownClipIds: string[];
  context: AgentContext;
  toolResults?: ToolResult[];
  onAudioCreated?: (audio: AudioMetadata) => void;
  onTimelineChanged?: () => void | Promise<void>;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  showToolOptionsPreview?: boolean;
  patternNotifications?: PatternObservation[];
  resumeWithSelection?: { /* ... */ };
  // NEW: User preferences for personalization
  userPreferences?: {
    userName?: string;
    likes?: string;
    dislikes?: string;
  };
};

// In the response generation prompts, add personalization:
const promptParts = [
  'You are a helpful video editor assistant.',
  'Respond naturally in 1-2 sentences.',
  '',
];

// Add user personalization
if (input.userPreferences?.userName) {
  promptParts.push(`The user's name is ${input.userPreferences.userName}. Address them by name occasionally for a personal touch.`);
}

if (input.userPreferences?.likes) {
  promptParts.push(`User preferences (likes): ${input.userPreferences.likes}`);
}

if (input.userPreferences?.dislikes) {
  promptParts.push(`User preferences (avoid): ${input.userPreferences.dislikes}`);
}

promptParts.push('');
promptParts.push(`User said: ${input.message}`);
```

#### Step 4: Update useChatAgent Hook

Fetch and pass user preferences:

```typescript
export function useChatAgent(/* ... */) {
  // ... existing state
  const [userPreferences, setUserPreferences] = useState<{
    userName?: string;
    likes?: string;
    dislikes?: string;
  }>({});

  // Fetch preferences on mount
  useEffect(() => {
    fetch('/api/preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.showToolOptionsPreview !== undefined) {
          setShowToolOptionsPreview(data.showToolOptionsPreview);
        }
        setUserPreferences({
          userName: data.userName,
          likes: data.userLikes,
          dislikes: data.userDislikes,
        });
      })
      .catch(() => {});
  }, []);

  // Pass to orchestrator
  const result = await runChatOrchestrator({
    message: trimmed,
    knownClipIds,
    context: { /* ... */ },
    // ... other props
    userPreferences,  // NEW
  });
}
```

#### Example: Personalized Response

With user name set to "Alex" and likes including "smooth transitions", the LLM might respond:

> "Done, Alex! I've added a smooth fade transition between those clips - just the way you like it."

---

## 6. Quick Reference

### File Locations

| Component | File Path |
|-----------|-----------|
| LLM Service | `src/lib/ai/llmService.ts` |
| Gemini Integration | `src/lib/ai/gemini.ts` |
| Cerebras Integration | `src/lib/ai/cerebras.ts` |
| Client LLM Wrapper | `src/lib/ai/chatLlmClient.ts` |
| History Types | `src/lib/agents/historyAgent/types.ts` |
| History Serializer | `src/lib/agents/historyAgent/serializer.ts` |
| History Orchestrator | `src/lib/agents/historyAgent/orchestrator.ts` |
| Preference Analysis API | `src/app/api/preferences/analyze/route.ts` |
| Preferences API | `src/app/api/preferences/route.ts` |
| Chat Orchestrator | `src/lib/agents/client/chatOrchestrator.ts` |
| useChatAgent Hook | `src/hooks/useChatAgent.ts` |
| useHistoryAgent Hook | `src/hooks/useHistoryAgent.ts` |
| Database Schema | `prisma/schema.prisma` |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | One of Gemini/Cerebras |
| `GEMINI_MODEL` | Gemini model (default: `gemini-1.5-flash`) | No |
| `CEREBRAS_API_KEY` | Cerebras API key | One of Gemini/Cerebras |
| `CEREBRAS_API_KEY_1` | Cerebras backup key 1 | No |
| `CEREBRAS_API_KEY_2` | Cerebras backup key 2 | No |
| `CEREBRAS_MODEL` | Cerebras model (default: `llama-3.3-70b`) | No |
| `CEREBRAS_MODEL_CHAT` | Model for chat agent | No |
| `CEREBRAS_MODEL_BEHAVIOR` | Model for behavior agent | No |
| `LLM_PROVIDER` | Default provider (`gemini`/`cerebras`) | No |
| `LLM_PROVIDER_CHAT` | Provider for chat agent | No |
| `LLM_PROVIDER_BEHAVIOR` | Provider for behavior agent | No |

### Key Type Definitions

```typescript
// LLM Types
type LLMProvider = 'gemini' | 'cerebras';
type LLMAgent = 'chat' | 'behavior';

// History Analysis Types
type PatternObservationType = 'repetitive' | 'workflow' | 'efficiency' | 'suggestion';
type WorkflowPhase = 'setup' | 'editing' | 'refinement' | 'export';

// Chat Types
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool_options';
  content: string;
  feedback?: 'like' | 'dislike';
  toolOptions?: ToolOptionsData;
};

// Preference Types
type ExtractedPreferences = {
  likes: string[];
  dislikes: string[];
};
```

---

## Summary

This document covers the complete analysis and LLM infrastructure in Stitch:

1. **Multi-provider LLM system** with automatic fallback between Gemini and Cerebras
2. **History analysis** for detecting workflow patterns and providing suggestions
3. **Preference extraction** from conversations and feedback using LLM
4. **Chat orchestration** with tool planning, execution, and natural language responses
5. **React hooks** for seamless frontend integration
6. **Extension guide** for adding new user preference fields like user name personalization

The system is designed to be modular and extensible, allowing new LLM providers, analysis types, and user preferences to be added with minimal changes to existing code.
