import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';
import { v4 as uuid } from 'uuid';
import { createTwelveLabsTask } from '@/lib/twelvelabs';

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

  // Step 2: Create Twelve Labs task (async - returns immediately)
  let twelveLabsTaskId: string | null = null;
  let twelveLabsStatus: string = 'pending';

  try {
    const result = await createTwelveLabsTask(publicUrl, file.name);
    twelveLabsTaskId = result.taskId;
    twelveLabsStatus = 'indexing';
  } catch (twelveLabsError) {
    console.error('Twelve Labs task creation failed:', twelveLabsError);
    twelveLabsStatus = 'failed';
    // Continue without Twelve Labs - video is still usable from Supabase
  }

  // Step 3: Save metadata to database via Prisma
  const video = await prisma.video.create({
    data: {
      id: videoId,
      userId: user.id,
      url: publicUrl,
      fileName: file.name,
      twelveLabsTaskId,
      twelveLabsStatus,
    },
  });

  return NextResponse.json({ video });
}
