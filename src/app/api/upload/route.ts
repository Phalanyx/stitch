import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuid } from 'uuid';

// Default user ID for development (no auth)
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const supabase = await createClient();
  const videoId = uuid();
  const filePath = `${DEFAULT_USER_ID}/${videoId}_${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('raw-videos')
    .upload(filePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage
    .from('raw-videos')
    .getPublicUrl(filePath);

  // Save metadata to database via Prisma
  const video = await prisma.video.create({
    data: {
      id: videoId,
      userId: DEFAULT_USER_ID,
      url: publicUrl,
      fileName: file.name,
    },
  });

  return NextResponse.json({ video });
}
