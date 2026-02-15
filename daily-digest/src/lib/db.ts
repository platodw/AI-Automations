import { sql } from '@vercel/postgres';

export interface Automation {
  id: number;
  name: string;
  delivery_time: string;
  recipient_email: string;
  enabled: boolean;
  sections: Record<string, boolean>;
  settings: Record<string, string>;
  created_at: string;
  updated_at: string;
}

let dbInitialized = false;

export async function ensureDatabase() {
  if (dbInitialized) return;
  try {
    await initializeDatabase();
    dbInitialized = true;
    console.log('[DB] Database initialized successfully');
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error instanceof Error ? error.message : error);
  }
}

export async function initializeDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS automations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL DEFAULT 'Morning Digest',
      delivery_time VARCHAR(10) NOT NULL DEFAULT '06:30',
      recipient_email VARCHAR(255) NOT NULL DEFAULT 'platodw@gmail.com',
      enabled BOOLEAN NOT NULL DEFAULT true,
      sections JSONB NOT NULL DEFAULT '{}',
      settings JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS digests (
      id SERIAL PRIMARY KEY,
      automation_id INTEGER REFERENCES automations(id),
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

  // Add automation_id column to existing digests table if missing
  try {
    await sql`ALTER TABLE digests ADD COLUMN IF NOT EXISTS automation_id INTEGER REFERENCES automations(id)`;
  } catch {
    // Column may already exist
  }

  // Migrate: if automations table is empty but old config exists, create default automation
  const automationCount = await sql`SELECT COUNT(*) as count FROM automations`;
  if (parseInt(automationCount.rows[0].count) === 0) {
    await migrateConfigToAutomation();
  }
}

async function migrateConfigToAutomation() {
  try {
    const config = await getAllConfig();
    const sections: Record<string, boolean> = {
      emails: config.section_emails !== 'false',
      calendar: config.section_calendar !== 'false',
      weather: config.section_weather !== 'false',
      stocks: config.section_stocks !== 'false',
      news: config.section_news !== 'false',
      sports: config.section_sports !== 'false',
      anthropicBilling: config.section_anthropicBilling !== 'false',
      reddit: config.section_reddit !== 'false',
    };
    const settings: Record<string, string> = {};
    if (config.reddit_subreddits) settings.reddit_subreddits = config.reddit_subreddits;

    const name = config.digest_name || 'Morning Digest';
    const deliveryTime = config.delivery_time || '06:30';
    const recipientEmail = config.recipient_email || process.env.DIGEST_RECIPIENT_EMAIL || 'platodw@gmail.com';

    await sql`
      INSERT INTO automations (name, delivery_time, recipient_email, enabled, sections, settings)
      VALUES (${name}, ${deliveryTime}, ${recipientEmail}, true, ${JSON.stringify(sections)}, ${JSON.stringify(settings)})
    `;
    console.log('[DB] Migrated existing config to default automation');
  } catch (error) {
    console.log('[DB] No existing config to migrate, creating default automation');
    const defaultSections = {
      emails: true, calendar: true, weather: true, stocks: true,
      news: true, sports: true, anthropicBilling: true, reddit: true,
    };
    await sql`
      INSERT INTO automations (name, delivery_time, recipient_email, enabled, sections, settings)
      VALUES ('Morning Digest', '06:30', 'platodw@gmail.com', true, ${JSON.stringify(defaultSections)}, '{}')
    `;
  }
}

// --- Automation CRUD ---

export async function getAllAutomations(): Promise<Automation[]> {
  const result = await sql`SELECT * FROM automations ORDER BY created_at ASC`;
  return result.rows as Automation[];
}

export async function getAutomation(id: number): Promise<Automation | null> {
  const result = await sql`SELECT * FROM automations WHERE id = ${id}`;
  return (result.rows[0] as Automation) ?? null;
}

export async function getEnabledAutomations(): Promise<Automation[]> {
  const result = await sql`SELECT * FROM automations WHERE enabled = true ORDER BY created_at ASC`;
  return result.rows as Automation[];
}

