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
    actionItems: string[];
  }>;
  actionItems: string[];
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

  const prompt = `You are summarizing emails for a morning digest. For each important email, provide:
1. A brief 1-2 sentence summary of the key points
2. Any action items that require follow-up

Skip promotional emails, newsletters that aren't important, and automated notifications.
Focus on emails that require attention or contain important information.

Here are the emails:

${emailTexts}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "summaries": [
    {
      "from": "sender name",
      "subject": "email subject",
      "summary": "Brief summary of key points",
      "actionItems": ["action item 1", "action item 2"]
    }
  ],
  "actionItems": ["All action items combined into a flat list with context about who/what they relate to"]
}

Only include emails worth highlighting. If an email is spam or unimportant, skip it.`;

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
    };
  } catch {
    console.error('[AI] Failed to parse email summary response');
    return { summaries: [], actionItems: [] };
  }
}
