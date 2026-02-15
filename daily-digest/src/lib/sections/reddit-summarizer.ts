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

  const prompt = `You are writing the Reddit section of a personal daily morning digest email. For each subreddit, write a brief 1-3 sentence summary of what's trending and interesting right now. Think of it as a friend telling you "here's what people are talking about on Reddit."

Guidelines:
- Be conversational and concise
- Highlight the most interesting or notable discussions
- Skip mundane posts; focus on what would actually be interesting to know
- If a subreddit only has low-engagement posts, keep it to one sentence
- Don't list every post — summarize the vibe and highlight 1-2 standout threads

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