export async function createAutomation(data: {
  name: string;
  delivery_time: string;
  recipient_email: string;
  sections?: Record<string, boolean>;
  settings?: Record<string, string>;
}): Promise<Automation> {
  const defaultSections = {
    emails: true, calendar: true, weather: true, stocks: true,
    news: true, sports: true, anthropicBilling: true, reddit: true,
  };
  const result = await sql`
    INSERT INTO automations (name, delivery_time, recipient_email, enabled, sections, settings)
    VALUES (
      ${data.name},
      ${data.delivery_time},
      ${data.recipient_email},
      true,
      ${JSON.stringify(data.sections || defaultSections)},
      ${JSON.stringify(data.settings || {})}
    )
    RETURNING *
  `;
  return result.rows[0] as Automation;
}

export async function updateAutomation(id: number, data: Partial<{
  name: string;
  delivery_time: string;
  recipient_email: string;
  enabled: boolean;
  sections: Record<string, boolean>;
  settings: Record<string, string>;
}>): Promise<Automation | null> {
  const automation = await getAutomation(id);
  if (!automation) return null;

  const name = data.name ?? automation.name;
  const deliveryTime = data.delivery_time ?? automation.delivery_time;
  const recipientEmail = data.recipient_email ?? automation.recipient_email;
  const enabled = data.enabled ?? automation.enabled;
  const sections = data.sections ?? automation.sections;
  const settings = data.settings ?? automation.settings;

  const result = await sql`
    UPDATE automations SET
      name = ${name},
      delivery_time = ${deliveryTime},
      recipient_email = ${recipientEmail},
      enabled = ${enabled},
      sections = ${JSON.stringify(sections)},
      settings = ${JSON.stringify(settings)},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (result.rows[0] as Automation) ?? null;
}

export async function deleteAutomation(id: number): Promise<boolean> {
  const result = await sql`DELETE FROM automations WHERE id = ${id}`;
  return (result.rowCount ?? 0) > 0;
}

// --- Config (global, kept for backward compat) ---

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

// --- Digests ---

export async function getLastDigestTimestamp(automationId?: number): Promise<Date | null> {
  try {
    const result = automationId
      ? await sql`
          SELECT sent_at FROM digests
          WHERE status = 'sent' AND automation_id = ${automationId}
          ORDER BY sent_at DESC LIMIT 1
        `
      : await sql`
          SELECT sent_at FROM digests
          WHERE status = 'sent'
          ORDER BY sent_at DESC LIMIT 1
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
  recipientEmail: string,
  automationId?: number
): Promise<number> {
  const result = await sql`
    INSERT INTO digests (automation_id, content_json, status, errors, execution_time_ms, recipient_email, sent_at)
    VALUES (${automationId ?? null}, ${JSON.stringify(contentJson)}, ${status}, ${errors ? JSON.stringify(errors) : null}, ${executionTimeMs}, ${recipientEmail}, NOW())
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

export async function getRecentDigests(limit: number = 30, automationId?: number) {
  const result = automationId
    ? await sql`
        SELECT d.id, d.sent_at, d.status, d.errors, d.execution_time_ms, d.recipient_email,
               d.content_json, d.automation_id, a.name as automation_name
        FROM digests d
        LEFT JOIN automations a ON d.automation_id = a.id
        WHERE d.automation_id = ${automationId}
        ORDER BY d.sent_at DESC LIMIT ${limit}
      `
    : await sql`
        SELECT d.id, d.sent_at, d.status, d.errors, d.execution_time_ms, d.recipient_email,
               d.content_json, d.automation_id, a.name as automation_name
        FROM digests d
        LEFT JOIN automations a ON d.automation_id = a.id
        ORDER BY d.sent_at DESC LIMIT ${limit}
      `;
  return result.rows;
}

export async function getDigestById(id: number) {
  const result = await sql`
    SELECT d.*, a.name as automation_name
    FROM digests d
    LEFT JOIN automations a ON d.automation_id = a.id
    WHERE d.id = ${id}
  `;
  return result.rows[0] ?? null;
}

// --- OAuth ---

export async function saveOAuthTokens(
  service: string,
  account: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date | null
): Promise<void> {
  await ensureDatabase();
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
    await ensureDatabase();
    const result = await sql`
      SELECT * FROM oauth_tokens
      WHERE service = ${service} AND account = ${account}
    `;
    console.log(`[DB] getOAuthTokens(${service}, ${account}): ${result.rows.length > 0 ? 'found' : 'not found'}`);
    return result.rows[0] ?? null;
  } catch (error) {
    console.error(`[DB] getOAuthTokens error for ${service}/${account}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export { sql };
