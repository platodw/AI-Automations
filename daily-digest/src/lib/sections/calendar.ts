import { google } from 'googleapis';
import { getOAuthTokens, saveOAuthTokens } from '@/lib/db';
import { withRetry } from '@/lib/retry';
import { addDays, format } from 'date-fns';

const ACCOUNTS = ['platodw@gmail.com', 'dan@danplato.com'];

function getCredentialsForAccount(account: string) {
  if (account === 'dan@danplato.com') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID_DAN || process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_DAN || process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

async function getAuthenticatedClient(account: string) {
  const tokens = await getOAuthTokens('google', account);
  if (!tokens) {
    throw new Error(`No OAuth tokens found for ${account}`);
  }

  const creds = getCredentialsForAccount(account);
  const oauth2Client = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    process.env.GOOGLE_REDIRECT_URI
  );

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

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  calendar: string;
  account: string;
  allDay: boolean;
}

function toEastern(date: Date): Date {
  const eastern = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return eastern;
}

function startOfDayET(date: Date): Date {
  const eastern = toEastern(date);
  eastern.setHours(0, 0, 0, 0);
  // Convert back to UTC by finding the offset
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const etStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const offsetMs = new Date(utcStr).getTime() - new Date(etStr).getTime();
  return new Date(eastern.getTime() + offsetMs);
}

function endOfDayET(date: Date): Date {
  const eastern = toEastern(date);
  eastern.setHours(23, 59, 59, 999);
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const etStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const offsetMs = new Date(utcStr).getTime() - new Date(etStr).getTime();
  return new Date(eastern.getTime() + offsetMs);
}

export async function fetchCalendarEvents() {
  const now = new Date();
  const todayStart = startOfDayET(now);
  const tomorrowEnd = endOfDayET(addDays(todayStart, 1));

  const todayEvents: CalendarEvent[] = [];
  const tomorrowEvents: CalendarEvent[] = [];
  const errors: Array<{ account: string; error: string }> = [];

  for (const account of ACCOUNTS) {
    try {
      const auth = await getAuthenticatedClient(account);
      const calendar = google.calendar({ version: 'v3', auth });

      const calendarList = await withRetry(
        () => calendar.calendarList.list(),
        { label: `calendar-list-${account}` }
      );

      for (const cal of calendarList.data.items || []) {
        try {
          const events = await withRetry(
            () => calendar.events.list({
              calendarId: cal.id!,
              timeMin: todayStart.toISOString(),
              timeMax: tomorrowEnd.toISOString(),
              singleEvents: true,
              orderBy: 'startTime',
              maxResults: 50,
            }),
            { label: `calendar-events-${account}-${cal.id}` }
          );

          for (const event of events.data.items || []) {
            const isAllDay = !!event.start?.date;
            const startStr = event.start?.dateTime || event.start?.date || '';
            const endStr = event.end?.dateTime || event.end?.date || '';
            const eventStart = new Date(startStr);

            const calEvent: CalendarEvent = {
              summary: event.summary || '(No title)',
              start: startStr,
              end: endStr,
              location: event.location || undefined,
              description: event.description?.substring(0, 200) || undefined,
              calendar: cal.summary || 'Calendar',
              account,
              allDay: isAllDay,
            };

            const todayEnd = endOfDayET(now);
            if (eventStart <= todayEnd) {
              todayEvents.push(calEvent);
            } else {
              tomorrowEvents.push(calEvent);
            }
          }
        } catch {
          // Skip individual calendar errors
        }
      }
    } catch (error) {
      errors.push({
        account,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const sortEvents = (events: CalendarEvent[]) =>
    events.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

  const nowET = toEastern(now);
  const tomorrowET = new Date(nowET);
  tomorrowET.setDate(tomorrowET.getDate() + 1);

  return {
    today: {
      date: format(nowET, 'EEEE, MMMM d, yyyy'),
      events: sortEvents(todayEvents),
    },
    tomorrow: {
      date: format(tomorrowET, 'EEEE, MMMM d, yyyy'),
      events: sortEvents(tomorrowEvents),
    },
    errors,
  };
}
