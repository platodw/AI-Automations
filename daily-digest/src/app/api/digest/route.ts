import { NextRequest, NextResponse } from 'next/server';
import { compileAndSendDigest, previewDigest } from '@/lib/digest-engine';

export async function POST(req: NextRequest) {
  // Verify auth cookie or cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const session = req.cookies.get('digest_session');

  if (!session?.value && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await compileAndSendDigest();
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
    const { html, content } = await previewDigest();
    return NextResponse.json({ html, content });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
