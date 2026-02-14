import { withRetry } from '@/lib/retry';

interface NewsArticle {
  title: string;
  source: string;
  url: string;
  description: string;
  publishedAt: string;
  imageUrl?: string;
}

interface NewsData {
  topHeadlines: NewsArticle[];
  trending: string[];
  errors: string[];
}

export async function fetchNews(): Promise<NewsData> {
  const apiKey = process.env.NEWSAPI_KEY;
  const errors: string[] = [];
  let topHeadlines: NewsArticle[] = [];
  const trending: string[] = [];

  if (!apiKey) {
    return { topHeadlines: [], trending: [], errors: ['NewsAPI key not configured'] };
  }

  // Fetch top headlines
  try {
    const url = `https://newsapi.org/v2/top-headlines?country=us&pageSize=15&apiKey=${apiKey}`;
    const data = await withRetry(
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
        return res.json();
      },
      { label: 'news-headlines' }
    );

    topHeadlines = (data.articles || [])
      .filter((a: any) => a.title && a.title !== '[Removed]')
      .map((a: any) => ({
        title: a.title,
        source: a.source?.name || 'Unknown',
        url: a.url,
        description: a.description?.substring(0, 200) || '',
        publishedAt: a.publishedAt,
        imageUrl: a.urlToImage || undefined,
      }));
  } catch (error) {
    errors.push(`Headlines: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Fetch trending topics (using top headlines from different categories)
  try {
    const categories = ['technology', 'business', 'science'];
    const trendResults = await Promise.allSettled(
      categories.map(async (category) => {
        const url = `https://newsapi.org/v2/top-headlines?country=us&category=${category}&pageSize=3&apiKey=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.articles || [])
          .filter((a: any) => a.title && a.title !== '[Removed]')
          .map((a: any) => a.title);
      })
    );

    for (const result of trendResults) {
      if (result.status === 'fulfilled') {
        trending.push(...result.value.slice(0, 2));
      }
    }
  } catch {
    // Non-critical
  }

  return { topHeadlines, trending, errors };
}
