import { TwelveLabs } from 'twelvelabs-js';

const client = new TwelveLabs({ apiKey: process.env.TWELVE_LABS_API_KEY! });

const INDEX_ID = process.env.TWELVE_LABS_INDEX_ID!;

/**
 * Upload a video to Twelve Labs index using a URL
 * Waits for the upload task to complete
 */
export async function uploadVideoToTwelveLabs(
  videoUrl: string,
  _fileName: string
): Promise<{ taskId: string; videoId: string }> {
  // Create a task to index the video from URL
  const task = await client.task.create({
    indexId: INDEX_ID,
    url: videoUrl,
  });

  if (!task.id) {
    throw new Error('Failed to create Twelve Labs task');
  }

  // Wait for the task to complete using SDK's built-in method
  const completedTask = await task.waitForDone({
    sleepInterval: 5000, // 5 seconds between polls
    callback: (t) => {
      console.log(`Twelve Labs task status: ${t.status}`);
    },
  });

  if (completedTask.status !== 'ready') {
    throw new Error(`Twelve Labs task failed with status: ${completedTask.status}`);
  }

  if (!completedTask.videoId) {
    throw new Error('Task completed but no video ID returned');
  }

  return {
    taskId: task.id,
    videoId: completedTask.videoId,
  };
}

/**
 * Generate a summary for a video using Pegasus
 */
export async function generateVideoSummary(videoId: string): Promise<string> {
  const response = await client.generate.summarize(videoId, 'summary');
  
  return response.summary || '';
}

/**
 * Get the current status of a video in Twelve Labs
 */
export async function getVideoStatus(videoId: string): Promise<{
  status: string;
  duration?: number;
}> {
  const video = await client.index.video.retrieve(INDEX_ID, videoId);
  
  return {
    status: video.indexingStatus || 'unknown',
    duration: video.metadata?.duration,
  };
}

/**
 * Helper function to create an index with Marengo and Pegasus engines
 * Use this if you need to create a new index
 */
export async function createIndex(name: string): Promise<string> {
  const index = await client.index.create({
    name,
    engines: [
      {
        name: 'marengo2.7', // Using marengo for visual understanding
        options: ['visual', 'audio'],
      },
      {
        name: 'pegasus1.2', // Using pegasus for text generation
        options: ['visual', 'audio'],
      },
    ],
  });

  return index.id!;
}
