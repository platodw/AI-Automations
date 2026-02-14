import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/sections/gmail';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = req.nextUrl.searchParams.get('account');
  if (!account) {
    return NextResponse.json({ error: 'Account parameter required' }, { status: 400 });
  }

  try {
    const url = getGoogleAuthUrl(account);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
