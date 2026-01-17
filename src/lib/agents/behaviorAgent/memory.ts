import { BehaviorState, EventRecord, MemoryState } from './types';

const DEFAULT_BEHAVIOR: BehaviorState = {
  summary: 'No activity yet.',
  eventCounts: {},
  phase: 'unknown',
};

export function createMemory(): MemoryState {
  return {
    lastIndex: -1,
    summary: 'Empty session.',
    behaviorState: DEFAULT_BEHAVIOR,
  };
}

export function ingestNewEvents(
  events: EventRecord[],
  memory: MemoryState
): { memory: MemoryState; newEvents: EventRecord[] } {
  const startIndex = Math.min(memory.lastIndex + 1, events.length);
  const newEvents = events.slice(startIndex);

  return {
    memory: {
      ...memory,
      lastIndex: events.length - 1,
    },
    newEvents,
  };
}
