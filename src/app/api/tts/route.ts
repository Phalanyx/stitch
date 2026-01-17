import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { textToSpeechAndSave, getVoices } from '@/lib/elevenlabs';

// POST: Generate speech from text and save to database
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, voiceId, modelId, fileName, voiceSettings } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Text exceeds maximum length of 5000 characters' },
        { status: 400 }
      );
    }

    console.log(`[TTS API] Generating speech for user: ${user.id}`);

    const audio = await textToSpeechAndSave(user.id, text, {
      voiceId,
      modelId,
      fileName,
      voiceSettings,
    });

    return NextResponse.json({ audio });
  } catch (error) {
    console.error('[TTS API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate speech' },
      { status: 500 }
    );
  }
}

// GET: List available voices
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const voices = await getVoices();

    return NextResponse.json({ voices });
  } catch (error) {
    console.error('[TTS API] Error fetching voices:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch voices' },
      { status: 500 }
    );
  }
}
