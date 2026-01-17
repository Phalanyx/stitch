import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Try to find ffmpeg in common locations
function findFfmpegPath(): string | null {
  // Common paths to check
  const commonPaths = [
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Try using 'which' command
  try {
    const result = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (result && fs.existsSync(result)) {
      return result;
    }
  } catch {
    // which command failed, continue
  }

  return null;
}

// Set ffmpeg path if found
const ffmpegPath = findFfmpegPath();
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface AudioExtractionResult {
  audioPath: string;
  duration: number;
  fileSize: number;
}

/**
 * Extracts audio from a video file and saves it as MP3
 * @param videoBuffer - The video file buffer
 * @param videoId - The video ID for naming
 * @param baseName - The base name for the output file
 * @returns The path to the extracted audio file, duration, and file size
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  videoId: string,
  baseName: string
): Promise<AudioExtractionResult> {
  const tmpDir = os.tmpdir();
  const videoPath = path.join(tmpDir, `${videoId}_video_temp`);
  const audioFileName = `${videoId}_${baseName}_audio.mp3`;
  const audioPath = path.join(tmpDir, audioFileName);

  // Write video buffer to temp file
  await fs.promises.writeFile(videoPath, videoBuffer);

  return new Promise((resolve, reject) => {
    let duration = 0;

    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .format('mp3')
      .on('codecData', (data) => {
        // Parse duration from format "HH:MM:SS.ms"
        if (data.duration) {
          const parts = data.duration.split(':');
          if (parts.length === 3) {
            const hours = parseFloat(parts[0]);
            const minutes = parseFloat(parts[1]);
            const seconds = parseFloat(parts[2]);
            duration = hours * 3600 + minutes * 60 + seconds;
          }
        }
      })
      .on('end', async () => {
        try {
          // Clean up temp video file
          await fs.promises.unlink(videoPath);

          // Get audio file size
          const stats = await fs.promises.stat(audioPath);

          resolve({
            audioPath,
            duration,
            fileSize: stats.size,
          });
        } catch (err) {
          reject(err);
        }
      })
      .on('error', async (err) => {
        // Clean up temp files on error
        try {
          await fs.promises.unlink(videoPath).catch(() => {});
          await fs.promises.unlink(audioPath).catch(() => {});
        } catch {
          // Ignore cleanup errors
        }
        reject(err);
      })
      .save(audioPath);
  });
}

/**
 * Cleans up a temporary audio file
 * @param audioPath - The path to the audio file to delete
 */
export async function cleanupTempAudio(audioPath: string): Promise<void> {
  try {
    await fs.promises.unlink(audioPath);
  } catch {
    // Ignore cleanup errors
  }
}
