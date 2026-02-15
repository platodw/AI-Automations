import { NextRequest, NextResponse } from 'next/server';
import { compileAndSendDigest } from '@/lib/digest-engine';
import { getConfig } from '@/lib/db';

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if it's the right time to send (configurable delivery time)
  const deliveryTime = await getConfig('delivery_time') || '06:30';
  const [targetHour, targetMinute] = deliveryTime.split(':').map(Number);

  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const currentHour = nowET.getHours();
  const currentMinute = nowET.getMinutes();

  // Allow a 15-minute window around the target time
  const targetMinutes = targetHour * 60 + targetMinute;
  const currentMinutes = currentHour * 60 + currentMinute;
  const diff = Math.abs(currentMinutes - targetMinutes);

  if (diff > 15) {
    return NextResponse.json({
      skipped: true,
      reason: `Not delivery time. Current: ${currentHour}:${String(currentMinute).padStart(2, '0')} ET, Target: ${deliveryTime} ET`,
    });
  }

  try {
    console.log('[Cron] Starting morning digest generation...');
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
