import { getLastDigestTimestamp, getAllConfig, saveDigest, saveDigestLog } from '@/lib/db';
import { fetchEmails, sendDigestEmail } from '@/lib/sections/gmail';
import { fetchCalendarEvents } from '@/lib/sections/calendar';
import { fetchWeather } from '@/lib/sections/weather';
import { fetchStocks } from '@/lib/sections/stocks';
import { fetchNews } from '@/lib/sections/news';
import { fetchSports } from '@/lib/sections/sports';
import { fetchAnthropicBilling } from '@/lib/sections/anthropic-billing';
import { fetchDiscordUpdates } from '@/lib/sections/discord';
import { fetchReddit } from '@/lib/sections/reddit';
import { generateDigestHtml } from '@/lib/email-template';
import { format, subHours } from 'date-fns';

interface SectionResult {
  key: string;
  data: any;
  error: string | null;
  executionTimeMs: number;
}

async function fetchSection(
  key: string,
  fetcher: () => Promise<any>
): Promise<SectionResult> {
  const start = Date.now();
  try {
    const data = await fetcher();
    return {
      key,
      data,
      error: null,
      executionTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      key,
      data: null,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: Date.now() - start,
    };
  }
}

export async function compileAndSendDigest(): Promise<{
  success: boolean;
  digestId: number;
  errors: Record<string, string>;
  executionTimeMs: number;
}> {
  const overallStart = Date.now();

  // Get configuration
  const config = await getAllConfig();
  const recipientEmail = config.recipient_email || process.env.DIGEST_RECIPIENT_EMAIL || 'platodw@gmail.com';

  // Determine "since" timestamp
  const lastDigest = await getLastDigestTimestamp();
  const sinceTimestamp = lastDigest || subHours(new Date(), 24);

  // Determine enabled sections
  const enabledSections: Record<string, boolean> = {
    emails: config.section_emails !== 'false',
    calendar: config.section_calendar !== 'false',
    weather: config.section_weather !== 'false',
    stocks: config.section_stocks !== 'false',
    news: config.section_news !== 'false',
    sports: config.section_sports !== 'false',
    anthropicBilling: config.section_anthropicBilling !== 'false',
    discord: config.section_discord !== 'false',
    reddit: config.section_reddit !== 'false',
  };

  const isFriday = new Date().getDay() === 5;

  // Fetch all sections in parallel
  const sectionPromises: Promise<SectionResult>[] = [];

  if (enabledSections.emails) {
    sectionPromises.push(fetchSection('emails', () => fetchEmails(sinceTimestamp)));
  }
  if (enabledSections.calendar) {
    sectionPromises.push(fetchSection('calendar', () => fetchCalendarEvents()));
  }
  if (enabledSections.weather) {
    sectionPromises.push(fetchSection('weather', () => fetchWeather()));
  }
  if (enabledSections.stocks) {
    sectionPromises.push(fetchSection('stocks', () => fetchStocks()));
  }
  if (enabledSections.news) {
    sectionPromises.push(fetchSection('news', () => fetchNews()));
  }
  if (enabledSections.sports) {
    sectionPromises.push(fetchSection('sports', () => fetchSports()));
  }
  if (enabledSections.anthropicBilling) {
    sectionPromises.push(
      fetchSection('anthropicBilling', () => fetchAnthropicBilling(isFriday))
    );
  }
  if (enabledSections.discord) {
    sectionPromises.push(
      fetchSection('discord', () => fetchDiscordUpdates(sinceTimestamp))
    );
  }
  if (enabledSections.reddit) {
    sectionPromises.push(
      fetchSection('reddit', () => fetchReddit(sinceTimestamp))
    );
  }

  const results = await Promise.allSettled(sectionPromises);

  // Compile results
  const content: Record<string, any> = {};
  const errors: Record<string, string> = {};
  const sectionLogs: Array<{ section: string; status: string; error: string | null; time: number }> = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { key, data, error, executionTimeMs } = result.value;
      if (error) {
        errors[key] = error;
      }
      content[key] = data;
      sectionLogs.push({
        section: key,
        status: error ? 'error' : 'success',
        error,
        time: executionTimeMs,
      });
    } else {
      // This shouldn't happen since fetchSection catches errors
      console.error('Unexpected section failure:', result.reason);
    }
  }

  content.errors = errors;
  content.generatedAt = new Date().toISOString();

  // Generate email HTML
  const html = generateDigestHtml(content, enabledSections);
  const subject = `☀️ Daily Digest — ${format(new Date(), 'EEEE, MMM d')}${isFriday ? ' (Weekly Summary)' : ''}`;

  // Send email
  let sendError: string | null = null;
  try {
    await sendDigestEmail(recipientEmail, subject, html);
  } catch (error) {
    sendError = error instanceof Error ? error.message : String(error);
    errors['_send'] = sendError;
  }

  const executionTimeMs = Date.now() - overallStart;
  const status = sendError ? 'error' : Object.keys(errors).length > 0 ? 'partial' : 'sent';

  // Save to database
  const digestId = await saveDigest(content, status, errors, executionTimeMs, recipientEmail);

  // Save section logs
  for (const log of sectionLogs) {
    await saveDigestLog(digestId, log.section, log.status, log.error, log.time);
  }

  if (sendError) {
    await saveDigestLog(digestId, '_send', 'error', sendError, 0);
  }

  return {
    success: !sendError,
    digestId,
    errors,
    executionTimeMs,
  };
}

export async function previewDigest(): Promise<{ html: string; content: Record<string, any> }> {
  const config = await getAllConfig();
  const lastDigest = await getLastDigestTimestamp();
  const sinceTimestamp = lastDigest || subHours(new Date(), 24);

  const enabledSections: Record<string, boolean> = {
    emails: config.section_emails !== 'false',
    calendar: config.section_calendar !== 'false',
    weather: config.section_weather !== 'false',
    stocks: config.section_stocks !== 'false',
    news: config.section_news !== 'false',
    sports: config.section_sports !== 'false',
    anthropicBilling: config.section_anthropicBilling !== 'false',
    discord: config.section_discord !== 'false',
    reddit: config.section_reddit !== 'false',
  };

  const isFriday = new Date().getDay() === 5;

  const fetchers: Record<string, () => Promise<any>> = {
    emails: () => fetchEmails(sinceTimestamp),
    calendar: () => fetchCalendarEvents(),
    weather: () => fetchWeather(),
    stocks: () => fetchStocks(),
    news: () => fetchNews(),
    sports: () => fetchSports(),
    anthropicBilling: () => fetchAnthropicBilling(isFriday),
    discord: () => fetchDiscordUpdates(sinceTimestamp),
    reddit: () => fetchReddit(sinceTimestamp),
  };

  const content: Record<string, any> = {};
  const errors: Record<string, string> = {};

  const promises = Object.entries(fetchers)
    .filter(([key]) => enabledSections[key] !== false)
    .map(async ([key, fetcher]) => {
      try {
        content[key] = await fetcher();
      } catch (error) {
        errors[key] = error instanceof Error ? error.message : String(error);
      }
    });

  await Promise.allSettled(promises);
  content.errors = errors;

  const html = generateDigestHtml(content, enabledSections);
  return { html, content };
}
