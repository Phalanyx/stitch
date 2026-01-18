'use client';

import { useState, useEffect } from 'react';
import { X, Heart, HeartOff, Loader2 } from 'lucide-react';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PreferencesModal({ isOpen, onClose }: PreferencesModalProps) {
  const [likes, setLikes] = useState('');
  const [dislikes, setDislikes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch('/api/preferences')
        .then((res) => res.json())
        .then((data) => {
          setLikes(data.userLikes || '');
          setDislikes(data.userDislikes || '');
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
        body: JSON.stringify({ userLikes: likes, userDislikes: dislikes }),
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
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center text-pink-400">
            <Heart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Editing Preferences</h3>
            <p className="text-sm text-gray-400">Your video editing style preferences</p>
          </div>
        </div>

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
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-700 flex gap-3">
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
