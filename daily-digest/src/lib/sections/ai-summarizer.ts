import { withRetry } from '@/lib/retry';

interface EmailForSummary {
  from: string;
  subject: string;
  body: string;
  date: string;
  account: string;
}

interface EmailSummaryResult {
  summaries: Array<{
    from: string;
    subject: string;
    summary: string;
    priority?: string;
    actionItems: string[];
  }>;
  actionItems: string[];
  lowPriorityNote?: string;
}

export async function summarizeEmails(emails: EmailForSummary[]): Promise<EmailSummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  if (emails.length === 0) {
    return { summaries: [], actionItems: [] };
  }

  // Build a prompt with all emails
  const emailTexts = emails.slice(0, 20).map((e, i) => {
    const bodyPreview = e.body.substring(0, 2000);
    return `--- Email ${i + 1} ---
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Account: ${e.account}
Body:
${bodyPreview}`;
  }).join('\n\n');

  const prompt = `You are summarizing emails for a personal daily digest. Your goal is to help the reader quickly understand what came in and what needs their attention.

For each email, categorize it as either:
- **Important / Action Required**: Emails that need a response, contain deadlines, requests, bills, appointments, or anything requiring follow-up
- **FYI / Low Priority**: Newsletters, promotional emails, automated notifications, social media alerts, etc.

For important emails:
1. Provide a brief 1-2 sentence summary of the key points
2. List specific action items the reader needs to take

For FYI emails, you can group them together with a brief mention (e.g., "You also received 3 promotional emails from X, Y, Z and 2 shipping notifications").

Be conversational — think of it as a friend saying "Hey, here's what landed in your inbox. Most of it is junk, but these few things actually need your attention, so I added them to your task list."

Here are the emails:

${emailTexts}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "summaries": [
    {
      "from": "sender name",
      "subject": "email subject",
      "summary": "Brief summary of key points",
      "priority": "high" or "low",
      "actionItems": ["action item 1", "action item 2"]
    }
  ],
  "actionItems": ["All action items combined into a flat list with context about who/what they relate to — these will be added to the reader's Notion task list"],
  "lowPriorityNote": "A brief sentence summarizing the unimportant emails, e.g. 'You also got 5 promotional emails and 2 shipping updates — nothing requiring action.'"
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
          max_tokens: 2000,
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
    { label: 'anthropic-email-summary', retries: 2 }
  );

  const text = response.content?.[0]?.text || '{}';

  try {
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { summaries: [], actionItems: [] };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summaries: parsed.summaries || [],
      actionItems: parsed.actionItems || [],
      lowPriorityNote: parsed.lowPriorityNote || '',
    };
  } catch {
    console.error('[AI] Failed to parse email summary response');
    return { summaries: [], actionItems: [] };
  }
}
