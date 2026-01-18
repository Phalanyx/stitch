import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

type FeedbackRequest = {
  feedbackType: 'like' | 'dislike';
  messageContent: string;
  feedbackText?: string;
};

// POST: Save message feedback and trigger preference analysis
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as FeedbackRequest;
  const { feedbackType, messageContent, feedbackText } = body;

  if (!feedbackType || !['like', 'dislike'].includes(feedbackType)) {
    return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 });
  }

  if (!messageContent) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
  }

  try {
    // Save feedback to database
    const feedback = await prisma.messageFeedback.create({
      data: {
        userId: user.id,
        feedbackType,
        messageContent,
        feedbackText: feedbackText || null,
      },
    });

    // Trigger preference analysis in the background
    const baseUrl = request.nextUrl.origin;
    fetch(`${baseUrl}/api/preferences/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        feedback: {
          type: feedbackType,
          messageContent,
          feedbackText,
        },
      }),
    }).catch((error) => {
      console.error('Error triggering preference analysis:', error);
    });

    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
    });
  } catch (error) {
    console.error('Error saving feedback:', error);
    return NextResponse.json(
      { error: 'Failed to save feedback' },
      { status: 500 }
    );
  }
}
