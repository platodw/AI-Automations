import { NextRequest, NextResponse } from 'next/server';
import { compileAndSendDigest } from '@/lib/digest-engine';

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron] Starting daily digest generation...');
    const result = await compileAndSendDigest();
    console.log('[Cron] Digest completed:', {
      digestId: result.digestId,
      success: result.success,
      executionTimeMs: result.executionTimeMs,
      errorCount: Object.keys(result.errors).length,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
