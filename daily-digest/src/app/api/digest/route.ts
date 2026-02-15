import { NextRequest, NextResponse } from 'next/server';
import { compileAndSendDigest, previewDigest } from '@/lib/digest-engine';
import { getAutomation, getAllAutomations, ensureDatabase } from '@/lib/db';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const session = req.cookies.get('digest_session');

  if (!session?.value && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const automationId = req.nextUrl.searchParams.get('automationId');

    let automation;
    if (automationId) {
      automation = await getAutomation(parseInt(automationId));
    } else {
      // Default to the first automation
      const automations = await getAllAutomations();
      automation = automations[0];
    }

    if (!automation) {
      return NextResponse.json({ error: 'No automation found' }, { status: 404 });
    }

    const result = await compileAndSendDigest(automation);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Digest send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const automationId = req.nextUrl.searchParams.get('automationId');

    let automation;
    if (automationId) {
      automation = await getAutomation(parseInt(automationId));
    } else {
      const automations = await getAllAutomations();
      automation = automations[0];
    }

    if (!automation) {
      return NextResponse.json({ error: 'No automation found' }, { status: 404 });
    }

    const { html, content } = await previewDigest(automation);
    return NextResponse.json({ html, content });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
