/**
 * Tests for media utility functions.
 * Note: getVideoDuration and getAudioDuration require DOM mocks and are lower priority.
 */

import { formatDuration } from './media-utils';

describe('formatDuration', () => {
  it('returns empty string for null', () => {
    expect(formatDuration(null)).toBe('');
  });

  it('formats 0 seconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats seconds under 60 correctly', () => {
    expect(formatDuration(1)).toBe('00:01');
    expect(formatDuration(30)).toBe('00:30');
    expect(formatDuration(59)).toBe('00:59');
  });

  it('formats exactly 60 seconds as 01:00', () => {
    expect(formatDuration(60)).toBe('01:00');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatDuration(90)).toBe('01:30');
    expect(formatDuration(125)).toBe('02:05');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('handles hours (formats as total minutes)', () => {
    expect(formatDuration(3600)).toBe('60:00');
    expect(formatDuration(7200)).toBe('120:00');
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('truncates decimal seconds (floors)', () => {
    expect(formatDuration(1.5)).toBe('00:01');
    expect(formatDuration(59.9)).toBe('00:59');
    expect(formatDuration(90.7)).toBe('01:30');
  });

  it('returns empty string for NaN', () => {
    expect(formatDuration(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('');
  });

  it('returns empty string for negative Infinity', () => {
    expect(formatDuration(-Infinity)).toBe('');
  });

  it('formats negative values (documents actual behavior)', () => {
    // The function doesn't explicitly handle negatives
    // Math.floor(-1 / 60) = -1, and -1 % 60 = -1
    // This documents the actual (unintended) behavior
    expect(formatDuration(-1)).toBe('-1:-1');
    // Note: Negative durations are not expected in practice
  });

  it('pads single digit minutes and seconds', () => {
    expect(formatDuration(5)).toBe('00:05');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(605)).toBe('10:05');
  });

  it('handles large values', () => {
    // 10 hours = 36000 seconds
    expect(formatDuration(36000)).toBe('600:00');
  });

  it('handles very small positive values', () => {
    expect(formatDuration(0.001)).toBe('00:00');
    expect(formatDuration(0.999)).toBe('00:00');
  });
});

// Note: getVideoDuration and getAudioDuration tests would require DOM mocking.
// These functions use document.createElement('video') and document.createElement('audio')
// which are not available in Node.js test environment without additional setup.
// Consider using jsdom or moving these tests to an integration/e2e test suite.
