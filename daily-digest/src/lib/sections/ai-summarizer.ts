import { withRetry } from '@/lib/retry';

interface EmailForSummary {
  from: string;
  subject: string;
  body: string;
  date: string;
  account: string;
}

interface EmailSummaryResult {
  overview: string;
  accountBreakdowns: Array<{
    account: string;
    summary: string;
  }>;
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
    return { overview: '', accountBreakdowns: [], summaries: [], actionItems: [] };
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

  // Group emails by account for per-account context
  const emailsByAccount = new Map<string, typeof emails>();
  for (const e of emails.slice(0, 20)) {
    const acc = e.account;
    if (!emailsByAccount.has(acc)) emailsByAccount.set(acc, []);
    emailsByAccount.get(acc)!.push(e);
  }
  const accountList = Array.from(emailsByAccount.entries())
    .map(([acc, emails]) => `${acc}: ${emails.length} emails`)
    .join(', ');

  const prompt = `You are writing the email section of a personal daily morning digest. Your job is to give the reader a clear, friendly picture of what landed in their inbox — and specifically what needs their attention.

IMPORTANT: Write this like a smart assistant briefing someone over coffee. Don't just list emails — tell the reader what's going on across their inboxes in plain English.

The reader has these email accounts: ${accountList}

Your response MUST include:

1. **overview**: A 2-4 sentence conversational paragraph summarizing the inbox. Start with the big picture ("Relatively quiet morning — mostly newsletters and a couple things that need your attention" or "Busy inbox today — you've got a few important threads to deal with"). Then highlight the most important items by name. End with reassurance about what can be ignored.

2. **accountBreakdowns**: For EACH email account, write 1-2 sentences describing what came into that specific account. Be specific — mention key senders and topics ("Your dan@danplato.com inbox got a client follow-up from James about the proposal deadline and a couple of newsletters").

3. **summaries**: For each email, provide:
   - Priority: "high" for anything needing a response, containing deadlines, bills, appointments, or follow-ups. "low" for newsletters, promos, automated notifications.
   - A 1-2 sentence summary of key points (for high priority)
   - Specific action items (for high priority)

4. **actionItems**: A combined flat list of ALL action items with enough context to stand alone (these get added to Notion). Write them as clear tasks like "Reply to James about the proposal deadline (from dan@danplato.com)" — not vague things like "respond to email".

5. **lowPriorityNote**: A friendly sentence about the unimportant emails ("The rest is the usual — a couple newsletters from Morning Brew and The Hustle, and some promotional stuff. Nothing you need to deal with.")

Here are the emails:

${emailTexts}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "overview": "Your conversational inbox overview paragraph here",
  "accountBreakdowns": [
    {
      "account": "email@example.com",
      "summary": "What came into this account"
    }
  ],
  "summaries": [
    {
      "from": "sender name",
      "subject": "email subject",
      "summary": "Brief summary of key points",
      "priority": "high" or "low",
      "actionItems": ["action item 1", "action item 2"]
    }
  ],
  "actionItems": ["All action items as clear standalone tasks for Notion"],
  "lowPriorityNote": "Friendly summary of the unimportant emails"
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
    if (!jsonMatch) return { overview: '', accountBreakdowns: [], summaries: [], actionItems: [] };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      overview: parsed.overview || '',
      accountBreakdowns: parsed.accountBreakdowns || [],
      summaries: parsed.summaries || [],
      actionItems: parsed.actionItems || [],
      lowPriorityNote: parsed.lowPriorityNote || '',
    };
  } catch {
    console.error('[AI] Failed to parse email summary response');
    return { overview: '', accountBreakdowns: [], summaries: [], actionItems: [] };
  }
}
