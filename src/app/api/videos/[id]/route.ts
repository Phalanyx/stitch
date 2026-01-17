import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';

// DELETE: Remove a video
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Find the video and verify ownership
  const video = await prisma.video.findUnique({
    where: { id },
  });

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  if (video.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Extract the storage path from the URL
  // URL format: .../raw-videos/{userId}/{videoId}_{fileName}
  const urlParts = video.url.split('/raw-videos/');
  if (urlParts.length === 2) {
    const storagePath = urlParts[1];
    // Delete from Supabase Storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('raw-videos')
      .remove([storagePath]);

    if (storageError) {
      console.error('Failed to delete video from storage:', storageError);
      // Continue with database deletion even if storage deletion fails
    }
  }

  // Delete from database
  await prisma.video.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}

// PATCH: Update a video (e.g., rename)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { fileName } = body;

  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'Invalid fileName' }, { status: 400 });
  }

  // Find the video and verify ownership
  const video = await prisma.video.findUnique({
    where: { id },
  });

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  if (video.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Update the video
  const updatedVideo = await prisma.video.update({
    where: { id },
    data: { fileName },
  });

  return NextResponse.json({
    ...updatedVideo,
    fileSize: updatedVideo.fileSize ? Number(updatedVideo.fileSize) : null,
  });
}
