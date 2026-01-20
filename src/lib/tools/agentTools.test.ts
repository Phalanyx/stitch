/**
 * Tests for agent tools utility functions.
 */

import {
  summarizeTimeline,
  hasNLParameter,
  getNLParamInfo,
  TOOL_DEFINITIONS,
  NL_TOOL_PARAMS,
} from './agentTools';
import { VideoReference } from '@/types/video';

describe('TOOL_DEFINITIONS', () => {
  it('exports an array of tool definitions', () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('each tool has name and description', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('includes expected tools', () => {
    const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
    expect(toolNames).toContain('summarize_timeline');
    expect(toolNames).toContain('list_clips');
    expect(toolNames).toContain('add_video');
    expect(toolNames).toContain('remove_video');
    expect(toolNames).toContain('search_videos');
  });
});

describe('NL_TOOL_PARAMS', () => {
  it('includes search_videos with query param', () => {
    expect(NL_TOOL_PARAMS.search_videos).toEqual({
      paramName: 'query',
      description: 'Search query for finding video clips',
    });
  });

  it('includes create_transition with prompt param', () => {
    expect(NL_TOOL_PARAMS.create_transition).toEqual({
      paramName: 'prompt',
      description: 'Style description for the transition',
    });
  });

  it('includes create_audio_from_text with text param', () => {
    expect(NL_TOOL_PARAMS.create_audio_from_text).toEqual({
      paramName: 'text',
      description: 'Text to convert to speech',
    });
  });
});

describe('hasNLParameter', () => {
  it('returns true for search_videos', () => {
    expect(hasNLParameter('search_videos')).toBe(true);
  });

  it('returns true for create_transition', () => {
    expect(hasNLParameter('create_transition')).toBe(true);
  });

  it('returns true for create_audio_from_text', () => {
    expect(hasNLParameter('create_audio_from_text')).toBe(true);
  });

  it('returns false for summarize_timeline', () => {
    expect(hasNLParameter('summarize_timeline')).toBe(false);
  });

  it('returns false for list_clips', () => {
    expect(hasNLParameter('list_clips')).toBe(false);
  });

  it('returns false for add_video', () => {
    expect(hasNLParameter('add_video')).toBe(false);
  });

  it('returns false for remove_video', () => {
    expect(hasNLParameter('remove_video')).toBe(false);
  });

  it('returns false for move_video', () => {
    expect(hasNLParameter('move_video')).toBe(false);
  });

  it('returns false for unknown tool', () => {
    expect(hasNLParameter('unknown_tool')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasNLParameter('')).toBe(false);
  });
});

describe('getNLParamInfo', () => {
  it('returns param info for search_videos', () => {
    const info = getNLParamInfo('search_videos');
    expect(info).not.toBeNull();
    expect(info?.paramName).toBe('query');
    expect(info?.description).toBe('Search query for finding video clips');
  });

  it('returns param info for create_transition', () => {
    const info = getNLParamInfo('create_transition');
    expect(info).not.toBeNull();
    expect(info?.paramName).toBe('prompt');
  });

  it('returns param info for create_audio_from_text', () => {
    const info = getNLParamInfo('create_audio_from_text');
    expect(info).not.toBeNull();
    expect(info?.paramName).toBe('text');
  });

  it('returns null for tools without NL params', () => {
    expect(getNLParamInfo('summarize_timeline')).toBeNull();
    expect(getNLParamInfo('list_clips')).toBeNull();
    expect(getNLParamInfo('add_video')).toBeNull();
  });

  it('returns null for unknown tool', () => {
    expect(getNLParamInfo('unknown_tool')).toBeNull();
  });
});

describe('summarizeTimeline', () => {
  it('returns message for empty timeline', () => {
    const result = summarizeTimeline([]);

    expect(result).toBe('No clips on the timeline yet.');
  });

  it('returns summary for single clip', () => {
    const clips: VideoReference[] = [
      { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
    ];

    const result = summarizeTimeline(clips);

    expect(result).toContain('1 clip');
    expect(result).toContain('10.0s');
    expect(result).toContain('0.0s to 10.0s');
  });

  it('calculates total duration correctly', () => {
    const clips: VideoReference[] = [
      { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
      { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      { id: 'clip-3', videoId: 'v3', url: 'test3.mp4', timestamp: 15, duration: 8 },
    ];

    const result = summarizeTimeline(clips);

    // Total duration: 10 + 5 + 8 = 23
    expect(result).toContain('23.0s');
  });

  it('calculates time span correctly', () => {
    const clips: VideoReference[] = [
      { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 5, duration: 10 },
      { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 20, duration: 5 },
    ];

    const result = summarizeTimeline(clips);

    // Earliest: 5, Latest end: 20 + 5 = 25
    expect(result).toContain('5.0s to 25.0s');
  });

  it('handles clips at various timestamps', () => {
    const clips: VideoReference[] = [
      { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 100, duration: 10 },
      { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 50, duration: 20 },
      { id: 'clip-3', videoId: 'v3', url: 'test3.mp4', timestamp: 200, duration: 5 },
    ];

    const result = summarizeTimeline(clips);

    // Earliest: 50, Latest end: 200 + 5 = 205
    expect(result).toContain('3 clip');
    expect(result).toContain('50.0s to 205.0s');
  });

  it('uses plural for multiple clips', () => {
    const clips: VideoReference[] = [
      { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
      { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
    ];

    const result = summarizeTimeline(clips);

    expect(result).toContain('2 clip(s)');
  });

  it('handles clips with decimal durations', () => {
    const clips: VideoReference[] = [
      { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10.5 },
    ];

    const result = summarizeTimeline(clips);

    expect(result).toContain('10.5s');
  });

  it('handles overlapping clips', () => {
    // Overlapping clips should still calculate correctly
    const clips: VideoReference[] = [
      { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
      { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 5, duration: 10 },
    ];

    const result = summarizeTimeline(clips);

    // Total duration: 10 + 10 = 20 (not 15, we sum all durations)
    expect(result).toContain('20.0s');
    // Span: 0 to 15
    expect(result).toContain('0.0s to 15.0s');
  });
});
