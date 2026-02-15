import { withRetry } from '@/lib/retry';

interface RedditSummaryResult {
  subredditSummaries: Array<{
    name: string;
    summary: string;
  }>;
}

export async function summarizeReddit(redditData: any): Promise<RedditSummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Only summarize subreddits that have posts
  const subsWithPosts = (redditData.subreddits || []).filter(
    (s: any) => s.posts?.length > 0
  );

  if (subsWithPosts.length === 0) {
    return { subredditSummaries: [] };
  }

  const subContexts = subsWithPosts.map((sub: any) => {
    const postList = sub.posts.slice(0, 8).map((p: any, i: number) => {
      let text = `${i + 1}. "${p.title}" (${p.score} upvotes, ${p.numComments} comments)`;
      if (p.selfText) {
        text += `\n   Preview: ${p.selfText.substring(0, 200)}`;
      }
      return text;
    }).join('\n');
    return `r/${sub.name}:\n${postList}`;
  }).join('\n\n---\n\n');

  const prompt = `You are writing the Reddit section of a personal daily morning digest email. For each subreddit, write a 2-4 sentence narrative summary describing what's happening and what people are talking about — like a friend casually filling you in over coffee.

Guidelines:
- Write in flowing sentences, NOT bullet points or lists
- Actually describe what's being discussed — don't just say "people are talking about X", tell me WHAT they're saying about it
- Capture the mood and tone of the community (excited, frustrated, debating, celebrating, etc.)
- Highlight 1-2 standout posts by weaving them into your summary naturally (e.g. "One post that blew up was about...")
- If there's drama, hot takes, or something genuinely surprising — lead with that
- Keep it engaging and human — like you're gossiping about internet culture
- For low-engagement subreddits, a single vivid sentence is fine

Here are the subreddits:

${subContexts}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "subredditSummaries": [
    {
      "name": "subreddit name without r/",
      "summary": "Your conversational summary here"
    }
  ]
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
          max_tokens: 1500,
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
    { label: 'anthropic-reddit-summary', retries: 2 }
  );

  const text = response.content?.[0]?.text || '{}';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { subredditSummaries: [] };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      subredditSummaries: parsed.subredditSummaries || [],
    };
  } catch {
    console.error('[AI] Failed to parse Reddit summary response');
    return { subredditSummaries: [] };
  }
}
