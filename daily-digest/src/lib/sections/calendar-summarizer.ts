import { withRetry } from '@/lib/retry';

interface CalendarSummaryResult {
  todaySummary: string;
  tomorrowSummary: string;
}

export async function summarizeCalendar(calendarData: any): Promise<CalendarSummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const todayEvents = calendarData.today?.events || [];
  const tomorrowEvents = calendarData.tomorrow?.events || [];

  if (todayEvents.length === 0 && tomorrowEvents.length === 0) {
    return {
      todaySummary: "Your schedule is completely clear today — enjoy the open day!",
      tomorrowSummary: "Nothing on the books for tomorrow either. A good time to get ahead on things.",
    };
  }

  const formatEvents = (events: any[]) => events.map((e: any, i: number) => {
    let text = `${i + 1}. "${e.summary}"`;
    if (e.allDay) text += ' (All Day)';
    else text += ` at ${e.start}`;
    if (e.location) text += ` — Location: ${e.location}`;
    text += ` [Calendar: ${e.calendar}, Account: ${e.account}]`;
    return text;
  }).join('\n');

  const prompt = `You are writing the calendar section of a personal daily morning digest email. Write a friendly, natural-language summary of what the reader's day looks like — think of it as a personal assistant giving a morning briefing.

Today's date: ${calendarData.today?.date || 'Today'}
Tomorrow's date: ${calendarData.tomorrow?.date || 'Tomorrow'}

TODAY'S EVENTS (${todayEvents.length}):
${todayEvents.length > 0 ? formatEvents(todayEvents) : 'No events'}

TOMORROW'S EVENTS (${tomorrowEvents.length}):
${tomorrowEvents.length > 0 ? formatEvents(tomorrowEvents) : 'No events'}

Guidelines:
- For today: Write 1-3 sentences describing the shape of the day. Is it packed? Light? Are there back-to-back meetings? Is there a big event to prepare for? Give the reader a feel for what's ahead.
  - Examples: "Pretty light day — just a dentist appointment at 2pm and that's it." or "Heads up, it's a packed one. You've got back-to-back meetings from 9 to noon, then a lunch with Sarah, and a team standup at 3."
- For tomorrow: Write 1-2 sentences previewing tomorrow so the reader can mentally prepare.
  - Examples: "Tomorrow's wide open." or "Tomorrow you've got an early start with a 8am call, plus that project deadline in the afternoon."
- Be specific — mention actual event names and times
- Keep it warm and conversational, like a helpful friend
- If there are events from multiple accounts/calendars, that's fine — just describe them naturally without calling out which account unless it's relevant

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "todaySummary": "Your friendly summary of today's schedule",
  "tomorrowSummary": "Your friendly summary of tomorrow's schedule"
}`;

  const response = await withRetry(
    async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 500,
          messages: [
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API error: ${res.status} - ${body}`);
      }
      return res.json();
    },
    { label: 'anthropic-calendar-summary', retries: 2 }
  );

  const text = response.content?.[0]?.text || '{}';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { todaySummary: '', tomorrowSummary: '' };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      todaySummary: parsed.todaySummary || '',
      tomorrowSummary: parsed.tomorrowSummary || '',
    };
  } catch {
    console.error('[AI] Failed to parse calendar summary response');
    return { todaySummary: '', tomorrowSummary: '' };
  }
}
