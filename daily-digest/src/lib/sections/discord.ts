import { withRetry } from '@/lib/retry';

interface DiscordMessage {
  author: string;
  content: string;
  timestamp: string;
  channel: string;
  attachments: string[];
}

interface DiscordData {
  messages: DiscordMessage[];
  channelsMonitored: string[];
  error?: string;
}

const TARGET_CHANNELS = ['software-updates', 'public-beta-build'];

export async function fetchDiscordUpdates(sinceTimestamp: Date): Promise<DiscordData> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    return {
      messages: [],
      channelsMonitored: TARGET_CHANNELS,
      error: 'Discord bot token or guild ID not configured',
    };
  }

  const messages: DiscordMessage[] = [];

  try {
    // Get channels
    const channelsData = await withRetry(
      async () => {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: { Authorization: `Bot ${botToken}` },
        });
        if (res.status === 401) {
          throw new Error('Discord bot token is invalid or expired. Please regenerate your bot token at https://discord.com/developers/applications and update the DISCORD_BOT_TOKEN environment variable.');
        }
        if (res.status === 403) {
          throw new Error('Discord bot lacks permissions. Make sure the bot has been invited to the server with the "Read Messages" permission and has access to the target channels.');
        }
        if (!res.ok) throw new Error(`Discord API error: ${res.status}`);
        return res.json();
      },
      { label: 'discord-channels', retries: 0 }
    );

    const targetChannels = channelsData.filter((ch: any) =>
      TARGET_CHANNELS.some((target) =>
        ch.name?.toLowerCase().includes(target.toLowerCase())
      )
    );

    const sinceSnowflake = BigInt(sinceTimestamp.getTime() - 1420070400000) << BigInt(22);

    for (const channel of targetChannels) {
      try {
        const channelMessages = await withRetry(
          async () => {
            const res = await fetch(
              `https://discord.com/api/v10/channels/${channel.id}/messages?after=${sinceSnowflake}&limit=50`,
              { headers: { Authorization: `Bot ${botToken}` } }
            );
            if (!res.ok) throw new Error(`Discord messages error: ${res.status}`);
            return res.json();
          },
          { label: `discord-messages-${channel.name}` }
        );

        for (const msg of channelMessages) {
          const content = msg.content?.toLowerCase() || '';
          const hasGSPro =
            content.includes('gspro') ||
            content.includes('gs pro') ||
            msg.embeds?.some((e: any) =>
              (e.title?.toLowerCase() || '').includes('gspro') ||
              (e.description?.toLowerCase() || '').includes('gspro')
            );

          if (hasGSPro || TARGET_CHANNELS.includes(channel.name)) {
            messages.push({
              author: msg.author?.username || 'Unknown',
              content: msg.content?.substring(0, 500) || '',
              timestamp: msg.timestamp,
              channel: channel.name,
              attachments: (msg.attachments || []).map((a: any) => a.url),
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching messages from #${channel.name}:`, error);
      }
    }

    messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      messages,
      channelsMonitored: targetChannels.map((ch: any) => ch.name),
    };
  } catch (error) {
    return {
      messages: [],
      channelsMonitored: TARGET_CHANNELS,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
