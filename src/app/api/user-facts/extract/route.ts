import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ExtractedFact = {
  category: 'preference' | 'project' | 'brand' | 'workflow';
  content: string;
  confidence: number;
};

type ExtractedFacts = {
  facts: ExtractedFact[];
};

// POST: Extract facts from conversation via LLM
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const conversation = body.conversation as ConversationMessage[] | undefined;

    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return NextResponse.json({ error: 'Valid conversation array is required' }, { status: 400 });
    }

    // Fetch existing facts to avoid duplicates
    const existingFacts = await prisma.userFact.findMany({
      where: { userId: user.id },
      select: { content: true },
    });
    const existingContents = existingFacts.map(f => f.content.toLowerCase());

    const conversationText = conversation
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const prompt = `You are analyzing a conversation between a user and a video editing assistant.
Extract any facts about the user that could be useful for personalizing future interactions.

Categories of facts:
- "preference": User preferences for video editing (e.g., "prefers 16:9 aspect ratio", "likes quick transitions")
- "project": Facts about their current project (e.g., "working on a wedding video", "needs content for YouTube")
- "brand": Brand-related info (e.g., "company colors are blue and white", "brand is minimalist style")
- "workflow": Workflow preferences (e.g., "exports in ProRes format", "works in 4K resolution")

Conversation to analyze:
${conversationText}

Existing facts (do NOT duplicate these):
${existingContents.join('\n') || 'None'}

IMPORTANT:
- Extract only clear, specific facts
- Do NOT extract vague or uncertain information
- Use concise phrases (not full sentences)
- Assign confidence score 0.0-1.0 based on how certain the fact is
- Return valid JSON only

Return JSON format:
{"facts": [{"category": "preference", "content": "fact here", "confidence": 0.9}]}

If no new facts can be extracted, return: {"facts": []}`;

    const response = await callGeminiText(prompt);
    const extracted = parseJsonFromText<ExtractedFacts>(response);

    if (!extracted || !extracted.facts || extracted.facts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new facts extracted',
        facts: [],
      });
    }

    // Filter out facts that already exist
    const newFacts = extracted.facts.filter(
      (f) => !existingContents.includes(f.content.toLowerCase())
    );

    // Create the new facts in the database
    const createdFacts = await Promise.all(
      newFacts.map((fact) =>
        prisma.userFact.create({
          data: {
            userId: user.id,
            category: fact.category,
            content: fact.content,
            source: 'conversation',
            confidence: fact.confidence,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      facts: createdFacts,
    });
  } catch (error) {
    console.error('[UserFacts Extract] Error:', error);
    return NextResponse.json({ error: 'Failed to extract user facts' }, { status: 500 });
  }
}
