import { TwelveLabs } from 'twelvelabs-js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const SEARCH_TIMEOUT_MS = 30000;

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let _client: TwelveLabs | null = null;
function getClient(): TwelveLabs {
  if (!_client) {
    _client = new TwelveLabs({ apiKey: getEnvVar('TWELVE_LABS_API_KEY') });
  }
  return _client;
}

function getIndexId(): string {
  return getEnvVar('TWELVE_LABS_INDEX_ID');
}

// Search types
export interface VideoSearchResult {
  videoId: string;
  rank: number;
  score: number;
  confidence: string;
  start: number;
  end: number;
  thumbnailUrl?: string;
}

// Search options supported by TwelveLabs API
export type SearchOption = 'visual' | 'audio';

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
    const task = await getClient().tasks.create({
      indexId: getIndexId(),
      videoFile: fs.createReadStream(tempFilePath),
    });

    if (!task.id) {
      throw new Error('Failed to create Twelve Labs task');
    }

    console.log(`[Twelve Labs] Task created: ${task.id}, waiting for completion...`);

    // Wait for the task to complete using SDK's built-in method
    const completedTask = await getClient().tasks.waitForDone(task.id, {
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
 * Create a Twelve Labs indexing task and return immediately (no waiting)
 * Returns the task ID for polling later
 */
export async function createTwelveLabsTask(
  videoUrl: string,
  fileName: string
): Promise<{ taskId: string }> {
  console.log(`[Twelve Labs] Starting async upload for: ${fileName}`);
  console.log(`[Twelve Labs] Video URL: ${videoUrl}`);

  const tempFilePath = path.join('/tmp', fileName);

  // Download the video file from the URL (localhost bucket)
  await downloadFile(videoUrl, tempFilePath);

  const fileSize = fs.statSync(tempFilePath).size;
  console.log(`[Twelve Labs] Download complete, file size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

  try {
    console.log(`[Twelve Labs] Creating indexing task...`);

    // Create a task to index the video from file
    const task = await getClient().tasks.create({
      indexId: getIndexId(),
      videoFile: fs.createReadStream(tempFilePath),
    });

    if (!task.id) {
      throw new Error('Failed to create Twelve Labs task');
    }

    console.log(`[Twelve Labs] Task created: ${task.id}, returning immediately (async mode)`);

    return {
      taskId: task.id,
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
 * Get the status of a Twelve Labs indexing task
 * Returns status, and videoId when complete
 */
export async function getTaskStatus(taskId: string): Promise<{
  status: string;
  videoId?: string;
}> {
  const task = await getClient().tasks.retrieve(taskId);

  return {
    status: task.status || 'unknown',
    videoId: task.videoId || undefined,
  };
}

/**
 * Generate a summary for a video using Pegasus
 */
export async function generateVideoSummary(videoId: string): Promise<string> {
  const response = await getClient().summarize({
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
  const video = await getClient().indexes.videos.retrieve(getIndexId(), videoId);

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
  const index = await getClient().indexes.create({
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

/**
 * Search indexed videos using natural language queries
 * Returns matching clips with videoId, start/end times, score, and confidence
 *
 * Note: Uses direct REST API call due to SDK bug with async iterator
 * (TwelvelabsApiError: Response body object should not be disturbed or locked)
 */
export async function searchVideos(
  query: string,
  options?: {
    searchOptions?: SearchOption[];
    limit?: number;
  }
): Promise<VideoSearchResult[]> {
  const searchOptions = options?.searchOptions ?? ['visual'];
  const limit = options?.limit ?? 10;

  // Validate search options - index only supports visual and audio
  const validOptions: SearchOption[] = ['visual', 'audio'];
  const invalidOptions = searchOptions.filter(opt => !validOptions.includes(opt));
  if (invalidOptions.length > 0) {
    console.warn(`[Twelve Labs] Ignoring unsupported search options: ${invalidOptions.join(', ')}`);
  }
  const filteredOptions = searchOptions.filter(opt => validOptions.includes(opt));
  if (filteredOptions.length === 0) {
    filteredOptions.push('visual'); // Default fallback
  }

  console.log(`[Twelve Labs] Searching for: "${query}" with options:`, filteredOptions);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    // Use direct REST API call to avoid SDK async iterator bug
    const formData = new FormData();
    formData.append('index_id', getIndexId());
    formData.append('query_text', query);
    formData.append('search_options', JSON.stringify(filteredOptions));
    formData.append('page_limit', String(limit));

    const response = await fetch('https://api.twelvelabs.io/v1.3/search', {
      method: 'POST',
      headers: {
        'x-api-key': getEnvVar('TWELVE_LABS_API_KEY'),
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `${response.status} - ${errorText}`;

      // Parse the error for better messaging
      try {
        const errorJson = JSON.parse(errorText) as { message?: string };
        if (response.status === 429) {
          errorMessage = `Rate limit exceeded: ${errorJson.message}`;
        } else if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // Keep the raw error text
      }

      throw new Error(`Twelve Labs API error: ${errorMessage}`);
    }

    const data = await response.json() as {
      data?: Array<{
        id: string;
        video_id: string;
        start: number;
        end: number;
        confidence: string;
        score: number;
        thumbnail_url?: string;
      }>;
    };

    // Sort by score descending for proper relevance ranking
    const sortedClips = [...(data.data ?? [])].sort((a, b) => b.score - a.score);

    const results: VideoSearchResult[] = sortedClips.map((clip, index) => ({
      videoId: clip.video_id,
      rank: index + 1,
      score: clip.score,
      confidence: clip.confidence,
      start: clip.start,
      end: clip.end,
      thumbnailUrl: clip.thumbnail_url,
    }));

    console.log(`[Twelve Labs] Found ${results.length} matching clips`);

    return results;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Twelve Labs search timed out after ${SEARCH_TIMEOUT_MS}ms`);
    }
    console.error('[Twelve Labs] Search failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
