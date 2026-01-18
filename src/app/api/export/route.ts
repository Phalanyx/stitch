import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import ffmpeg from 'fluent-ffmpeg';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';
import { execSync } from 'child_process';

// Configure FFmpeg path if needed
// Priority: 1) FFMPEG_PATH env var, 2) Auto-detect from PATH, 3) Common Windows locations
let ffmpegPath: string | undefined = process.env.FFMPEG_PATH;

if (!ffmpegPath) {
  // Try to find ffmpeg in PATH
  try {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'where ffmpeg' : 'which ffmpeg';
    const pathResult = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (pathResult) {
      ffmpegPath = pathResult.split('\n')[0].trim();
    }
  } catch {
    // ffmpeg not in PATH, will try common locations below
  }

  // If still not found on Windows, try common installation locations
  if (!ffmpegPath && process.platform === 'win32') {
    const commonPaths = [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
      path.join(process.env.LOCALAPPDATA || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    ].filter(p => p && fs.existsSync(p));

    if (commonPaths.length > 0) {
      ffmpegPath = commonPaths[0];
    }
  }
}

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`[FFmpeg] Using path: ${ffmpegPath}`);
} else {
  console.warn('[FFmpeg] Could not find ffmpeg. Please set FFMPEG_PATH environment variable.');
  console.warn('[FFmpeg] On Windows, this might be: C:\\ffmpeg\\bin\\ffmpeg.exe');
}

/**
 * Safely cleanup temporary directory with retries for Windows file locking issues
 */
async function cleanupTempDir(tempDir: string, maxRetries = 3, delayMs = 500): Promise<void> {
  if (!fs.existsSync(tempDir)) {
    return;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // On Windows, wait a bit for file handles to be released
      if (attempt > 0 && process.platform === 'win32') {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
      return; // Success
    } catch (error: unknown) {
      const err = error as { code?: string; message: string };
      // If it's the last attempt or not a busy/locked error, log it
      if (attempt === maxRetries - 1 || (err.code !== 'EBUSY' && err.code !== 'EMFILE' && err.code !== 'ENFILE')) {
        console.warn(`[Cleanup] Failed to delete temp directory after ${attempt + 1} attempts:`, err.message);
        // Don't throw - temp files will be cleaned up by OS eventually
        return;
      }
    }
  }
}

