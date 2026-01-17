import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getVideoStatus } from '@/lib/twelvelabs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: Get video status including Twelve Labs indexing status
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const video = await prisma.video.findUnique({
    where: { id },
  });

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  if (video.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // If video has a Twelve Labs ID and status is not ready, check current status
  if (video.twelveLabsId && video.twelveLabsStatus !== 'ready') {
    try {
      const status = await getVideoStatus(video.twelveLabsId);
      
      // Update status in database if changed
      if (status.status !== video.twelveLabsStatus) {
        await prisma.video.update({
          where: { id },
          data: { 
            twelveLabsStatus: status.status,
            duration: status.duration ?? video.duration,
          },
        });
      }

      return NextResponse.json({
        id: video.id,
        twelveLabsStatus: status.status,
        summary: video.summary,
        duration: status.duration ?? video.duration,
      });
    } catch (error) {
      console.error('Failed to get Twelve Labs status:', error);
    }
  }

  return NextResponse.json({
    id: video.id,
    twelveLabsStatus: video.twelveLabsStatus,
    summary: video.summary,
    duration: video.duration,
  });
}
