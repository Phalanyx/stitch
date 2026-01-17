import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';

// DELETE: Remove an audio file
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

  // Find the audio and verify ownership
  const audio = await prisma.audio.findUnique({
    where: { id },
  });

  if (!audio) {
    return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
  }

  if (audio.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Extract the storage path from the URL
  // URL format: .../raw-audio/{userId}/{audioId}_{fileName}
  const urlParts = audio.url.split('/raw-audio/');
  if (urlParts.length === 2) {
    const storagePath = urlParts[1];
    // Delete from Supabase Storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('raw-audio')
      .remove([storagePath]);

    if (storageError) {
      console.error('Failed to delete audio from storage:', storageError);
      // Continue with database deletion even if storage deletion fails
    }
  }

  // Delete from database
  await prisma.audio.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}

// PATCH: Update an audio file (e.g., rename)
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

  // Find the audio and verify ownership
  const audio = await prisma.audio.findUnique({
    where: { id },
  });

  if (!audio) {
    return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
  }

  if (audio.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Update the audio
  const updatedAudio = await prisma.audio.update({
    where: { id },
    data: { fileName },
  });

  return NextResponse.json({
    ...updatedAudio,
    fileSize: updatedAudio.fileSize ? Number(updatedAudio.fileSize) : null,
  });
}
