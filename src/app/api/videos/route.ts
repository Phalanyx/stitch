import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET: List user's uploaded videos
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const videos = await prisma.video.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  // Convert BigInt fileSize to Number for JSON serialization
  const serializedVideos = videos.map((video) => ({
    ...video,
    fileSize: video.fileSize ? Number(video.fileSize) : null,
  }));

  return NextResponse.json(serializedVideos);
}
