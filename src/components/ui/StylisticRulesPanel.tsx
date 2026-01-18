'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, ToggleLeft, ToggleRight, Loader2, Sparkles } from 'lucide-react';

type StylisticRule = {
  id: string;
  toolName: string;
  paramName: string;
  ruleType: string;
  pattern: string;
  replacement?: string | null;
  description: string;
  occurrences: number;
  isActive: boolean;
  createdAt: string;
};

const RULE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  addition: { label: 'Addition', color: 'text-green-400' },
  replacement: { label: 'Replacement', color: 'text-blue-400' },
  style: { label: 'Style', color: 'text-purple-400' },
};

export function StylisticRulesPanel() {
  const [rules, setRules] = useState<StylisticRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const response = await fetch('/api/stylistic-rules');
      if (response.ok) {
        const data = await response.json();
        setRules(data.rules || []);
      }
    } catch (error) {
      console.error('Failed to fetch stylistic rules:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch('/api/stylistic-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive }),
      });

      if (response.ok) {
        const data = await response.json();
        setRules((prev) =>
          prev.map((r) => (r.id === id ? data.rule : r))
        );
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const response = await fetch(`/api/stylistic-rules?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleAnalyzeEdits = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/stylistic-rules/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        // Refresh the rules list
        await fetchRules();
      }
    } catch (error) {
      console.error('Failed to analyze edits:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRuleTypeInfo = (ruleType: string) => {
    return RULE_TYPE_LABELS[ruleType] || { label: ruleType, color: 'text-gray-400' };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Learned patterns from your tool option edits
        </p>
        <button
          onClick={handleAnalyzeEdits}
          disabled={isAnalyzing}
          className="flex items-center gap-1 px-2 py-1 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded transition-colors"
        >
          {isAnalyzing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Analyze
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Rules become active automatically after 3+ similar edits. Active rules influence future variations.
      </p>

      {/* Rules list */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {rules.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No rules learned yet. Edit tool options to train patterns.
          </p>
        ) : (
          rules.map((rule) => {
            const typeInfo = getRuleTypeInfo(rule.ruleType);

            return (
              <div
                key={rule.id}
                className={`group bg-gray-700/50 rounded-lg p-3 ${
                  !rule.isActive ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {rule.toolName} / {rule.paramName}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({rule.occurrences} occurrence{rule.occurrences !== 1 ? 's' : ''})
                      </span>
                      {!rule.isActive && rule.occurrences < 3 && (
                        <span className="text-xs text-yellow-500">
                          {3 - rule.occurrences} more to activate
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-200 break-words">
                      {rule.description}
                    </p>
                    {rule.ruleType === 'replacement' && rule.replacement && (
                      <p className="text-xs text-gray-400 mt-1">
                        &quot;{rule.pattern}&quot; → &quot;{rule.replacement}&quot;
                      </p>
                    )}
                    {rule.ruleType === 'addition' && (
                      <p className="text-xs text-gray-400 mt-1">
                        Adds: &quot;{rule.pattern}&quot;
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(rule.id, !rule.isActive)}
                      className={`p-1 rounded transition-colors ${
                        rule.isActive
                          ? 'text-green-400 hover:text-green-300'
                          : 'text-gray-500 hover:text-gray-400'
                      }`}
                      title={rule.isActive ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.isActive ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 text-gray-400 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
