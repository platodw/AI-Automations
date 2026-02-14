import { NextRequest, NextResponse } from 'next/server';
import { getRecentDigests, getDigestById } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');

  try {
    if (id) {
      const digest = await getDigestById(parseInt(id));
      if (!digest) {
        return NextResponse.json({ error: 'Digest not found' }, { status: 404 });
      }
      return NextResponse.json(digest);
    }

    const digests = await getRecentDigests(30);
    return NextResponse.json(digests);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
