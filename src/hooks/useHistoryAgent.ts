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
