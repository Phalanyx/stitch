import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET: List user's uploaded audio files
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const audioFiles = await prisma.audio.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  // Convert BigInt fileSize to Number for JSON serialization
  const serializedAudio = audioFiles.map((audio) => ({
    ...audio,
    fileSize: audio.fileSize ? Number(audio.fileSize) : null,
  }));

  return NextResponse.json(serializedAudio);
}
