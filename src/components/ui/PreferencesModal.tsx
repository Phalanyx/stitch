'use client';

import { useState, useEffect } from 'react';
import { X, Heart, HeartOff, Loader2, Settings2 } from 'lucide-react';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PreferencesModal({ isOpen, onClose }: PreferencesModalProps) {
  const [likes, setLikes] = useState('');
  const [dislikes, setDislikes] = useState('');
  const [showToolOptionsPreview, setShowToolOptionsPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch('/api/preferences')
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          if (data.error) {
            throw new Error(data.error);
          }
          setLikes(data.userLikes || '');
          setDislikes(data.userDislikes || '');
          setShowToolOptionsPreview(data.showToolOptionsPreview || false);
        })
        .catch((err) => {
          console.error('Failed to fetch preferences:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userLikes: likes,
          userDislikes: dislikes,
          showToolOptionsPreview,
        }),
      });
      if (response.ok) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center text-pink-400">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Editing Preferences</h3>
              <p className="text-sm text-gray-400">Your video editing style preferences</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-green-400 mb-2">
                  <Heart className="w-4 h-4" />
                  Likes
                </label>
                <textarea
                  value={likes}
                  onChange={(e) => setLikes(e.target.value)}
                  placeholder="e.g., smooth transitions, fast-paced edits, cinematic color grading..."
                  className="w-full h-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-red-400 mb-2">
                  <HeartOff className="w-4 h-4" />
                  Dislikes
                </label>
                <textarea
                  value={dislikes}
                  onChange={(e) => setDislikes(e.target.value)}
                  placeholder="e.g., abrupt cuts, shaky footage, overused effects..."
                  className="w-full h-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>

              {/* Tool Options Preview Toggle */}
              <div className="border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sky-400 flex-shrink-0">
                      <Settings2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Show tool options before executing
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Preview and choose from multiple query variations before search or generation runs
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showToolOptionsPreview}
                    onClick={() => setShowToolOptionsPreview(!showToolOptionsPreview)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                      showToolOptionsPreview ? 'bg-sky-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        showToolOptionsPreview ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-gray-700 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || isSaving}
              className="flex-1 px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
        </div>
      </div>
    </div>
  );
}
