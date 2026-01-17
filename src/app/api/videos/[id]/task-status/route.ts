import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getTaskStatus, generateVideoSummary } from '@/lib/twelvelabs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: Poll Twelve Labs task status and update video when complete
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

  // If no task ID, return current status
  if (!video.twelveLabsTaskId) {
    return NextResponse.json({
      id: video.id,
      twelveLabsStatus: video.twelveLabsStatus || 'pending',
      twelveLabsId: video.twelveLabsId,
      summary: video.summary,
    });
  }

  // If already ready or failed, return current status
  if (video.twelveLabsStatus === 'ready' || video.twelveLabsStatus === 'failed') {
    return NextResponse.json({
      id: video.id,
      twelveLabsStatus: video.twelveLabsStatus,
      twelveLabsId: video.twelveLabsId,
      summary: video.summary,
    });
  }

  // Poll Twelve Labs for task status
  try {
    const taskStatus = await getTaskStatus(video.twelveLabsTaskId);

    // If task is complete (ready)
    if (taskStatus.status === 'ready' && taskStatus.videoId) {
      // Generate summary
      let summary: string | null = null;
      try {
        summary = await generateVideoSummary(taskStatus.videoId);
      } catch (summaryError) {
        console.error('Failed to generate summary:', summaryError);
        // Continue without summary
      }

      // Update video with completed status
      const updatedVideo = await prisma.video.update({
        where: { id },
        data: {
          twelveLabsId: taskStatus.videoId,
          twelveLabsStatus: 'ready',
          summary,
        },
      });

      return NextResponse.json({
        id: updatedVideo.id,
        twelveLabsStatus: 'ready',
        twelveLabsId: taskStatus.videoId,
        summary,
      });
    }

    // If task failed
    if (taskStatus.status === 'failed') {
      await prisma.video.update({
        where: { id },
        data: {
          twelveLabsStatus: 'failed',
        },
      });

      return NextResponse.json({
        id: video.id,
        twelveLabsStatus: 'failed',
        twelveLabsId: null,
        summary: null,
      });
    }

    // Task still in progress (indexing, pending, validating, etc.)
    return NextResponse.json({
      id: video.id,
      twelveLabsStatus: 'indexing',
      twelveLabsId: null,
      summary: null,
    });
  } catch (error) {
    console.error('Failed to get task status:', error);
    return NextResponse.json({
      id: video.id,
      twelveLabsStatus: video.twelveLabsStatus,
      twelveLabsId: video.twelveLabsId,
      summary: video.summary,
      error: 'Failed to poll task status',
    });
  }
}
