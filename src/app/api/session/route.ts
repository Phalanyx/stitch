import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { validateTrack, TimelineClip } from '@/lib/timeline-validation';

// GET: Fetch user's timeline session
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { sessionVideo: true, sessionAudio: true },
  });

  // Create profile if it doesn't exist
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        sessionVideo: [],
        sessionAudio: [],
      },
      select: { sessionVideo: true, sessionAudio: true },
    });
  }

  return NextResponse.json({
    session_video: profile.sessionVideo,
    session_audio: profile.sessionAudio,
  });
}

// POST: Save user's timeline session
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { session_video, session_audio } = body;

  // Validate video track for overlaps
  if (session_video !== undefined && Array.isArray(session_video)) {
    const videoViolations = validateTrack(session_video as TimelineClip[]);
    if (videoViolations.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'OVERLAPPING_CLIPS',
        details: { track: 'video', violations: videoViolations },
      }, { status: 400 });
    }
  }

  // Validate audio track(s) for overlaps
  if (session_audio !== undefined && Array.isArray(session_audio)) {
    // Detect if new format (array of layers with 'clips' property) or old format (flat array of clips)
    const isNewFormat = session_audio.length > 0 && 'clips' in session_audio[0];

    if (isNewFormat) {
      // New format: validate each layer's clips separately
      for (const layer of session_audio as { id: string; clips: TimelineClip[] }[]) {
        const audioViolations = validateTrack(layer.clips);
        if (audioViolations.length > 0) {
          return NextResponse.json({
            success: false,
            error: 'OVERLAPPING_CLIPS',
            details: { track: `audio-layer-${layer.id}`, violations: audioViolations },
          }, { status: 400 });
        }
      }
    } else {
      // Old format: validate as single flat array
      const audioViolations = validateTrack(session_audio as TimelineClip[]);
      if (audioViolations.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'OVERLAPPING_CLIPS',
          details: { track: 'audio', violations: audioViolations },
        }, { status: 400 });
      }
    }
  }

  const updateData: { sessionVideo?: object; sessionAudio?: object } = {};
  if (session_video !== undefined) {
    updateData.sessionVideo = session_video;
  }
  if (session_audio !== undefined) {
    updateData.sessionAudio = session_audio;
  }

  await prisma.profile.upsert({
    where: { id: user.id },
    update: updateData,
    create: {
      id: user.id,
      sessionVideo: session_video ?? [],
      sessionAudio: session_audio ?? [],
    },
  });

  return NextResponse.json({ success: true });
}
