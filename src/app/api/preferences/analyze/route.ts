import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ExtractedPreferences = {
  likes: string[];
  dislikes: string[];
};

// POST: Analyze conversation history to extract user preferences
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const conversation = body.conversation as ConversationMessage[];

  if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
    return NextResponse.json({ error: 'No conversation provided' }, { status: 400 });
  }

  // Fetch existing preferences
  let profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { userLikes: true, userDislikes: true },
  });

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

  const existingLikes = profile.userLikes;
  const existingDislikes = profile.userDislikes;

  // Build prompt for preference extraction
  const conversationText = conversation
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const prompt = `You are analyzing a conversation between a user and a video editing assistant.
Extract any video editing preferences the user has expressed (likes and dislikes).

Focus on video editing preferences such as:
- Editing styles (fast-paced, slow, cinematic)
- Transition types (smooth, abrupt, fade, cut)
- Visual effects preferences
- Audio preferences
- Pacing and rhythm
- Color grading preferences
- Any other video production preferences

Current saved preferences:
Likes: ${existingLikes || 'None saved yet'}
Dislikes: ${existingDislikes || 'None saved yet'}

Conversation to analyze:
${conversationText}

IMPORTANT:
- Only extract NEW preferences that are not already in the saved preferences
- Be concise - use short phrases, not sentences
- Return valid JSON only

Return JSON format:
{"likes": ["preference1", "preference2"], "dislikes": ["preference1", "preference2"]}

If no new preferences found, return: {"likes": [], "dislikes": []}`;

  try {
    const response = await callGeminiText(prompt);
    const extracted = parseJsonFromText<ExtractedPreferences>(response);

    if (!extracted) {
      return NextResponse.json({
        success: true,
        message: 'No preferences extracted',
        updated: false,
      });
    }

    // Merge new preferences with existing ones
    const mergePreferences = (existing: string, newItems: string[]): string => {
      if (newItems.length === 0) return existing;

      const existingItems = existing
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      const uniqueNew = newItems.filter(
        (item) => !existingItems.includes(item.toLowerCase())
      );

      if (uniqueNew.length === 0) return existing;

      const combined = existing ? `${existing}, ${uniqueNew.join(', ')}` : uniqueNew.join(', ');
      return combined;
    };

    const updatedLikes = mergePreferences(existingLikes, extracted.likes || []);
    const updatedDislikes = mergePreferences(existingDislikes, extracted.dislikes || []);

    // Only update if there are changes
    const hasChanges = updatedLikes !== existingLikes || updatedDislikes !== existingDislikes;

    if (hasChanges) {
      await prisma.profile.update({
        where: { id: user.id },
        data: {
          userLikes: updatedLikes,
          userDislikes: updatedDislikes,
        },
      });
    }

    return NextResponse.json({
      success: true,
      updated: hasChanges,
      newLikes: extracted.likes || [],
      newDislikes: extracted.dislikes || [],
      userLikes: updatedLikes,
      userDislikes: updatedDislikes,
    });
  } catch (error) {
    console.error('Error analyzing preferences:', error);
    return NextResponse.json(
      { error: 'Failed to analyze preferences' },
      { status: 500 }
    );
  }
}
