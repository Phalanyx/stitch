import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';
import { v4 as uuid } from 'uuid';
import { createTwelveLabsTask } from '@/lib/twelvelabs';
import { extractAudioFromVideo, cleanupTempAudio } from '@/lib/audio-extractor';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const customName = formData.get('customName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const videoId = uuid();
    // Use customName if provided, otherwise use original filename
    const displayName = customName?.trim() || file.name;
    // Get base name without extension for audio naming
    const baseName = path.basename(displayName, path.extname(displayName));
    const filePath = `${user.id}/${videoId}_${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Step 1: Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('raw-videos')
      .upload(filePath, buffer, { contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('raw-videos')
      .getPublicUrl(filePath);

    // Step 2: Create Twelve Labs task (async - returns immediately)
    let twelveLabsTaskId: string | null = null;
    let twelveLabsStatus: string = 'pending';

    try {
      const result = await createTwelveLabsTask(publicUrl, displayName);
      twelveLabsTaskId = result.taskId;
      twelveLabsStatus = 'indexing';
    } catch (twelveLabsError) {
      console.error('Twelve Labs task creation failed:', twelveLabsError);
      twelveLabsStatus = 'failed';
      // Continue without Twelve Labs - video is still usable from Supabase
    }
  // Step 3: Extract audio from video (non-blocking - failure doesn't stop upload)
  let audioId: string | null = null;
  let videoDuration: number | null = null;

    try {
      const audioResult = await extractAudioFromVideo(buffer, videoId, baseName);
    // Store the duration for the video record (same as audio duration)
    videoDuration = audioResult.duration || null;

    // Upload audio to raw-audio bucket
    const audioFileName = `${baseName}_audio.mp3`;
    const audioFilePath = `${user.id}/${videoId}_${audioFileName}`;
    const audioBuffer = await fs.promises.readFile(audioResult.audioPath);

      const { error: audioUploadError } = await supabaseAdmin.storage
        .from('raw-audio')
        .upload(audioFilePath, audioBuffer, { contentType: 'audio/mpeg' });

      if (!audioUploadError) {
        const { data: { publicUrl: audioPublicUrl } } = supabaseAdmin.storage
          .from('raw-audio')
          .getPublicUrl(audioFilePath);

        // Create Audio record in database
        const audio = await prisma.audio.create({
          data: {
            userId: user.id,
            url: audioPublicUrl,
            fileName: audioFileName,
            duration: audioResult.duration || null,
            fileSize: BigInt(audioResult.fileSize),
          },
        });

        audioId = audio.id;
      } else {
        console.error('Audio upload to storage failed:', audioUploadError);
      }

      // Cleanup temp audio file
      await cleanupTempAudio(audioResult.audioPath);
    } catch (audioError) {
      console.error('Audio extraction failed:', audioError);
      // Continue without audio - video is still usable
    }

    // Step 4: Save video metadata to database via Prisma
    const video = await prisma.video.create({
      data: {
        id: videoId,
        userId: user.id,
        url: publicUrl,
        fileName: displayName,
        duration: videoDuration,
        twelveLabsTaskId,
        twelveLabsStatus,
        audioId,
      },
      include: { audio: true },
    });

    // Convert BigInt fileSize to number for JSON serialization
    const serializedVideo = {
      ...video,
      audio: video.audio
        ? {
            ...video.audio,
            fileSize: video.audio.fileSize ? Number(video.audio.fileSize) : null,
          }
        : null,
    };

    return NextResponse.json({ video: serializedVideo });
  } catch (error) {
    console.error('Upload route error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Upload failed',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
