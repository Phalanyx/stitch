import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';

function findFfmpegPath(): string | null {
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

  try {
    const result = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (result && fs.existsSync(result)) {
      return result;
    }
  } catch {
    // Ignore lookup failures.
  }

  return null;
}

const ffmpegPath = findFfmpegPath();
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    const handleResponse = (response: http.IncomingMessage) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        const redirectProtocol = response.headers.location.startsWith('https')
          ? https
          : http;
        redirectProtocol.get(response.headers.location, handleResponse).on('error', reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`)
        );
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    };

    protocol.get(url, handleResponse).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

export async function extractFrameAtTime(
  videoPath: string,
  timeSeconds: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(Math.max(timeSeconds, 0))
      .frames(1)
      .outputOptions(['-q:v', '2'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata.format?.duration;
      if (typeof duration === 'number') {
        resolve(duration);
      } else {
        reject(new Error('Unable to determine video duration'));
      }
    });
  });
}

export function readImageAsGenAI(imagePath: string): {
  imageBytes: string;
  mimeType: string;
} {
  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
  return {
    imageBytes: buffer.toString('base64'),
    mimeType,
  };
}
