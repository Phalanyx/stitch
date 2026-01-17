import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

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

  const updateData: { sessionVideo?: unknown; sessionAudio?: unknown } = {};
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
