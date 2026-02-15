import { withRetry } from '@/lib/retry';

const NOTION_API_VERSION = '2022-06-28';

function getHeaders() {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error('NOTION_API_KEY not configured');
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_API_VERSION,
    'Content-Type': 'application/json',
  };
}

export async function addActionItem(title: string, category: string = 'Personal'): Promise<string | null> {
  const databaseId = process.env.NOTION_ACTION_ITEMS_DB_ID;
  if (!databaseId) {
    console.error('[Notion] NOTION_ACTION_ITEMS_DB_ID not configured');
    return null;
  }

  try {
    const result = await withRetry(
      async () => {
        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            parent: { database_id: databaseId },
            properties: {
              Name: {
                title: [{ text: { content: title } }],
              },
              Category: {
                select: { name: category },
              },
            },
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Notion API error: ${res.status} - ${body}`);
        }
        return res.json();
      },
      { label: 'notion-add-action-item', retries: 2 }
    );

    console.log(`[Notion] Added action item: ${title}`);
    return result.id;
  } catch (error) {
    console.error('[Notion] Failed to add action item:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function addActionItems(items: Array<{ title: string; category?: string }>): Promise<number> {
  let added = 0;
  for (const item of items) {
    const id = await addActionItem(item.title, item.category || 'Personal');
    if (id) added++;
  }
  return added;
}
