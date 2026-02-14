import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

const SESSION_COOKIE = 'digest_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function getPassword(): string {
  return process.env.DASHBOARD_PASSWORD || 'admin';
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = getPassword();
  // Support both bcrypt hashes and plain-text passwords for backwards compatibility
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    return bcrypt.compare(password, stored);
  }
  // Constant-time comparison for plain-text passwords
  const encoder = new TextEncoder();
  const a = encoder.encode(password);
  const b = encoder.encode(stored);
  if (a.byteLength !== b.byteLength) return false;
  let result = 0;
  for (let i = 0; i < a.byteLength; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
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
