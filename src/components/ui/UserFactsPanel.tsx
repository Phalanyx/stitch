'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react';

type UserFact = {
  id: string;
  category: string;
  content: string;
  source: string;
  confidence: number;
  isActive: boolean;
  createdAt: string;
};

const CATEGORIES = [
  { value: 'preference', label: 'Preference', color: 'text-blue-400' },
  { value: 'project', label: 'Project', color: 'text-green-400' },
  { value: 'brand', label: 'Brand', color: 'text-purple-400' },
  { value: 'workflow', label: 'Workflow', color: 'text-orange-400' },
];

export function UserFactsPanel() {
  const [facts, setFacts] = useState<UserFact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newFact, setNewFact] = useState({ category: 'preference', content: '' });
  const [editFact, setEditFact] = useState({ category: '', content: '' });

  const fetchFacts = useCallback(async () => {
    try {
      const response = await fetch('/api/user-facts');
      if (response.ok) {
        const data = await response.json();
        setFacts(data.facts || []);
      }
    } catch (error) {
      console.error('Failed to fetch user facts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFacts();
  }, [fetchFacts]);

  const handleAddFact = async () => {
    if (!newFact.content.trim()) return;

    try {
      const response = await fetch('/api/user-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newFact.category,
          content: newFact.content.trim(),
          source: 'manual',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFacts((prev) => [data.fact, ...prev]);
        setNewFact({ category: 'preference', content: '' });
        setIsAdding(false);
      }
    } catch (error) {
      console.error('Failed to add fact:', error);
    }
  };

  const handleUpdateFact = async (id: string) => {
    try {
      const response = await fetch('/api/user-facts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          category: editFact.category,
          content: editFact.content.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFacts((prev) =>
          prev.map((f) => (f.id === id ? data.fact : f))
        );
        setEditingId(null);
      }
    } catch (error) {
      console.error('Failed to update fact:', error);
    }
  };

  const handleDeleteFact = async (id: string) => {
    try {
      const response = await fetch(`/api/user-facts?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFacts((prev) => prev.filter((f) => f.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete fact:', error);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch('/api/user-facts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive }),
      });

      if (response.ok) {
        const data = await response.json();
        setFacts((prev) =>
          prev.map((f) => (f.id === id ? data.fact : f))
        );
      }
    } catch (error) {
      console.error('Failed to toggle fact:', error);
    }
  };

  const startEditing = (fact: UserFact) => {
    setEditingId(fact.id);
    setEditFact({ category: fact.category, content: fact.content });
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORIES.find((c) => c.value === category) || CATEGORIES[0];
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
          Facts about you that personalize the assistant&apos;s responses
        </p>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 px-2 py-1 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Add new fact form */}
      {isAdding && (
        <div className="bg-gray-700/50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={newFact.category}
              onChange={(e) => setNewFact((prev) => ({ ...prev, category: e.target.value }))}
              className="bg-gray-700 text-gray-100 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-sky-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newFact.content}
              onChange={(e) => setNewFact((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Enter a fact about yourself..."
              className="flex-1 bg-gray-700 text-gray-100 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-sky-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddFact();
                if (e.key === 'Escape') setIsAdding(false);
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsAdding(false)}
              className="px-2 py-1 text-sm bg-gray-600 hover:bg-gray-500 text-gray-200 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddFact}
              disabled={!newFact.content.trim()}
              className="px-2 py-1 text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Facts list */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {facts.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No facts yet. Add some to personalize your experience.
          </p>
        ) : (
          facts.map((fact) => {
            const categoryInfo = getCategoryInfo(fact.category);

            return (
              <div
                key={fact.id}
                className={`group bg-gray-700/50 rounded-lg p-3 ${
                  !fact.isActive ? 'opacity-50' : ''
                }`}
              >
                {editingId === fact.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={editFact.category}
                        onChange={(e) =>
                          setEditFact((prev) => ({ ...prev, category: e.target.value }))
                        }
                        className="bg-gray-700 text-gray-100 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-sky-500"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editFact.content}
                        onChange={(e) =>
                          setEditFact((prev) => ({ ...prev, content: e.target.value }))
                        }
                        className="flex-1 bg-gray-700 text-gray-100 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-sky-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateFact(fact.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-gray-400 hover:text-gray-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUpdateFact(fact.id)}
                        className="p-1 text-green-400 hover:text-green-300"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-medium ${categoryInfo.color}`}
                        >
                          {categoryInfo.label}
                        </span>
                        {fact.source !== 'manual' && (
                          <span className="text-xs text-gray-500">
                            (auto)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-200 break-words">
                        {fact.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleActive(fact.id, !fact.isActive)}
                        className={`p-1 rounded transition-colors ${
                          fact.isActive
                            ? 'text-green-400 hover:text-green-300'
                            : 'text-gray-500 hover:text-gray-400'
                        }`}
                        title={fact.isActive ? 'Disable' : 'Enable'}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEditing(fact)}
                        className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFact(fact.id)}
                        className="p-1 text-gray-400 hover:text-red-400 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
