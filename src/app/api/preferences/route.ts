import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET: Fetch user preferences (likes and dislikes)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { userLikes: true, userDislikes: true },
  });

  // Create profile if it doesn't exist
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        sessionVideo: [],
        sessionAudio: [],
        userLikes: '',
        userDislikes: '',
      },
      select: { userLikes: true, userDislikes: true },
    });
  }

  return NextResponse.json({
    userLikes: profile.userLikes,
    userDislikes: profile.userDislikes,
  });
}

// POST: Update user preferences
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { userLikes, userDislikes } = body;

  const updateData: { userLikes?: string; userDislikes?: string } = {};
  if (userLikes !== undefined) {
    updateData.userLikes = String(userLikes);
  }
  if (userDislikes !== undefined) {
    updateData.userDislikes = String(userDislikes);
  }

  await prisma.profile.upsert({
    where: { id: user.id },
    update: updateData,
    create: {
      id: user.id,
      sessionVideo: [],
      sessionAudio: [],
      userLikes: userLikes ?? '',
      userDislikes: userDislikes ?? '',
    },
  });

  return NextResponse.json({ success: true });
}
