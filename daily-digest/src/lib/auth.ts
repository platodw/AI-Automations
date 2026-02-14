import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'digest_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function getPassword(): string {
  return process.env.DASHBOARD_PASSWORD || 'admin';
}

export async function verifyPassword(password: string): Promise<boolean> {
  return password === getPassword();
}

export async function createSession(): Promise<string> {
  const token = crypto.randomUUID();
  return token;
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return !!session?.value;
}

export function withAuth(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const session = req.cookies.get(SESSION_COOKIE);
    if (!session?.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(req);
  };
}

export { SESSION_COOKIE, SESSION_MAX_AGE };
