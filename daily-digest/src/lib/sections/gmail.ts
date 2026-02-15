import { google } from 'googleapis';
import { getOAuthTokens, saveOAuthTokens } from '@/lib/db';
import { withRetry } from '@/lib/retry';

const ACCOUNTS = ['platodw@gmail.com', 'dan@danplato.com'];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/callback`
  );
}

async function getAuthenticatedClient(account: string) {
  const tokens = await getOAuthTokens('google', account);
  if (!tokens) {
    throw new Error(`No OAuth tokens found for ${account}. Please complete setup.`);
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expires_at ? new Date(tokens.expires_at).getTime() : undefined,
  });

  oauth2Client.on('tokens', async (newTokens) => {
    await saveOAuthTokens(
      'google',
      account,
      newTokens.access_token || tokens.access_token,
      newTokens.refresh_token || null,
      newTokens.expiry_date ? new Date(newTokens.expiry_date) : null
    );
  });

  return oauth2Client;
}

function extractBody(payload: any): string {
  if (!payload) return '';

  // Direct body data
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Multipart - look for text/plain first, then text/html
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
      // Strip HTML tags for a rough plaintext version
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // Nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

export async function fetchEmails(sinceTimestamp: Date) {
  const results: Array<{
    account: string;
    emails: Array<{
      id: string;
      from: string;
      subject: string;
      snippet: string;
      body: string;
      date: string;
    }>;
    error?: string;
  }> = [];

  for (const account of ACCOUNTS) {
    try {
      const auth = await getAuthenticatedClient(account);
      const gmail = google.gmail({ version: 'v1', auth });

      const afterEpoch = Math.floor(sinceTimestamp.getTime() / 1000);
      const query = `is:unread after:${afterEpoch}`;

      const messageList = await withRetry(
        () => gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 50,
        }),
        { label: `gmail-list-${account}` }
      );

      const messages = messageList.data.messages || [];
      const emails = [];

      for (const msg of messages.slice(0, 30)) {
        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'full',
          });

          const headers = detail.data.payload?.headers || [];
          const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)';
          const date = headers.find((h: any) => h.name === 'Date')?.value || '';
          const body = extractBody(detail.data.payload);

          emails.push({
            id: msg.id!,
            from,
            subject,
            snippet: detail.data.snippet || '',
            body: body.substring(0, 3000),
            date,
          });
        } catch {
          // Skip individual message errors
        }
      }

      results.push({ account, emails });
    } catch (error) {
      results.push({
        account,
        emails: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Group by sender
  const grouped: Record<string, Array<{ account: string; subject: string; snippet: string; date: string }>> = {};
  for (const result of results) {
    for (const email of result.emails) {
      const senderKey = email.from.replace(/<[^>]+>/, '').trim();
      if (!grouped[senderKey]) grouped[senderKey] = [];
      grouped[senderKey].push({
        account: result.account,
        subject: email.subject,
        snippet: email.snippet,
        date: email.date,
      });
    }
  }

  return {
    accounts: results.map((r) => ({
      account: r.account,
      count: r.emails.length,
      error: r.error,
    })),
    grouped,
    totalUnread: results.reduce((sum, r) => sum + r.emails.length, 0),
    raw: results,
  };
}

export async function sendDigestEmail(
  to: string,
  subject: string,
  htmlContent: string
) {
  const auth = await getAuthenticatedClient('platodw@gmail.com');
  const gmail = google.gmail({ version: 'v1', auth });

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  const rawMessage = [
    `From: james@danplato.com`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    '',
    Buffer.from(htmlContent).toString('base64'),
  ].join('\r\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await withRetry(
    () => gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    }),
    { label: 'gmail-send' }
  );
}

export function getGoogleAuthUrl(account: string) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    state: account,
  });
}

export async function handleGoogleCallback(code: string, account: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  await saveOAuthTokens(
    'google',
    account,
    tokens.access_token!,
    tokens.refresh_token || null,
    tokens.expiry_date ? new Date(tokens.expiry_date) : null
  );

  return tokens;
}
