import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// POST: Record a tool option edit (original -> edited value)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { toolName, paramName, originalValue, editedValue, userContext } = body;

    if (!toolName || !paramName || !originalValue || !editedValue) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Don't record if the values are the same
    if (originalValue.trim() === editedValue.trim()) {
      return NextResponse.json({
        success: true,
        message: 'No change detected, edit not recorded',
      });
    }

    const edit = await prisma.toolEditHistory.create({
      data: {
        userId: user.id,
        toolName,
        paramName,
        originalValue,
        editedValue,
        userContext: userContext || null,
      },
    });

    return NextResponse.json({
      success: true,
      editId: edit.id,
    });
  } catch (error) {
    console.error('[ToolEdits POST] Error:', error);
    return NextResponse.json({ error: 'Failed to record tool edit' }, { status: 500 });
  }
}

// GET: Fetch edit history (optionally filtered)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get('toolName');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: { userId: string; toolName?: string } = { userId: user.id };
    if (toolName) where.toolName = toolName;

    const edits = await prisma.toolEditHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100), // Cap at 100
    });

    return NextResponse.json({ edits });
  } catch (error) {
    console.error('[ToolEdits GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch edit history' }, { status: 500 });
  }
}
