import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET: Fetch all stylistic rules (or filter by toolName)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get('toolName');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const where: { userId: string; toolName?: string; isActive?: boolean } = { userId: user.id };
    if (toolName) where.toolName = toolName;
    if (activeOnly) where.isActive = true;

    const rules = await prisma.stylisticRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('[StylisticRules GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch stylistic rules' }, { status: 500 });
  }
}

// POST: Create a new stylistic rule
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { toolName, paramName, ruleType, pattern, replacement, description } = body;

    if (!toolName || !paramName || !ruleType || !pattern || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validRuleTypes = ['addition', 'replacement', 'style'];
    if (!validRuleTypes.includes(ruleType)) {
      return NextResponse.json({ error: 'Invalid rule type' }, { status: 400 });
    }

    const rule = await prisma.stylisticRule.create({
      data: {
        userId: user.id,
        toolName,
        paramName,
        ruleType,
        pattern,
        replacement: replacement || null,
        description,
        occurrences: 1,
        isActive: false, // Rules start inactive, become active after 3+ occurrences
      },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('[StylisticRules POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create stylistic rule' }, { status: 500 });
  }
}

// PATCH: Update a stylistic rule
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, pattern, replacement, description, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
    }

    // Check that the rule belongs to the user
    const existingRule = await prisma.stylisticRule.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const updateData: { pattern?: string; replacement?: string | null; description?: string; isActive?: boolean } = {};
    if (pattern !== undefined) updateData.pattern = pattern;
    if (replacement !== undefined) updateData.replacement = replacement;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const rule = await prisma.stylisticRule.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('[StylisticRules PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update stylistic rule' }, { status: 500 });
  }
}

// DELETE: Delete a stylistic rule
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
      return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
    }

    // Check that the rule belongs to the user
    const existingRule = await prisma.stylisticRule.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await prisma.stylisticRule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[StylisticRules DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete stylistic rule' }, { status: 500 });
  }
}
