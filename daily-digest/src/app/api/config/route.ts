import { NextRequest, NextResponse } from 'next/server';
import { getAllConfig, setConfig, ensureDatabase } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const config = await getAllConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (typeof body !== 'object' || !body) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    for (const [key, value] of Object.entries(body)) {
      if (typeof key === 'string' && typeof value === 'string') {
        await setConfig(key, value);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
