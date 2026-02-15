import { withRetry } from '@/lib/retry';
import { getConfig } from '@/lib/db';

interface RedditPost {
  title: string;
  subreddit: string;
  score: number;
  numComments: number;
  url: string;
  permalink: string;
  author: string;
  createdUtc: number;
  selfText?: string;
  thumbnail?: string;
}

interface RedditData {
  subreddits: Array<{
    name: string;
    posts: RedditPost[];
  }>;
  error?: string;
}

function parseRssItems(xml: string): Array<{
  title: string;
  link: string;
  author: string;
  published: string;
  content: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    author: string;
    published: string;
    content: string;
  }> = [];

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const getTag = (tag: string) => {
      const tagMatch = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return tagMatch ? tagMatch[1].trim() : '';
    };

    const getLinkHref = () => {
      const linkMatch = entry.match(/<link[^>]+href="([^"]+)"/);
      return linkMatch ? linkMatch[1] : '';
    };

    items.push({
      title: getTag('title').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
      link: getLinkHref(),
      author: getTag('name'),
      published: getTag('updated') || getTag('published'),
      content: getTag('content'),
    });
  }

  return items;
}

function extractScoreFromContent(content: string): number {
  const scoreMatch = content.match(/(\d+)\s+point/);
  return scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
}

function extractCommentsFromContent(content: string): number {
  const commentMatch = content.match(/(\d+)\s+comment/);
  return commentMatch ? parseInt(commentMatch[1], 10) : 0;
}

async function fetchSubredditPosts(
  subreddit: string,
  sinceTimestamp: Date
): Promise<RedditPost[]> {
  const cutoffTime = sinceTimestamp.getTime();

  const url = `https://www.reddit.com/r/${subreddit}/hot.rss?limit=25`;

  const xml = await withRetry(
    async () => {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'DailyDigest/1.0 (RSS Reader)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
      });
      if (!res.ok) throw new Error(`Reddit RSS error: ${res.status}`);
      return res.text();
    },
    { label: `reddit-rss-${subreddit}`, retries: 2 }
  );

  const items = parseRssItems(xml);
  const posts: RedditPost[] = [];

  for (const item of items) {
    const publishedTime = item.published ? new Date(item.published).getTime() : 0;
    if (publishedTime < cutoffTime) continue;

    const permalink = item.link.replace('https://www.reddit.com', '');

    posts.push({
      title: item.title,
      subreddit,
      score: extractScoreFromContent(item.content),
      numComments: extractCommentsFromContent(item.content),
      url: item.link,
      permalink: item.link,
      author: item.author || 'unknown',
      createdUtc: publishedTime / 1000,
      selfText: undefined,
      thumbnail: undefined,
    });
  }

  return posts.sort((a, b) => b.score - a.score).slice(0, 10);
}

export async function fetchReddit(sinceTimestamp: Date): Promise<RedditData> {
  const subredditConfig = await getConfig('reddit_subreddits');
  const subreddits = subredditConfig
    ? subredditConfig.split(',').map((s) => s.trim().replace(/^r\//, '')).filter(Boolean)
    : ['technology', 'programming', 'worldnews'];

  if (subreddits.length === 0) {
    return { subreddits: [], error: 'No subreddits configured' };
  }

  const results = await Promise.allSettled(
    subreddits.map(async (sub) => ({
      name: sub,
      posts: await fetchSubredditPosts(sub, sinceTimestamp),
    }))
  );

  const subredditResults = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      subredditResults.push(result.value);
    } else {
      errors.push(`r/${subreddits[i]}: ${result.reason}`);
      subredditResults.push({ name: subreddits[i], posts: [] });
    }
  }

  return {
    subreddits: subredditResults,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}