/**
 * Download a file from a URL to a local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    const handleResponse = (response: http.IncomingMessage) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectProtocol = response.headers.location.startsWith('https') ? https : http;
        redirectProtocol.get(response.headers.location, handleResponse).on('error', reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    protocol
      .get(url, handleResponse)
      .on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });

    file.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

export async function POST(request: NextRequest) {
  // Get the access token from the Authorization header
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { clips, audioClips }: { clips: VideoReference[]; audioClips: AudioReference[] } = body;

    if (!clips || clips.length === 0) {
      return NextResponse.json({ error: 'No clips to export' }, { status: 400 });
    }

    // Use OS temp directory (works on Windows and Unix)
    const tempDir = path.join(os.tmpdir(), `export-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Step 1: Download all video files
      const videoFiles: string[] = [];
      const videoMap = new Map<string, string>(); // clip.id -> local file path

      for (const clip of clips) {
        const fileName = `video-${clip.id}.mp4`;
        const filePath = path.join(tempDir, fileName);
        await downloadFile(clip.url, filePath);
        videoFiles.push(filePath);
        videoMap.set(clip.id, filePath);
      }

      // Step 2: Download all audio files
      const audioFiles: string[] = [];
      const audioMap = new Map<string, string>(); // clip.id -> local file path

      for (const clip of audioClips) {
        const fileName = `audio-${clip.id}.mp3`;
        const filePath = path.join(tempDir, fileName);
        await downloadFile(clip.url, filePath);
        audioFiles.push(filePath);
        audioMap.set(clip.id, filePath);
      }

      // Step 3: Sort clips by timestamp
      const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);

      // Step 4: Create trimmed video segments first
      const trimmedVideoSegments: string[] = [];
      for (let i = 0; i < sortedClips.length; i++) {
        const clip = sortedClips[i];
        const videoPath = videoMap.get(clip.id);
        if (!videoPath) continue;

        const trimStart = clip.trimStart || 0;
        const trimEnd = clip.trimEnd || 0;
        const trimmedPath = path.join(tempDir, `trimmed-video-${i}.mp4`);

        // Trim the video segment
        await new Promise<void>((resolve, reject) => {
          ffmpeg(videoPath)
            .setStartTime(trimStart)
            .setDuration(clip.duration - trimStart - trimEnd)
            .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
            .output(trimmedPath)
            .on('end', () => resolve())
            .on('error', reject)
            .run();
        });

        trimmedVideoSegments.push(trimmedPath);
      }

      // Step 5: Create concat file for video segments
      // Convert Windows paths to forward slashes for ffmpeg concat file format
      const concatListPath = path.join(tempDir, 'concat.txt');
      const concatLines = trimmedVideoSegments.map((segment) => {
        // Convert Windows backslashes to forward slashes for ffmpeg compatibility
        const normalizedPath = segment.replace(/\\/g, '/');
        return `file '${normalizedPath}'`;
      });
      fs.writeFileSync(concatListPath, concatLines.join('\n'));

      // Step 6: Concatenate video segments
      const concatenatedVideoPath = path.join(tempDir, 'concatenated-video.mp4');
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
          .output(concatenatedVideoPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });

      // Step 7: Handle audio mixing
      const outputPath = path.join(tempDir, 'output.mp4');
      let ffmpegCommand = ffmpeg(concatenatedVideoPath);

      if (audioClips.length > 0) {
        // Add all audio inputs
        for (const clip of audioClips) {
          const audioPath = audioMap.get(clip.id);
          if (audioPath) {
            ffmpegCommand = ffmpegCommand.input(audioPath);
          }
        }

        // Build audio filter for mixing with timeline positioning
        const audioFilters: string[] = [];
        let audioInputIndex = 1; // Start from 1 (0 is the concatenated video)
        const audioSegments: string[] = [];

        const sortedAudioClips = [...audioClips].sort((a, b) => a.timestamp - b.timestamp);

        for (const clip of sortedAudioClips) {
          const trimStart = clip.trimStart || 0;
          const trimEnd = clip.trimEnd || 0;
          const clipStart = clip.timestamp;

          // Trim and position the audio segment
          const segmentName = `a${audioInputIndex}`;
          audioFilters.push(
            `[${audioInputIndex}:a]atrim=start=${trimStart}:end=${clip.duration - trimEnd},asetpts=PTS-STARTPTS,adelay=${Math.round(clipStart * 1000)}|${Math.round(clipStart * 1000)}[${segmentName}]`
          );
          audioSegments.push(`[${segmentName}]`);
          audioInputIndex++;
        }

        // Mix all audio segments (exclude original video audio when audio clips are present)
        if (audioSegments.length > 0) {
          // Only mix the new audio tracks, not the original video audio
          audioFilters.push(`${audioSegments.join('')}amix=inputs=${audioSegments.length}:duration=longest[outa]`);
        }

        // Apply filters
        ffmpegCommand = ffmpegCommand
          .complexFilter(audioFilters.join(';'))
          .outputOptions(['-map 0:v', '-map [outa]'])
          .outputOptions(['-c:v libx264', '-c:a aac', '-preset medium', '-crf 23'])
          .output(outputPath);
      } else {
        // No audio clips, just use the concatenated video
        ffmpegCommand = ffmpegCommand
          .outputOptions(['-c:v libx264', '-c:a copy', '-preset medium', '-crf 23'])
          .output(outputPath);
      }

      // Execute FFmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpegCommand
          .on('start', (commandLine) => {
            console.log('FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            console.log('FFmpeg progress:', progress.percent);
          })
          .on('end', () => {
            console.log('FFmpeg finished');
            resolve();
          })
          .on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(err);
          })
          .run();
      });

      // Step 6: Read the output file and return it
      const outputBuffer = fs.readFileSync(outputPath);
      const outputBlob = new Blob([outputBuffer], { type: 'video/mp4' });

      // Step 7: Cleanup asynchronously (don't block response)
      // On Windows, files may still be locked, so cleanup in background
      cleanupTempDir(tempDir).catch(err => {
        console.warn('[Cleanup] Background cleanup failed:', err.message);
      });

      // Return the video file
      return new NextResponse(outputBlob, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="export-${Date.now()}.mp4"`,
        },
      });
    } catch (error) {
      // Cleanup on error (async, don't block error response)
      cleanupTempDir(tempDir).catch(err => {
        console.warn('[Cleanup] Error cleanup failed:', err.message);
      });
      throw error;
    }
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}
