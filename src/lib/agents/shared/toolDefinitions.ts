import { ToolDefinition } from './types';

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  list_videos: {
    name: 'list_videos',
    description: 'List all videos in user\'s media library',
    args: {},
    examples: [
      { user: 'show my videos', response: '{"tool":"list_videos","args":{}}' },
      { user: 'what videos do I have', response: '{"tool":"list_videos","args":{}}' },
    ],
  },

  get_video: {
    name: 'get_video',
    description: 'Find video by name in media library',
    args: {
      name: 'string - Video name to search for',
    },
    examples: [
      { user: 'find the sunset video', response: '{"tool":"get_video","args":{"name":"sunset"}}' },
      { user: 'search for intro clip', response: '{"tool":"get_video","args":{"name":"intro"}}' },
    ],
  },

  list_audio: {
    name: 'list_audio',
    description: 'List all audio files in user\'s media library',
    args: {},
    examples: [
      { user: 'show my audio', response: '{"tool":"list_audio","args":{}}' },
      { user: 'what music do I have', response: '{"tool":"list_audio","args":{}}' },
    ],
  },

  get_audio: {
    name: 'get_audio',
    description: 'Find audio by name in media library',
    args: {
      name: 'string - Audio name to search for',
    },
    examples: [
      { user: 'find background music', response: '{"tool":"get_audio","args":{"name":"background music"}}' },
    ],
  },

  add_video_to_timeline: {
    name: 'add_video_to_timeline',
    description: 'Add a video from the library to the timeline',
    args: {
      videoName: 'string - Video name to search for (use this when user specifies a name)',
      videoId: 'string - Video ID (use when you have the exact ID)',
      timestamp: 'number (optional) - Position in seconds. Omit to add at end.',
    },
    examples: [
      { user: 'add sunset video to timeline', response: '{"tool":"add_video_to_timeline","args":{"videoName":"sunset"}}' },
      { user: 'add image_to_video_2 to end of timeline', response: '{"tool":"add_video_to_timeline","args":{"videoName":"image_to_video_2"}}' },
      { user: 'add the intro video at 5 seconds', response: '{"tool":"add_video_to_timeline","args":{"videoName":"intro","timestamp":5}}' },
      { user: 'add my_clip.mp4 to the timeline', response: '{"tool":"add_video_to_timeline","args":{"videoName":"my_clip.mp4"}}' },
    ],
  },

  modify_video_clip: {
    name: 'modify_video_clip',
    description: 'Move, trim, or remove a video clip on the timeline',
    args: {
      action: 'string - "move", "trim", or "remove"',
      clipId: 'string - ID of the clip to modify',
      timestamp: 'number (optional) - New position in seconds (for move)',
      trimStart: 'number (optional) - Seconds to trim from start',
      trimEnd: 'number (optional) - Seconds to trim from end',
    },
    examples: [
      { user: 'move clip 1 to 10 seconds', response: '{"tool":"modify_video_clip","args":{"action":"move","clipId":"1","timestamp":10}}' },
      { user: 'remove the first clip', response: '{"tool":"modify_video_clip","args":{"action":"remove","clipId":"1"}}' },
      { user: 'trim 2 seconds from the start of clip abc123', response: '{"tool":"modify_video_clip","args":{"action":"trim","clipId":"abc123","trimStart":2}}' },
    ],
  },

  add_audio_to_timeline: {
    name: 'add_audio_to_timeline',
    description: 'Add an audio file from the library to the audio track',
    args: {
      audioName: 'string - Audio name to search for',
      audioId: 'string - Audio ID (use when you have the exact ID)',
      timestamp: 'number (optional) - Position in seconds. Omit to add at end.',
    },
    examples: [
      { user: 'add background music to timeline', response: '{"tool":"add_audio_to_timeline","args":{"audioName":"background music"}}' },
      { user: 'add soundtrack.mp3 at 0 seconds', response: '{"tool":"add_audio_to_timeline","args":{"audioName":"soundtrack.mp3","timestamp":0}}' },
    ],
  },

  modify_audio_clip: {
    name: 'modify_audio_clip',
    description: 'Move, trim, or remove an audio clip on the audio track',
    args: {
      action: 'string - "move", "trim", or "remove"',
      clipId: 'string - ID of the audio clip to modify',
      timestamp: 'number (optional) - New position in seconds (for move)',
      trimStart: 'number (optional) - Seconds to trim from start',
      trimEnd: 'number (optional) - Seconds to trim from end',
    },
    examples: [
      { user: 'move audio to start at 5 seconds', response: '{"tool":"modify_audio_clip","args":{"action":"move","clipId":"audio1","timestamp":5}}' },
      { user: 'remove the audio clip', response: '{"tool":"modify_audio_clip","args":{"action":"remove","clipId":"audio1"}}' },
    ],
  },

  summarize_timeline: {
    name: 'summarize_timeline',
    description: 'Get an overview of the current timeline state',
    args: {},
    examples: [
      { user: 'summarize the timeline', response: '{"tool":"summarize_timeline","args":{}}' },
      { user: 'what does my timeline look like', response: '{"tool":"summarize_timeline","args":{}}' },
    ],
  },

  list_clips: {
    name: 'list_clips',
    description: 'List all clips currently on the timeline',
    args: {},
    examples: [
      { user: 'list all clips', response: '{"tool":"list_clips","args":{}}' },
      { user: 'what clips are on the timeline', response: '{"tool":"list_clips","args":{}}' },
    ],
  },

  find_clip: {
    name: 'find_clip',
    description: 'Find a specific clip by ID on the timeline',
    args: {
      id: 'string - Clip ID to find',
    },
    examples: [
      { user: 'find clip abc123', response: '{"tool":"find_clip","args":{"id":"abc123"}}' },
    ],
  },

  suggest_next_action: {
    name: 'suggest_next_action',
    description: 'Get a suggestion for what to do next based on timeline state',
    args: {},
    examples: [
      { user: 'what should I do next', response: '{"tool":"suggest_next_action","args":{}}' },
      { user: 'any suggestions', response: '{"tool":"suggest_next_action","args":{}}' },
    ],
  },

  none: {
    name: 'none',
    description: 'General conversation - no specific tool needed',
    args: {},
    examples: [
      { user: 'hello', response: '{"tool":"none","args":{}}' },
      { user: 'thanks', response: '{"tool":"none","args":{}}' },
      { user: 'how do I export my video', response: '{"tool":"none","args":{}}' },
    ],
  },
};

// Get all tool names
export const ALL_TOOL_NAMES = Object.keys(TOOL_DEFINITIONS);

// Format tool definitions for prompt
export function formatToolDocs(): string {
  return Object.values(TOOL_DEFINITIONS)
    .filter((tool) => tool.name !== 'none')
    .map((tool) => {
      const argsStr = Object.keys(tool.args).length > 0
        ? ` (args: ${Object.entries(tool.args)
            .map(([k, v]) => `"${k}": ${v}`)
            .join(', ')})`
        : '';
      return `- ${tool.name}: ${tool.description}${argsStr}`;
    })
    .join('\n');
}

// Format examples for prompt
export function formatExamples(): string {
  const examples: string[] = [];

  // Pick 2-3 representative examples from each important tool
  const importantTools = [
    'add_video_to_timeline',
    'list_videos',
    'get_video',
    'modify_video_clip',
    'summarize_timeline',
    'none',
  ];

  for (const toolName of importantTools) {
    const tool = TOOL_DEFINITIONS[toolName];
    if (tool && tool.examples.length > 0) {
      // Take first example from each
      const ex = tool.examples[0];
      examples.push(`User: "${ex.user}"\nJSON: ${ex.response}`);
    }
  }

  return examples.join('\n\n');
}
