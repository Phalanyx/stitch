import { TwelveLabs } from 'twelvelabs-js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const client = new TwelveLabs({ apiKey: process.env.TWELVE_LABS_API_KEY! });

const INDEX_ID = process.env.TWELVE_LABS_INDEX_ID!;

/**
 * Download a file from a URL to a local path
 * Handles redirects and uses streaming to avoid memory issues
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    const handleResponse = (response: http.IncomingMessage) => {
      // Handle redirects (301, 302, 307, 308)
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`[Download] Following redirect to: ${response.headers.location}`);
        const redirectProtocol = response.headers.location.startsWith('https') ? https : http;
        redirectProtocol.get(response.headers.location, handleResponse).on('error', reject);
        return;
      }

      if (response.statusCode !== 200) {
        const error = new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`);
        console.error('[Download] Error:', error.message);
        reject(error);
        return;
      }

      console.log(`[Download] Downloading video from ${url}...`);
      response.pipe(file);

      file.on('finish', () => {
        file.close((err) => {
          if (err) {
            console.error('[Download] Error closing file:', err);
            reject(err);
          } else {
            console.log(`[Download] Downloaded video to ${destPath}`);
            resolve();
          }
        });
      });
    };

    protocol
      .get(url, handleResponse)
      .on('error', (err) => {
        console.error('[Download] Network error:', err);
        fs.unlink(destPath, () => {});
        reject(err);
      });

    file.on('error', (err) => {
      console.error('[Download] File write error:', err);
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Upload a video to Twelve Labs index by downloading from URL and uploading the file
 * Waits for the upload task to complete
 */
export async function uploadVideoToTwelveLabs(
  videoUrl: string,
  fileName: string
): Promise<{ taskId: string; videoId: string }> {
  console.log(`[Twelve Labs] Starting upload for: ${fileName}`);
  console.log(`[Twelve Labs] Video URL: ${videoUrl}`);

  const tempFilePath = path.join('/tmp', fileName);

  // Download the video file from the URL (localhost bucket)
  await downloadFile(videoUrl, tempFilePath);

  const fileSize = fs.statSync(tempFilePath).size;
  console.log(`[Twelve Labs] Download complete, file size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

  try {
    console.log(`[Twelve Labs] Creating indexing task...`);

    // Create a task to index the video from file
    const task = await client.tasks.create({
      indexId: INDEX_ID,
      videoFile: fs.createReadStream(tempFilePath),
    });

    if (!task.id) {
      throw new Error('Failed to create Twelve Labs task');
    }

    console.log(`[Twelve Labs] Task created: ${task.id}, waiting for completion...`);

    // Wait for the task to complete using SDK's built-in method
    const completedTask = await client.tasks.waitForDone(task.id, {
      sleepInterval: 5000, // 5 seconds between polls
      callback: (t) => {
        console.log(`[Twelve Labs] Task status: ${t.status}`);
      },
    });

    if (completedTask.status !== 'ready') {
      console.error(`[Twelve Labs] Task failed with status: ${completedTask.status}`);
      throw new Error(`Twelve Labs task failed with status: ${completedTask.status}`);
    }

    if (!completedTask.videoId) {
      console.error('[Twelve Labs] Task completed but no video ID returned');
      throw new Error('Task completed but no video ID returned');
    }

    console.log(`[Twelve Labs] Upload successful! Video ID: ${completedTask.videoId}`);

    return {
      taskId: task.id,
      videoId: completedTask.videoId,
    };
  } finally {
    // Clean up the temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`[Twelve Labs] Cleaned up temporary file: ${tempFilePath}`);
    }
  }
}

/**
 * Generate a summary for a video using Pegasus
 */
export async function generateVideoSummary(videoId: string): Promise<string> {
  const response = await client.summarize({
    videoId,
    type: 'summary',
  });

  if (response.summarizeType === 'summary') {
    return response.summary || '';
  }

  return '';
}

/**
 * Get the current status of a video in Twelve Labs
 */
export async function getVideoStatus(videoId: string): Promise<{
  status: string;
  duration?: number;
}> {
  const video = await client.indexes.videos.retrieve(INDEX_ID, videoId);

  return {
    status: 'ready', // Video is ready if it can be retrieved
    duration: video.systemMetadata?.duration,
  };
}

/**
 * Helper function to create an index with Marengo and Pegasus engines
 * Use this if you need to create a new index
 */
export async function createIndex(indexName: string): Promise<string> {
  const index = await client.indexes.create({
    indexName,
    models: [
      {
        modelName: 'marengo2.7', // Using marengo for visual understanding
        modelOptions: ['visual', 'audio'],
      },
      {
        modelName: 'pegasus1.2', // Using pegasus for text generation
        modelOptions: ['visual', 'audio'],
      },
    ],
  });

  return index.id!;
}
