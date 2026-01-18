'use client';

import { useState } from 'react';
import { X, ThumbsUp, ThumbsDown } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedbackText?: string) => void;
  feedbackType: 'like' | 'dislike';
  messagePreview: string;
  isSubmitting?: boolean;
}

export function FeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  feedbackType,
  messagePreview,
  isSubmitting = false,
}: FeedbackModalProps) {
  const [feedbackText, setFeedbackText] = useState('');

  if (!isOpen) return null;

  const isLike = feedbackType === 'like';
  const Icon = isLike ? ThumbsUp : ThumbsDown;
  const iconColor = isLike ? 'text-green-500' : 'text-red-500';
  const iconBgColor = isLike ? 'bg-green-500/20' : 'bg-red-500/20';
  const title = isLike ? 'What did you like?' : 'What could be improved?';
  const placeholder = isLike
    ? 'Tell us what you liked about this response (optional)'
    : 'Tell us what could be improved (optional)';

  const truncatedPreview =
    messagePreview.length > 150
      ? messagePreview.slice(0, 150) + '...'
      : messagePreview;

  const handleSubmit = () => {
    onSubmit(feedbackText.trim() || undefined);
    setFeedbackText('');
  };

  const handleSkip = () => {
    onSubmit(undefined);
    setFeedbackText('');
  };

  const handleClose = () => {
    setFeedbackText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-white disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4 mb-4">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full ${iconBgColor} flex items-center justify-center`}
          >
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
        </div>

        <div className="bg-gray-700/50 rounded-md p-3 mb-4">
          <p className="text-gray-300 text-sm italic">&quot;{truncatedPreview}&quot;</p>
        </div>

        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder={placeholder}
          disabled={isSubmitting}
          className="w-full h-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50"
        />

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={handleSkip}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
