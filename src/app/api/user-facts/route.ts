import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET: Fetch all user facts
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const facts = await prisma.userFact.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ facts });
  } catch (error) {
    console.error('[UserFacts GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch user facts' }, { status: 500 });
  }
}

// POST: Create a new user fact
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { category, content, source = 'manual', confidence = 1.0 } = body;

    if (!category || !content) {
      return NextResponse.json({ error: 'Category and content are required' }, { status: 400 });
    }

    const validCategories = ['preference', 'project', 'brand', 'workflow'];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const fact = await prisma.userFact.create({
      data: {
        userId: user.id,
        category,
        content,
        source,
        confidence,
      },
    });

    return NextResponse.json({ fact });
  } catch (error) {
    console.error('[UserFacts POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create user fact' }, { status: 500 });
  }
}

// PATCH: Update a user fact
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, category, content, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: 'Fact ID is required' }, { status: 400 });
    }

    // Check that the fact belongs to the user
    const existingFact = await prisma.userFact.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingFact) {
      return NextResponse.json({ error: 'Fact not found' }, { status: 404 });
    }

    const updateData: { category?: string; content?: string; isActive?: boolean } = {};
    if (category !== undefined) updateData.category = category;
    if (content !== undefined) updateData.content = content;
    if (isActive !== undefined) updateData.isActive = isActive;

    const fact = await prisma.userFact.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ fact });
  } catch (error) {
    console.error('[UserFacts PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update user fact' }, { status: 500 });
  }
}

// DELETE: Delete a user fact
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Fact ID is required' }, { status: 400 });
    }

    // Check that the fact belongs to the user
    const existingFact = await prisma.userFact.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingFact) {
      return NextResponse.json({ error: 'Fact not found' }, { status: 404 });
    }

    await prisma.userFact.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[UserFacts DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete user fact' }, { status: 500 });
  }
}
