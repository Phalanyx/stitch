import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';
import { v4 as uuid } from 'uuid';

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

  // Validate audio file type
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid audio file type' }, { status: 400 });
  }

  const audioId = uuid();
  const filePath = `${user.id}/${audioId}_${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from('raw-audio')
    .upload(filePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('raw-audio')
    .getPublicUrl(filePath);

  // Save metadata to database via Prisma
  const audio = await prisma.audio.create({
    data: {
      id: audioId,
      userId: user.id,
      url: publicUrl,
      fileName: file.name,
      fileSize: BigInt(file.size),
    },
  });

  return NextResponse.json({
    audio: {
      ...audio,
      fileSize: audio.fileSize ? Number(audio.fileSize) : null,
    },
  });
}
