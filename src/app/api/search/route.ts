import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchVideos, SearchOption } from '@/lib/twelvelabs';

// POST: Search indexed videos using natural language
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Search API] Received search request');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[Search API] Unauthorized request - no user');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[Search API] User authenticated: ${user.id}`);

  try {
    const body = await request.json();
    const { query, searchOptions, limit } = body as {
      query?: string;
      searchOptions?: SearchOption[];
      limit?: number;
    };

    console.log('[Search API] Request params:', {
      query,
      searchOptions,
      limit,
    });

    if (!query || typeof query !== 'string' || query.trim() === '') {
      console.warn('[Search API] Invalid query parameter:', query);
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    console.log(`[Search API] Executing search for: "${query}"`);
    const searchStartTime = Date.now();

    const results = await searchVideos(query, {
      searchOptions,
      limit,
    });

    const searchDuration = Date.now() - searchStartTime;
    const totalDuration = Date.now() - startTime;

    console.log(`[Search API] Search completed in ${searchDuration}ms, found ${results.length} results`);
    console.log(`[Search API] Total request time: ${totalDuration}ms`);

    return NextResponse.json({ results });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('[Search API] Error after', totalDuration, 'ms:', error);

    // Extract error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    if (errorStack) {
      console.error('[Search API] Stack trace:', errorStack);
    }

    return NextResponse.json(
      {
        error: 'Failed to search videos',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
