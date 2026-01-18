import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Try to find ffmpeg in common locations
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
    // which command failed, continue
  }

  return null;
}

// Set ffmpeg path if found
const ffmpegPath = findFfmpegPath();
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const ELEVENLABS_API_KEY = process.env.ELEVEN_LABS_API_KEY!;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Voice IDs
const MALE_VOICE_ID = 'UgBBYS2sOqTuMpoF3BR0';
const FEMALE_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

// Default to male voice
const DEFAULT_VOICE_ID = MALE_VOICE_ID;

// Available voices (static, no API call needed)
export const VOICES = [
  { voice_id: MALE_VOICE_ID, name: 'Male', category: 'premade' },
  { voice_id: FEMALE_VOICE_ID, name: 'Female', category: 'premade' },
] as const;

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface TextToSpeechOptions {
  voiceId?: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
  outputFormat?: 'mp3_44100_128' | 'mp3_22050_32' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'pcm_44100';
  targetDuration?: number; // Target duration in seconds - audio will be stretched or truncated to match
}

export interface GeneratedAudio {
  id: string;
  url: string;
  fileName: string;
  duration: number | null;
  fileSize: number;
  createdAt: Date;
}

/**
 * Get available voices (static list, no API call)
 */
export function getVoices(): Array<{ voice_id: string; name: string; category: string }> {
  return [...VOICES];
}

/**
 * Generate speech from text using ElevenLabs API
 * Returns the audio buffer
 */
export async function generateSpeech(
  text: string,
  options: TextToSpeechOptions = {}
): Promise<Buffer> {
  const {
    voiceId = DEFAULT_VOICE_ID,
    modelId = 'eleven_multilingual_v2',
    voiceSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
    },
    outputFormat = 'mp3_44100_128',
  } = options;

  console.log(`[ElevenLabs] Generating speech for text: "${text.substring(0, 50)}..."`);
  console.log(`[ElevenLabs] Using voice: ${voiceId}, model: ${modelId}`);

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[ElevenLabs] API error: ${error}`);
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`[ElevenLabs] Generated audio: ${buffer.length} bytes`);

  return buffer;
}

/**
 * Get the actual duration of an audio buffer using ffmpeg
 */
async function getAudioDuration(audioBuffer: Buffer): Promise<number> {
  const tmpDir = os.tmpdir();
  const tempPath = path.join(tmpDir, `audio_probe_${Date.now()}.mp3`);

  await fs.promises.writeFile(tempPath, audioBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(tempPath, async (err, metadata) => {
      // Clean up temp file
      await fs.promises.unlink(tempPath).catch(() => {});

      if (err) {
        reject(new Error(`Failed to probe audio: ${err.message}`));
        return;
      }

      const duration = metadata.format.duration ?? 0;
      resolve(duration);
    });
  });
}

/**
 * Adjust audio duration using ffmpeg
 * - If audio is shorter than target: stretch using atempo filter
 * - If audio is longer than target: truncate
 */
async function adjustAudioDuration(
  audioBuffer: Buffer,
  currentDuration: number,
  targetDuration: number
): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `audio_input_${Date.now()}.mp3`);
  const outputPath = path.join(tmpDir, `audio_output_${Date.now()}.mp3`);

  await fs.promises.writeFile(inputPath, audioBuffer);

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (currentDuration < targetDuration) {
      // Need to stretch (slow down) - atempo must be between 0.5 and 2.0
      // For slower playback, atempo < 1.0
      const tempoFactor = currentDuration / targetDuration;

      // atempo filter has range [0.5, 2.0], chain multiple if needed
      if (tempoFactor >= 0.5) {
        command = command.audioFilters(`atempo=${tempoFactor}`);
      } else {
        // Chain multiple atempo filters for extreme stretching
        const filters: string[] = [];
        let remaining = tempoFactor;
        while (remaining < 0.5) {
          filters.push('atempo=0.5');
          remaining = remaining / 0.5;
        }
        filters.push(`atempo=${remaining}`);
        command = command.audioFilters(filters);
      }
    } else if (currentDuration > targetDuration) {
      // Need to truncate - use duration option
      command = command.duration(targetDuration);
    }
    // If equal, no adjustment needed but we still process for consistency

    command
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .format('mp3')
      .on('end', async () => {
        try {
          const outputBuffer = await fs.promises.readFile(outputPath);
          // Clean up temp files
          await fs.promises.unlink(inputPath).catch(() => {});
          await fs.promises.unlink(outputPath).catch(() => {});
          resolve(outputBuffer);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', async (err) => {
        // Clean up temp files on error
        await fs.promises.unlink(inputPath).catch(() => {});
        await fs.promises.unlink(outputPath).catch(() => {});
        reject(new Error(`Failed to adjust audio duration: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Generate speech from text and save to Supabase storage and database
 * Returns the created Audio record
 */
