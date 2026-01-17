import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';
import { v4 as uuid } from 'uuid';
import { uploadVideoToTwelveLabs, generateVideoSummary } from '@/lib/twelvelabs';

export async function POST(request: NextRequest) {
  // Get the access token from the Authorization header
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const videoId = uuid();
  const filePath = `${user.id}/${videoId}_${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Step 1: Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from('raw-videos')
    .upload(filePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('raw-videos')
    .getPublicUrl(filePath);

  // Step 2: Upload to Twelve Labs and wait for indexing
  let twelveLabsId: string | null = null;
  let twelveLabsStatus: string = 'pending';
  let summary: string | null = null;

  try {
    const result = await uploadVideoToTwelveLabs(publicUrl, file.name);
    twelveLabsId = result.videoId;
    twelveLabsStatus = 'ready';

    // Step 3: Generate summary using Pegasus
    try {
      summary = await generateVideoSummary(result.videoId);
    } catch (summaryError) {
      console.error('Failed to generate summary:', summaryError);
      // Continue without summary - not critical
    }
  } catch (twelveLabsError) {
    console.error('Twelve Labs upload failed:', twelveLabsError);
    twelveLabsStatus = 'failed';
    // Continue without Twelve Labs - video is still usable from Supabase
  }

  // Step 4: Save metadata to database via Prisma
  const video = await prisma.video.create({
    data: {
      id: videoId,
      userId: user.id,
      url: publicUrl,
      fileName: file.name,
      twelveLabsId,
      twelveLabsStatus,
      summary,
    },
  });

  return NextResponse.json({
    video: {
      ...video,
      fileSize: video.fileSize ? Number(video.fileSize) : null,
    },
  });
}
