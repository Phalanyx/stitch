import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Videos API');

// GET: List user's uploaded videos
export async function GET() {
  const startTime = Date.now();
  logger.info('GET request received');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    logger.warn('Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const videos = await prisma.video.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { audio: true },
  });

  // Convert BigInt fileSize to number for JSON serialization
  const serializedVideos = videos.map((video) => ({
    ...video,
    audio: video.audio
      ? {
          ...video.audio,
          fileSize: video.audio.fileSize ? Number(video.audio.fileSize) : null,
        }
      : null,
  }));

  logger.info('GET request completed', { duration: Date.now() - startTime, count: videos.length });
  return NextResponse.json(serializedVideos);
}
