import { NextRequest, NextResponse } from 'next/server';
import { compileAndSendDigest } from '@/lib/digest-engine';
import { getEnabledAutomations, getLastDigestTimestamp, ensureDatabase } from '@/lib/db';

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureDatabase();
  const automations = await getEnabledAutomations();

  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const currentHour = nowET.getHours();
  const currentMinute = nowET.getMinutes();
  const currentMinutes = currentHour * 60 + currentMinute;

  const results: Array<{ automationId: number; name: string; result?: any; skipped?: boolean; reason?: string; error?: string }> = [];

  for (const automation of automations) {
    const [targetHour, targetMinute] = automation.delivery_time.split(':').map(Number);
    const targetMinutes = targetHour * 60 + targetMinute;
    const diff = Math.abs(currentMinutes - targetMinutes);

    if (diff > 15) {
      results.push({
        automationId: automation.id,
        name: automation.name,
        skipped: true,
        reason: `Not delivery time. Current: ${currentHour}:${String(currentMinute).padStart(2, '0')} ET, Target: ${automation.delivery_time} ET`,
      });
      continue;
    }

    // Guard against duplicate sends — skip if already sent in the last 2 hours
    const lastSent = await getLastDigestTimestamp(automation.id);
    if (lastSent) {
      const msSinceLastSend = Date.now() - lastSent.getTime();
      const twoHoursMs = 2 * 60 * 60 * 1000;
      if (msSinceLastSend < twoHoursMs) {
        results.push({
          automationId: automation.id,
          name: automation.name,
          skipped: true,
          reason: `Already sent ${Math.round(msSinceLastSend / 60000)} minutes ago`,
        });
        continue;
      }
    }

    try {
      console.log(`[Cron] Starting "${automation.name}" digest generation...`);
      const result = await compileAndSendDigest(automation);
      console.log(`[Cron] "${automation.name}" completed:`, {
        digestId: result.digestId,
        success: result.success,
        executionTimeMs: result.executionTimeMs,
        errorCount: Object.keys(result.errors).length,
      });
      results.push({ automationId: automation.id, name: automation.name, result });
    } catch (error) {
      console.error(`[Cron] Fatal error for "${automation.name}":`, error);
      results.push({
        automationId: automation.id,
        name: automation.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({ automations: results });
}

export const maxDuration = 60;
