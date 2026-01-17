import { useCallback, useRef, useState } from 'react';
import { createMemory } from '@/lib/agents/behaviorAgent/memory';
import { EventRecord, MemoryState, OrchestratorOutput } from '@/lib/agents/behaviorAgent/types';
import { runBehaviorAgentClient } from '@/lib/agents/client/behaviorAgent';
import { VideoReference } from '@/types/video';

export function useBehaviorAgent(clips: VideoReference[], audioClips: VideoReference[]) {
  const memoryRef = useRef<MemoryState>(createMemory());
  const [lastOutput, setLastOutput] = useState<OrchestratorOutput | null>(null);

  const runAgent = useCallback(
    async (events: EventRecord[], prompt?: string) => {
      const output = await runBehaviorAgentClient({
        events,
        memory: memoryRef.current,
        prompt,
        context: { clips, audioClips },
      });
      memoryRef.current = output.memory;
      setLastOutput(output);
      return output;
    },
    [audioClips, clips]
  );

  return {
    runAgent,
    lastOutput,
  };
}
