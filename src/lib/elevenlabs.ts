import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Default voice ID - Rachel (a popular ElevenLabs voice)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

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
 * Get available voices from ElevenLabs
 */
export async function getVoices(): Promise<Array<{ voice_id: string; name: string; category: string }>> {
  const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch voices: ${error}`);
  }

  const data = await response.json();
  return data.voices;
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
 * Generate speech from text and save to Supabase storage and database
 * Returns the created Audio record
 */
export async function textToSpeechAndSave(
  userId: string,
  text: string,
  options: TextToSpeechOptions & { fileName?: string } = {}
): Promise<GeneratedAudio> {
  const { fileName: customFileName, ...ttsOptions } = options;

  // Generate speech audio
  const audioBuffer = await generateSpeech(text, ttsOptions);

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

  // Estimate duration based on text length (rough approximation)
  // Average speaking rate is ~150 words per minute
  const wordCount = text.split(/\s+/).length;
  const estimatedDuration = (wordCount / 150) * 60; // in seconds

  // Save to database
  const audio = await prisma.audio.create({
    data: {
      id: audioId,
      userId,
      url: publicUrl,
      fileName,
      duration: estimatedDuration,
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
 * Get information about a specific voice
 */
export async function getVoice(voiceId: string): Promise<{
  voice_id: string;
  name: string;
  category: string;
  description: string;
  labels: Record<string, string>;
}> {
  const response = await fetch(`${ELEVENLABS_API_URL}/voices/${voiceId}`, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch voice: ${error}`);
  }

  return response.json();
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
