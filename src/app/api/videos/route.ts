import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Default user ID for development (no auth)
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

// GET: List uploaded videos
export async function GET() {
  const videos = await prisma.video.findMany({
    where: { userId: DEFAULT_USER_ID },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(videos);
}
