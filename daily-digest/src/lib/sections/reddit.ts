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

async function getRedditAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'DailyDigest/1.0',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`Reddit auth error: ${res.status}`);
    const data = await res.json();
    return data.access_token;
  } catch {
    return null;
  }
}

async function fetchSubredditPosts(
  subreddit: string,
  accessToken: string | null,
  sinceTimestamp: Date
): Promise<RedditPost[]> {
  const cutoffTime = sinceTimestamp.getTime() / 1000;

  const headers: Record<string, string> = {
    'User-Agent': 'DailyDigest/1.0',
  };

  let url: string;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    url = `https://oauth.reddit.com/r/${subreddit}/hot?limit=25`;
  } else {
    url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
  }

  const data = await withRetry(
    async () => {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Reddit API error: ${res.status}`);
      return res.json();
    },
    { label: `reddit-${subreddit}`, retries: 2 }
  );

  const posts: RedditPost[] = [];
  for (const child of data.data?.children || []) {
    const post = child.data;
    if (post.created_utc < cutoffTime) continue;
    if (post.stickied) continue;

    posts.push({
      title: post.title,
      subreddit: post.subreddit,
      score: post.score,
      numComments: post.num_comments,
      url: post.url,
      permalink: `https://reddit.com${post.permalink}`,
      author: post.author,
      createdUtc: post.created_utc,
      selfText: post.selftext?.substring(0, 200) || undefined,
      thumbnail: post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : undefined,
    });
  }

  return posts.sort((a, b) => b.score - a.score).slice(0, 10);
}

export async function fetchReddit(sinceTimestamp: Date): Promise<RedditData> {
  const subredditConfig = await getConfig('reddit_subreddits');
  const subreddits = subredditConfig
    ? subredditConfig.split(',').map((s) => s.trim()).filter(Boolean)
    : ['technology', 'programming', 'worldnews'];

  if (subreddits.length === 0) {
    return { subreddits: [], error: 'No subreddits configured' };
  }

  const accessToken = await getRedditAccessToken();

  const results = await Promise.allSettled(
    subreddits.map(async (sub) => ({
      name: sub,
      posts: await fetchSubredditPosts(sub, accessToken, sinceTimestamp),
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