export async function textToSpeechAndSave(
  userId: string,
  text: string,
  options: TextToSpeechOptions & { fileName?: string } = {}
): Promise<GeneratedAudio> {
  const { fileName: customFileName, targetDuration, ...ttsOptions } = options;

  // Generate speech audio
  let audioBuffer = await generateSpeech(text, ttsOptions);
  let finalDuration: number;

  // If targetDuration is specified, adjust the audio to match
  if (targetDuration !== undefined && targetDuration > 0) {
    const actualDuration = await getAudioDuration(audioBuffer);
    console.log(`[ElevenLabs] Original duration: ${actualDuration.toFixed(2)}s, target: ${targetDuration.toFixed(2)}s`);

    if (Math.abs(actualDuration - targetDuration) > 0.1) {
      // Only adjust if difference is more than 100ms
      audioBuffer = await adjustAudioDuration(audioBuffer, actualDuration, targetDuration);
      console.log(`[ElevenLabs] Audio adjusted to target duration: ${targetDuration.toFixed(2)}s`);
    }
    finalDuration = targetDuration;
  } else {
    // Get actual duration if no target specified
    finalDuration = await getAudioDuration(audioBuffer);
  }

  // Generate unique ID and file name
  const audioId = uuid();
  const timestamp = Date.now();
  const fileName = customFileName || `tts_${timestamp}.mp3`;
  const filePath = `${userId}/${audioId}_${fileName}`;

  console.log(`[ElevenLabs] Uploading to Supabase: ${filePath}`);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from('raw-audio')
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
    });

  if (uploadError) {
    console.error('[ElevenLabs] Upload error:', uploadError);
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('raw-audio')
    .getPublicUrl(filePath);

  console.log(`[ElevenLabs] Audio uploaded: ${publicUrl}`);

  // Save to database with actual/adjusted duration
  const audio = await prisma.audio.create({
    data: {
      id: audioId,
      userId,
      url: publicUrl,
      fileName,
      duration: finalDuration,
      fileSize: BigInt(audioBuffer.length),
    },
  });

  console.log(`[ElevenLabs] Audio record created: ${audio.id}`);

  return {
    id: audio.id,
    url: audio.url,
    fileName: audio.fileName,
    duration: audio.duration,
    fileSize: Number(audio.fileSize),
    createdAt: audio.createdAt,
  };
}

/**
 * Generate speech with streaming support
 * Useful for long texts where you want to start playing before generation is complete
 */
export async function generateSpeechStream(
  text: string,
  options: TextToSpeechOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const {
    voiceId = DEFAULT_VOICE_ID,
    modelId = 'eleven_multilingual_v2',
    voiceSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
    },
    outputFormat = 'mp3_44100_128',
  } = options;

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs streaming API error: ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body from ElevenLabs streaming API');
  }

  return response.body;
}

/**
 * Get information about a specific voice (from static list)
 */
export function getVoice(voiceId: string): {
  voice_id: string;
  name: string;
  category: string;
} | null {
  return VOICES.find((v) => v.voice_id === voiceId) ?? null;
}

/**
 * Get user subscription info (useful for checking quota)
 */
export async function getSubscriptionInfo(): Promise<{
  character_count: number;
  character_limit: number;
  can_extend_character_limit: boolean;
}> {
  const response = await fetch(`${ELEVENLABS_API_URL}/user/subscription`, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch subscription: ${error}`);
  }

  return response.json();
}
