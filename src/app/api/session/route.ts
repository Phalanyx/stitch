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
    select: { sessionVideo: true },
  });

  // Create profile if it doesn't exist
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        sessionVideo: [],
      },
      select: { sessionVideo: true },
    });
  }

  return NextResponse.json(profile.sessionVideo);
}

// POST: Save user's timeline session
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { session_video } = await request.json();

  await prisma.profile.upsert({
    where: { id: user.id },
    update: { sessionVideo: session_video },
    create: {
      id: user.id,
      sessionVideo: session_video,
    },
  });

  return NextResponse.json({ success: true });
}
