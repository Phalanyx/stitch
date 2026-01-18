'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { ToolOptionsData } from '@/hooks/useChatAgent';

interface ToolOptionsSelectorProps {
  toolOptions: ToolOptionsData;
  onSelect: (value: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function ToolOptionsSelector({
  toolOptions,
  onSelect,
  onCancel,
  disabled = false,
}: ToolOptionsSelectorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [customValue, setCustomValue] = useState('');

  const handleStartEdit = (id: string, currentValue: string) => {
    setEditingId(id);
    setEditValue(currentValue);
  };

  const handleConfirmEdit = () => {
    if (editValue.trim()) {
      onSelect(editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleCustomSubmit = () => {
    if (customValue.trim()) {
      onSelect(customValue.trim());
      setCustomValue('');
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3 space-y-3">
      <div className="text-xs text-gray-400 mb-2">
        Choose an option or write your own:
      </div>

      {/* Variation options */}
      <div className="space-y-2">
        {toolOptions.variations.map((variation) => (
          <div key={variation.id} className="group">
            {editingId === variation.id ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmEdit();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  className="flex-1 bg-gray-700 text-gray-100 text-sm px-2 py-1.5 rounded border border-sky-500 focus:outline-none"
                  autoFocus
                  disabled={disabled}
                />
                <button
                  onClick={handleConfirmEdit}
                  disabled={disabled || !editValue.trim()}
                  className="p-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded"
                  title="Confirm"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={disabled}
                  className="p-1.5 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 rounded"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <button
                  onClick={() => onSelect(variation.value)}
                  disabled={disabled}
                  className="flex-1 text-left bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-gray-700 rounded px-3 py-2 transition-colors"
                >
                  <div className="text-sm text-gray-100">{variation.value}</div>
                  {variation.description && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {variation.description}
                    </div>
                  )}
                </button>
                <button
                  onClick={() => handleStartEdit(variation.id, variation.value)}
                  disabled={disabled}
                  className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-600 disabled:opacity-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit this option"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Custom value input */}
      <div className="border-t border-gray-700 pt-3">
        <div className="text-xs text-gray-400 mb-2">Or write your own:</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomSubmit();
            }}
            placeholder={`Custom ${toolOptions.paramName}...`}
            className="flex-1 bg-gray-700 text-gray-100 text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-sky-500"
            disabled={disabled}
          />
          <button
            onClick={handleCustomSubmit}
            disabled={disabled || !customValue.trim()}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:hover:bg-sky-600 text-white text-sm rounded transition-colors"
          >
            Use
          </button>
        </div>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        disabled={disabled}
        className="w-full mt-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-sm rounded transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
