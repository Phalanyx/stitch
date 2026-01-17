import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';
import { BehaviorState, EventRecord, MemoryState } from './types';

const EDITING_EVENTS = new Set(['clip_added', 'clip_removed', 'clip_moved', 'clip_trimmed']);
const PREVIEW_EVENTS = new Set(['preview_play', 'preview_pause', 'preview_seek']);
const EXPORT_EVENTS = new Set(['export_started', 'export_completed', 'export_failed']);

function nextPhase(events: EventRecord[], fallback: BehaviorState['phase']): BehaviorState['phase'] {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = events[i]?.type;
    if (EXPORT_EVENTS.has(type)) return 'exporting';
    if (PREVIEW_EVENTS.has(type)) return 'previewing';
    if (EDITING_EVENTS.has(type)) return 'editing';
  }
  return fallback ?? 'unknown';
}

export async function interpretBehavior(
  newEvents: EventRecord[],
  memory: MemoryState
): Promise<BehaviorState> {
  const eventCounts = { ...memory.behaviorState.eventCounts };
  let lastEventType = memory.behaviorState.lastEventType;

  for (const event of newEvents) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    lastEventType = event.type;
  }

  const fallbackPhase = nextPhase(newEvents, memory.behaviorState.phase);
  const fallbackSummary = lastEventType
    ? `Last action: ${lastEventType}.`
    : memory.behaviorState.summary;

  const aiText = await callGeminiText(
    [
      'You interpret user behavior in a video editor.',
      'Return JSON only: {"phase":"editing|previewing|exporting|idle|unknown","summary":"..."}',
      `Previous summary: ${memory.behaviorState.summary}`,
      `Event counts: ${JSON.stringify(eventCounts)}`,
      `New events: ${JSON.stringify(newEvents)}`,
    ].join('\n')
  );

  const aiResult = parseJsonFromText<{ phase?: BehaviorState['phase']; summary?: string }>(aiText);
  const phase = aiResult?.phase ?? fallbackPhase;
  const summary = aiResult?.summary ?? fallbackSummary;

  return {
    summary,
    lastEventType,
    eventCounts,
    phase,
  };
}
