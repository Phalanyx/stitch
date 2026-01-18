import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import {
  downloadFile,
  extractFrameAtTime,
  getVideoDuration,
  readImageAsGenAI,
} from '@/lib/video-frames';

type TransitionRequest = {
  precedingUrl: string;
  succeedingUrl: string;
  precedingTrimEnd?: number;
  succeedingTrimStart?: number;
  prompt?: string;
  durationSeconds?: number;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as TransitionRequest;
  if (!body?.precedingUrl || !body?.succeedingUrl) {
    return NextResponse.json(
      { error: 'Missing precedingUrl or succeedingUrl' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing GEMINI_API_KEY' },
      { status: 500 }
    );
  }

  const tempDir = os.tmpdir();
  const transitionId = uuid();
  const precedingPath = path.join(tempDir, `${transitionId}_preceding.mp4`);
  const succeedingPath = path.join(tempDir, `${transitionId}_succeeding.mp4`);
  const firstFramePath = path.join(tempDir, `${transitionId}_first.jpg`);
  const lastFramePath = path.join(tempDir, `${transitionId}_last.jpg`);
  const outputPath = path.join(tempDir, `${transitionId}_transition.mp4`);

  try {
    await downloadFile(body.precedingUrl, precedingPath);
    await downloadFile(body.succeedingUrl, succeedingPath);

    const precedingDuration = await getVideoDuration(precedingPath);
    const precedingTrimEnd = body.precedingTrimEnd ?? 0;
    const lastFrameTime = Math.max(precedingDuration - precedingTrimEnd - 0.05, 0);

    const succeedingTrimStart = body.succeedingTrimStart ?? 0;
    await extractFrameAtTime(precedingPath, lastFrameTime, lastFramePath);
    await extractFrameAtTime(succeedingPath, succeedingTrimStart, firstFramePath);

    const firstFrame = readImageAsGenAI(lastFramePath);
    const lastFrame = readImageAsGenAI(firstFramePath);

    const ai = new GoogleGenAI({ apiKey });
    const prompt =
      body.prompt ||
      'Create a smooth, cinematic fade transition between the two frames. Begin with the first frame and end with the second frame.';

    const durationSeconds = Math.min(8, Math.max(4, body.durationSeconds ?? 4));

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt,
      image: firstFrame,
      config: {
        numberOfVideos: 1,
        durationSeconds,
        generateAudio: false,
        lastFrame,
      },
    });

    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const video = operation.response?.generatedVideos?.[0];
    if (!video) {
      console.error('[transitions] No video generated in operation response:', JSON.stringify(operation.response));
      return NextResponse.json({ error: 'No video generated' }, { status: 502 });
    }

    // Download video using authenticated URL
    const videoUrl = `${video.video.uri}&key=${apiKey}`;
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) {
      console.error('[transitions] Failed to download video:', videoResp.status, videoResp.statusText);
      return NextResponse.json({ error: 'Failed to download generated video' }, { status: 502 });
    }
    const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
    await fs.promises.writeFile(outputPath, videoBuffer);

    const transitionDuration = await getVideoDuration(outputPath);
    const fileName = `transition_${transitionId}.mp4`;
    const filePath = `${user.id}/${transitionId}_${fileName}`;
    const buffer = await fs.promises.readFile(outputPath);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('raw-videos')
      .upload(filePath, buffer, { contentType: 'video/mp4' });

    if (uploadError) {
      console.error('[transitions] Upload error:', uploadError.message);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('raw-videos')
      .getPublicUrl(filePath);

    const videoRecord = await prisma.video.create({
      data: {
        id: transitionId,
        userId: user.id,
        url: publicUrl,
        fileName,
        duration: transitionDuration,
        twelveLabsStatus: 'skipped',
      },
    });

    return NextResponse.json({
      videoId: videoRecord.id,
      url: videoRecord.url,
      duration: videoRecord.duration,
    });
  } catch (error) {
    console.error('[transitions] Error creating transition:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transition' },
      { status: 500 }
    );
  } finally {
    const cleanup = [precedingPath, succeedingPath, firstFramePath, lastFramePath, outputPath];
    await Promise.all(
      cleanup.map(async (p) => {
        try {
          await fs.promises.unlink(p);
        } catch {
          // Ignore cleanup errors.
        }
      })
    );
  }
}
