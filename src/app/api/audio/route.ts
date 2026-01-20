import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Audio API');

// GET: List user's uploaded audio files
export async function GET() {
  const startTime = Date.now();
  logger.info('GET request received');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    logger.warn('Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const audioFiles = await prisma.audio.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { video: { select: { id: true, fileName: true } } },
  });

  // Convert BigInt fileSize to Number for JSON serialization
  const serializedAudio = audioFiles.map((audio) => ({
    ...audio,
    fileSize: audio.fileSize ? Number(audio.fileSize) : null,
  }));

  logger.info('GET request completed', { duration: Date.now() - startTime, count: audioFiles.length });
  return NextResponse.json(serializedAudio);
}
