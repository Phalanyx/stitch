import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Default user ID for development (no auth)
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

// GET: Fetch timeline session
export async function GET() {
  let profile = await prisma.profile.findUnique({
    where: { id: DEFAULT_USER_ID },
    select: { sessionVideo: true },
  });

  // Create profile if it doesn't exist
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: DEFAULT_USER_ID,
        sessionVideo: [],
      },
      select: { sessionVideo: true },
    });
  }

  return NextResponse.json(profile.sessionVideo);
}

// POST: Save timeline session
export async function POST(request: NextRequest) {
  const { session_video } = await request.json();

  await prisma.profile.upsert({
    where: { id: DEFAULT_USER_ID },
    update: { sessionVideo: session_video },
    create: {
      id: DEFAULT_USER_ID,
      sessionVideo: session_video,
    },
  });

  return NextResponse.json({ success: true });
}
