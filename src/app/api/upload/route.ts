import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { v4 as uuid } from 'uuid';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

<<<<<<< Updated upstream
=======
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
>>>>>>> Stashed changes
  const videoId = uuid();
  const filePath = `${user.id}/${videoId}_${file.name}`;
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
      userId: user.id,
      url: publicUrl,
      fileName: file.name,
    },
  });

  return NextResponse.json({ video });
}
