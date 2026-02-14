import { sql } from '@vercel/postgres';

let dbInitialized = false;

export async function ensureDatabase() {
  if (dbInitialized) return;
  try {
    await initializeDatabase();
    dbInitialized = true;
  } catch {
    // DB may not be configured yet — skip silently
  }
}

export async function initializeDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS digests (
      id SERIAL PRIMARY KEY,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      content_json JSONB,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      errors JSONB,
      execution_time_ms INTEGER,
      recipient_email VARCHAR(255)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS config (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id SERIAL PRIMARY KEY,
      service VARCHAR(100) NOT NULL,
      account VARCHAR(255) NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(service, account)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS digest_logs (
      id SERIAL PRIMARY KEY,
      digest_id INTEGER REFERENCES digests(id),
      section VARCHAR(100),
      status VARCHAR(50),
      error_message TEXT,
      execution_time_ms INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
}

export async function getConfig(key: string): Promise<string | null> {
  try {
    const result = await sql`SELECT value FROM config WHERE key = ${key}`;
    return result.rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO config (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
}

export async function getAllConfig(): Promise<Record<string, string>> {
  try {
    const result = await sql`SELECT key, value FROM config`;
    const config: Record<string, string> = {};
    for (const row of result.rows) {
      config[row.key] = row.value;
    }
    return config;
  } catch {
    return {};
  }
}

export async function getLastDigestTimestamp(): Promise<Date | null> {
  try {
    const result = await sql`
      SELECT sent_at FROM digests
      WHERE status = 'sent'
      ORDER BY sent_at DESC
      LIMIT 1
    `;
    return result.rows[0]?.sent_at ? new Date(result.rows[0].sent_at) : null;
  } catch {
    return null;
  }
}

export async function saveDigest(
  contentJson: object,
  status: string,
  errors: object | null,
  executionTimeMs: number,
  recipientEmail: string
): Promise<number> {
  const result = await sql`
    INSERT INTO digests (content_json, status, errors, execution_time_ms, recipient_email, sent_at)
    VALUES (${JSON.stringify(contentJson)}, ${status}, ${errors ? JSON.stringify(errors) : null}, ${executionTimeMs}, ${recipientEmail}, NOW())
    RETURNING id
  `;
  return result.rows[0].id;
}

export async function saveDigestLog(
  digestId: number,
  section: string,
  status: string,
  errorMessage: string | null,
  executionTimeMs: number
): Promise<void> {
  await sql`
    INSERT INTO digest_logs (digest_id, section, status, error_message, execution_time_ms)
    VALUES (${digestId}, ${section}, ${status}, ${errorMessage}, ${executionTimeMs})
  `;
}

export async function getRecentDigests(limit: number = 30) {
  const result = await sql`
    SELECT id, sent_at, status, errors, execution_time_ms, recipient_email,
           content_json
    FROM digests
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `;
  return result.rows;
}

export async function getDigestById(id: number) {
  const result = await sql`
    SELECT * FROM digests WHERE id = ${id}
  `;
  return result.rows[0] ?? null;
}

export async function saveOAuthTokens(
  service: string,
  account: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date | null
): Promise<void> {
  await sql`
    INSERT INTO oauth_tokens (service, account, access_token, refresh_token, expires_at, updated_at)
    VALUES (${service}, ${account}, ${accessToken}, ${refreshToken}, ${expiresAt?.toISOString() ?? null}, NOW())
    ON CONFLICT (service, account)
    DO UPDATE SET
      access_token = ${accessToken},
      refresh_token = COALESCE(${refreshToken}, oauth_tokens.refresh_token),
      expires_at = ${expiresAt?.toISOString() ?? null},
      updated_at = NOW()
  `;
}

export async function getOAuthTokens(service: string, account: string) {
  try {
    const result = await sql`
      SELECT * FROM oauth_tokens
      WHERE service = ${service} AND account = ${account}
    `;
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export { sql };
