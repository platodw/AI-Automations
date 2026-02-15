import { getLastDigestTimestamp, saveDigest, saveDigestLog, ensureDatabase, type Automation } from '@/lib/db';
import { fetchEmails, sendDigestEmail } from '@/lib/sections/gmail';
import { fetchCalendarEvents } from '@/lib/sections/calendar';
import { fetchWeather } from '@/lib/sections/weather';
import { fetchStocks } from '@/lib/sections/stocks';
import { fetchNews } from '@/lib/sections/news';
import { fetchSports } from '@/lib/sections/sports';
import { fetchAnthropicBilling } from '@/lib/sections/anthropic-billing';
import { fetchReddit } from '@/lib/sections/reddit';
import { summarizeEmails } from '@/lib/sections/ai-summarizer';
import { summarizeSports } from '@/lib/sections/sports-summarizer';
import { summarizeReddit } from '@/lib/sections/reddit-summarizer';
import { summarizeCalendar } from '@/lib/sections/calendar-summarizer';
import { addActionItems } from '@/lib/sections/notion';
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

export async function compileAndSendDigest(automation: Automation): Promise<{
  success: boolean;
  digestId: number;
  errors: Record<string, string>;
  executionTimeMs: number;
}> {
  const overallStart = Date.now();
  await ensureDatabase();

  const recipientEmail = automation.recipient_email;
  const enabledSections = automation.sections;

  // Determine "since" timestamp
  const lastDigest = await getLastDigestTimestamp(automation.id);
  const sinceTimestamp = lastDigest || subHours(new Date(), 24);

  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const isFriday = nowET.getDay() === 5;

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
      console.error('Unexpected section failure:', result.reason);
    }
  }

  // AI-summarize emails and add action items to Notion
  if (content.emails && !errors.emails) {
    try {
      const allEmails = [];
      for (const result of content.emails.raw || []) {
        for (const email of result.emails || []) {
          allEmails.push({
            from: email.from,
            subject: email.subject,
            body: email.body || email.snippet || '',
            date: email.date,
            account: result.account,
          });
        }
      }

      if (allEmails.length > 0) {
        const summary = await summarizeEmails(allEmails);
        content.emails.aiSummary = summary;

        // Add action items to Notion
        if (summary.actionItems.length > 0) {
          try {
            const added = await addActionItems(
              summary.actionItems.map((item) => ({ title: item, category: 'Personal' }))
            );
            content.emails.notionItemsAdded = added;
            console.log(`[Digest] Added ${added} action items to Notion`);
          } catch (notionErr) {
            console.error('[Digest] Notion action items failed:', notionErr);
          }
        }
      }
    } catch (aiErr) {
      console.error('[Digest] Email AI summarization failed:', aiErr);
      errors.emailSummary = aiErr instanceof Error ? aiErr.message : String(aiErr);
    }
  }

  // AI-summarize sports
  if (content.sports && !errors.sports) {
    try {
      const sportsSummary = await summarizeSports(content.sports);
      content.sports.aiSummary = sportsSummary;
      console.log(`[Digest] AI sports summary generated for ${sportsSummary.teamSummaries.length} teams`);
    } catch (aiErr) {
      console.error('[Digest] Sports AI summarization failed:', aiErr);
      errors.sportsSummary = aiErr instanceof Error ? aiErr.message : String(aiErr);
    }
  }

  // AI-summarize Reddit
  if (content.reddit && !errors.reddit) {
    try {
      const redditSummary = await summarizeReddit(content.reddit);
      content.reddit.aiSummary = redditSummary;
      console.log(`[Digest] AI Reddit summary generated for ${redditSummary.subredditSummaries.length} subreddits`);
    } catch (aiErr) {
      console.error('[Digest] Reddit AI summarization failed:', aiErr);
      errors.redditSummary = aiErr instanceof Error ? aiErr.message : String(aiErr);
    }
  }

  // AI-summarize Calendar
  if (content.calendar && !errors.calendar) {
    try {
      const calendarSummary = await summarizeCalendar(content.calendar);
      content.calendar.aiSummary = calendarSummary;
      console.log('[Digest] AI calendar summary generated');
    } catch (aiErr) {
      console.error('[Digest] Calendar AI summarization failed:', aiErr);
      errors.calendarSummary = aiErr instanceof Error ? aiErr.message : String(aiErr);
    }
  }

  content.errors = errors;
  content.generatedAt = new Date().toISOString();

  // Generate email HTML
  const digestName = automation.name;
  const html = generateDigestHtml(content, enabledSections, digestName);
  const subject = `☀️ ${digestName} — ${format(nowET, 'EEEE, MMM d')}${isFriday ? ' (Weekly Summary)' : ''}`;

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
  const digestId = await saveDigest(content, status, errors, executionTimeMs, recipientEmail, automation.id);

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

export async function previewDigest(automation: Automation): Promise<{ html: string; content: Record<string, any> }> {
  await ensureDatabase();

  const enabledSections = automation.sections;
  const lastDigest = await getLastDigestTimestamp(automation.id);
  const sinceTimestamp = lastDigest || subHours(new Date(), 24);

  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const isFriday = nowET.getDay() === 5;

  const fetchers: Record<string, () => Promise<any>> = {
    emails: () => fetchEmails(sinceTimestamp),
    calendar: () => fetchCalendarEvents(),
    weather: () => fetchWeather(),
    stocks: () => fetchStocks(),
    news: () => fetchNews(),
    sports: () => fetchSports(),
    anthropicBilling: () => fetchAnthropicBilling(isFriday),
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

  // AI-summarize emails
  if (content.emails && !errors.emails) {
    try {
      const allEmails: any[] = [];
      for (const result of content.emails.raw || []) {
        for (const email of result.emails || []) {
          allEmails.push({
            from: email.from,
            subject: email.subject,
            body: email.body || email.snippet || '',
            date: email.date,
            account: result.account,
          });
        }
      }
      if (allEmails.length > 0) {
        content.emails.aiSummary = await summarizeEmails(allEmails);
      }
    } catch (e) {
      console.error('[Preview] Email AI summarization failed:', e);
    }
  }

  // AI-summarize sports
  if (content.sports && !errors.sports) {
    try {
      content.sports.aiSummary = await summarizeSports(content.sports);
    } catch (e) {
      console.error('[Preview] Sports AI summarization failed:', e);
    }
  }

  // AI-summarize Reddit
  if (content.reddit && !errors.reddit) {
    try {
      content.reddit.aiSummary = await summarizeReddit(content.reddit);
    } catch (e) {
      console.error('[Preview] Reddit AI summarization failed:', e);
    }
  }

  // AI-summarize Calendar
  if (content.calendar && !errors.calendar) {
    try {
      content.calendar.aiSummary = await summarizeCalendar(content.calendar);
    } catch (e) {
      console.error('[Preview] Calendar AI summarization failed:', e);
    }
  }

  content.errors = errors;

  const digestName = automation.name;
  const html = generateDigestHtml(content, enabledSections, digestName);
  return { html, content };
}
