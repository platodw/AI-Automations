import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleCallback } from '@/lib/sections/gmail';
import { ensureDatabase } from '@/lib/db';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state'); // account email
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/?error=Missing+code+or+state', req.url)
    );
  }

  try {
    await ensureDatabase();
    await handleGoogleCallback(code, state);
    console.log(`[OAuth] Successfully saved tokens for ${state}`);
    return NextResponse.redirect(
      new URL(`/?success=${encodeURIComponent(state)}`, req.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[OAuth] Callback error for ${state}:`, message);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(message)}`, req.url)
    );
  }
}
