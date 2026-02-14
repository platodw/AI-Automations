import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleCallback } from '@/lib/sections/gmail';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state'); // account email
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/setup?error=Missing+code+or+state', req.url)
    );
  }

  try {
    await handleGoogleCallback(code, state);
    return NextResponse.redirect(
      new URL(`/setup?success=${encodeURIComponent(state)}`, req.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(message)}`, req.url)
    );
  }
}
