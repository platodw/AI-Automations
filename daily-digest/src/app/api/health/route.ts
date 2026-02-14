import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {};

  // Database check
  try {
    await sql`SELECT 1`;
    checks.database = { status: 'ok' };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Environment variables check
  const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'DASHBOARD_PASSWORD',
  ];
  const optionalVars = [
    'OPENWEATHER_API_KEY',
    'NEWSAPI_KEY',
    'ANTHROPIC_API_KEY',
    'DISCORD_BOT_TOKEN',
    'REDDIT_CLIENT_ID',
    'ALPHA_VANTAGE_API_KEY',
  ];

  checks.requiredEnv = {
    status: requiredVars.every((v) => !!process.env[v]) ? 'ok' : 'warning',
    message: requiredVars.filter((v) => !process.env[v]).join(', ') || undefined,
  };

  checks.optionalEnv = {
    status: 'info',
    message: `${optionalVars.filter((v) => !!process.env[v]).length}/${optionalVars.length} configured`,
  };

  const allOk = Object.values(checks).every(
    (c) => c.status === 'ok' || c.status === 'info'
  );

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
