import { format } from 'date-fns';

interface DigestContent {
  emails?: any;
  calendar?: any;
  weather?: any;
  stocks?: any;
  news?: any;
  sports?: any;
  anthropicBilling?: any;
  reddit?: any;
  errors?: Record<string, string>;
  generatedAt?: string;
}

function weatherIcon(icon: string): string {
  const iconMap: Record<string, string> = {
    '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️',
    '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
    '50d': '🌫️', '50n': '🌫️',
  };
  return iconMap[icon] || '🌤️';
}

function stockArrow(change: number): string {
  return change >= 0 ? '▲' : '▼';
}

function stockColor(change: number): string {
  return change >= 0 ? '#22c55e' : '#ef4444';
}

function sectionHeader(title: string, emoji: string): string {
  return `
    <tr>
      <td style="padding: 24px 0 12px 0;">
        <h2 style="margin:0;font-size:20px;font-weight:700;color:#1a1a2e;border-bottom:2px solid #e0e7ff;padding-bottom:8px;">
          ${emoji} ${title}
        </h2>
      </td>
    </tr>
  `;
}

function errorSection(sectionName: string, error: string): string {
  return `
    <tr>
      <td style="padding:8px 16px;background:#fef2f2;border-radius:8px;margin:4px 0;">
        <p style="margin:0;color:#991b1b;font-size:13px;">⚠️ ${sectionName}: ${error}</p>
      </td>
    </tr>
  `;
}

function renderEmails(data: any): string {
  if (!data) return '';
  const { aiSummary, notionItemsAdded } = data;
  const totalEmails = data.totalEmails ?? data.totalUnread ?? 0;

  let html = sectionHeader(`Inbox (${totalEmails} emails)`, '📧');

  // AI Overview — the narrative paragraph
  if (aiSummary?.overview) {
    html += `<tr><td style="padding:8px 16px;">
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.5;">${aiSummary.overview}</p>
    </td></tr>`;
  }

  // Per-account breakdowns
  if (aiSummary?.accountBreakdowns?.length > 0) {
    for (const ab of aiSummary.accountBreakdowns) {
      html += `<tr><td style="padding:6px 16px;border-left:3px solid #6366f1;margin-top:8px;">
        <p style="margin:0;font-weight:600;font-size:13px;color:#4f46e5;">${ab.account}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#475569;line-height:1.4;">${ab.summary}</p>
      </td></tr>`;
    }
  }

  // Action items added to Notion — prominent callout
  if (aiSummary?.actionItems?.length > 0) {
    html += `<tr><td style="padding:12px 16px;">
      <table style="width:100%;border-collapse:collapse;background:#f0f9ff;border-radius:8px;border:1px solid #bfdbfe;">
        <tr><td style="padding:12px 16px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1e40af;">
            📋 Action Items${notionItemsAdded ? ` — ${notionItemsAdded} added to Notion` : ''}
          </p>
          ${aiSummary.actionItems.map((item: string) => `
            <p style="margin:4px 0 0 4px;font-size:13px;color:#1e3a5f;">☐ ${item}</p>
          `).join('')}
        </td></tr>
      </table>
    </td></tr>`;
  }

  // Important emails — details
  const importantEmails = (aiSummary?.summaries || []).filter((s: any) => s.priority === 'high');
  if (importantEmails.length > 0) {
    html += `<tr><td style="padding:12px 16px 4px;">
      <p style="margin:0;font-size:12px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">Needs Your Attention</p>
    </td></tr>`;

    for (const item of importantEmails) {
      html += `
        <tr><td style="padding:6px 16px;border-left:3px solid #dc2626;">
          <p style="margin:0;font-weight:600;font-size:13px;color:#1e293b;">${item.from}</p>
          <p style="margin:1px 0;font-size:12px;color:#64748b;font-style:italic;">${item.subject}</p>
          <p style="margin:4px 0 2px;font-size:13px;color:#475569;">${item.summary}</p>
        </td></tr>
      `;
    }
  }

  // Low priority note
  if (aiSummary?.lowPriorityNote) {
    html += `<tr><td style="padding:8px 16px;">
      <p style="margin:0;font-size:13px;color:#94a3b8;font-style:italic;">${aiSummary.lowPriorityNote}</p>
    </td></tr>`;
  }

  // Fallback: show grouped senders if no AI summary
  if (!aiSummary?.summaries?.length && !aiSummary?.overview) {
    const grouped = data.grouped || {};
    const senders = Object.entries(grouped).slice(0, 15);
    for (const [sender, emails] of senders) {
      const emailList = emails as any[];
      html += `
        <tr><td style="padding:8px 16px;border-left:3px solid #6366f1;margin:4px 0;">
          <p style="margin:0;font-weight:600;font-size:14px;color:#1e293b;">${sender} (${emailList.length})</p>
          ${emailList.slice(0, 3).map((e: any) => `
            <p style="margin:2px 0 2px 12px;font-size:13px;color:#475569;">
              • ${e.subject}
              <span style="color:#94a3b8;font-size:11px;"> — ${e.snippet.substring(0, 80)}${e.snippet.length > 80 ? '...' : ''}</span>
            </p>
          `).join('')}
          ${emailList.length > 3 ? `<p style="margin:2px 0 2px 12px;font-size:12px;color:#94a3b8;">...and ${emailList.length - 3} more</p>` : ''}
        </td></tr>
      `;
    }
  }

  return html;
}

function renderCalendar(data: any): string {
  if (!data) return '';

  let html = sectionHeader('Calendar', '📅');

  // Today
  html += `<tr><td style="padding:4px 16px;"><strong style="color:#4f46e5;font-size:14px;">Today — ${data.today.date}</strong></td></tr>`;

  // AI summary for today
  if (data.aiSummary?.todaySummary) {
    html += `<tr><td style="padding:4px 16px 8px;">
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.5;">${data.aiSummary.todaySummary}</p>
    </td></tr>`;
  }

  if (data.today.events.length === 0 && !data.aiSummary?.todaySummary) {
    html += `<tr><td style="padding:2px 32px;font-size:13px;color:#94a3b8;">No events today — enjoy the free day!</td></tr>`;
  } else {
    for (const event of data.today.events) {
      const time = event.allDay ? 'All Day' : format(new Date(event.start), 'h:mm a');
      html += `
        <tr><td style="padding:4px 32px;">
          <p style="margin:0;font-size:13px;">
            <span style="color:#6366f1;font-weight:600;">${time}</span> — ${event.summary}
            ${event.location ? `<span style="color:#94a3b8;font-size:11px;"> 📍 ${event.location}</span>` : ''}
          </p>
          <p style="margin:0;font-size:11px;color:#94a3b8;">${event.account} &bull; ${event.calendar}</p>
        </td></tr>
      `;
    }
  }

  // Tomorrow
  html += `<tr><td style="padding:12px 16px 4px;"><strong style="color:#4f46e5;font-size:14px;">Tomorrow — ${data.tomorrow.date}</strong></td></tr>`;

  // AI summary for tomorrow
  if (data.aiSummary?.tomorrowSummary) {
    html += `<tr><td style="padding:4px 16px 8px;">
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.5;">${data.aiSummary.tomorrowSummary}</p>
    </td></tr>`;
  }

  if (data.tomorrow.events.length === 0 && !data.aiSummary?.tomorrowSummary) {
    html += `<tr><td style="padding:2px 32px;font-size:13px;color:#94a3b8;">Nothing on the books for tomorrow.</td></tr>`;
  } else {
    for (const event of data.tomorrow.events.slice(0, 5)) {
      const time = event.allDay ? 'All Day' : format(new Date(event.start), 'h:mm a');
      html += `
        <tr><td style="padding:4px 32px;">
          <p style="margin:0;font-size:13px;">
            <span style="color:#6366f1;font-weight:600;">${time}</span> — ${event.summary}
            ${event.location ? `<span style="color:#94a3b8;font-size:11px;"> 📍 ${event.location}</span>` : ''}
          </p>
          <p style="margin:0;font-size:11px;color:#94a3b8;">${event.account} &bull; ${event.calendar}</p>
        </td></tr>
      `;
    }
  }

  for (const err of data.errors || []) {
    html += errorSection(err.account, err.error);
  }

  return html;
}

function renderWeather(data: any): string {
  if (!data) return '';

  let html = sectionHeader(`Weather — ${data.location}`, '🌤️');

  html += `
    <tr><td style="padding:8px 16px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:36px;width:60px;text-align:center;">${weatherIcon(data.current.icon)}</td>
          <td>
            <p style="margin:0;font-size:28px;font-weight:700;color:#1e293b;">${data.current.temp}°F</p>
            <p style="margin:0;font-size:13px;color:#64748b;">Feels like ${data.current.feelsLike}°F • ${data.current.description}</p>
            <p style="margin:0;font-size:12px;color:#94a3b8;">💨 ${data.current.windSpeed} mph ${data.current.windDirection} • 💧 ${data.current.humidity}%</p>
          </td>
        </tr>
      </table>
    </td></tr>
  `;

  // Hourly forecast
  if (data.forecast?.length > 0) {
    html += `<tr><td style="padding:8px 16px;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">
        <tr style="background:#f8fafc;">
          ${data.forecast.slice(0, 6).map((h: any) => `
            <td style="padding:6px 4px;">
              <div style="color:#64748b;">${h.time}</div>
              <div style="font-size:16px;">${weatherIcon(h.icon)}</div>
              <div style="font-weight:600;">${h.temp}°</div>
              ${h.precipitation > 0 ? `<div style="color:#3b82f6;">💧${h.precipitation}%</div>` : ''}
            </td>
          `).join('')}
        </tr>
      </table>
    </td></tr>`;
  }

  return html;
}

function renderStocks(data: any): string {
  if (!data) return '';

  let html = sectionHeader(`Markets — ${data.marketStatus}`, '📈');

  if (data.indices.length > 0) {
    html += `<tr><td style="padding:8px 16px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8fafc;font-weight:600;">
          <td style="padding:6px 8px;">Index</td>
          <td style="padding:6px 8px;text-align:right;">Price</td>
          <td style="padding:6px 8px;text-align:right;">Change</td>
          <td style="padding:6px 8px;text-align:right;">%</td>
        </tr>
        ${data.indices.map((idx: any) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 8px;font-weight:500;">${idx.name}</td>
            <td style="padding:6px 8px;text-align:right;">${idx.price.toLocaleString()}</td>
            <td style="padding:6px 8px;text-align:right;color:${stockColor(idx.change)};">${stockArrow(idx.change)} ${Math.abs(idx.change).toFixed(2)}</td>
            <td style="padding:6px 8px;text-align:right;color:${stockColor(idx.changePercent)};">${idx.changePercent > 0 ? '+' : ''}${idx.changePercent.toFixed(2)}%</td>
          </tr>
        `).join('')}
      </table>
    </td></tr>`;
  }

  if (data.futures.length > 0) {
    html += `<tr><td style="padding:4px 16px;font-size:12px;color:#64748b;">
      <strong>Futures:</strong>
      ${data.futures.map((f: any) => `${f.name}: <span style="color:${stockColor(f.change)}">${stockArrow(f.change)} ${Math.abs(f.changePercent).toFixed(2)}%</span>`).join(' • ')}
    </td></tr>`;
  }

  html += `<tr><td style="padding:2px 16px;font-size:11px;color:#cbd5e1;">As of ${data.asOf} ET</td></tr>`;
  return html;
}

function renderNews(data: any): string {
  if (!data) return '';

  let html = sectionHeader('News & Trends', '📰');

  for (const article of (data.topHeadlines || []).slice(0, 8)) {
    html += `
      <tr><td style="padding:4px 16px;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0;font-size:13px;">
          <a href="${article.url}" style="color:#4f46e5;text-decoration:none;font-weight:500;">${article.title}</a>
        </p>
        <p style="margin:2px 0;font-size:11px;color:#94a3b8;">${article.source} • ${new Date(article.publishedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
      </td></tr>
    `;
  }

  if (data.trending?.length > 0) {
    html += `<tr><td style="padding:8px 16px;">
      <p style="margin:0;font-size:12px;color:#64748b;"><strong>Trending:</strong> ${data.trending.slice(0, 5).join(' • ')}</p>
    </td></tr>`;
  }

  return html;
}

function renderSports(data: any): string {
  if (!data) return '';

  // Only show teams that are recent (played in last 3 days or playing in next 2 days)
  const recentTeams = (data.teams || []).filter((team: any) => team.isRecent);

  if (recentTeams.length === 0) {
    return sectionHeader('Sports', '🏀') +
      `<tr><td style="padding:8px 16px;font-size:13px;color:#94a3b8;">No recent games or upcoming matchups to report.</td></tr>`;
  }

  let html = sectionHeader('Sports', '🏀');

  // Use AI summaries if available
  const aiSummaries = data.aiSummary?.teamSummaries || [];
  const aiMap = new Map(aiSummaries.map((s: any) => [s.name, s.summary]));

  for (const team of recentTeams) {
    const aiSummary = aiMap.get(team.name);
    const summary = aiSummary || buildFallbackSummary(team);
    if (!summary) continue;

    html += `<tr><td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${team.name}${team.record ? ` <span style="font-weight:400;color:#64748b;font-size:12px;">(${team.record})</span>` : ''}</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#475569;line-height:1.4;">${summary}</p>
    </td></tr>`;
  }

  return html;
}

function buildFallbackSummary(team: any): string | null {
  const parts: string[] = [];
  if (team.lastGame) {
    const g = team.lastGame;
    const espnId = team.espnId;
    const isHome = espnId ? String(g.homeTeamId) === String(espnId) : true;
    const teamScore = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    const opponent = isHome ? g.awayTeam : g.homeTeam;

    if (teamScore !== null && oppScore !== null && !isNaN(teamScore) && !isNaN(oppScore)) {
      const won = teamScore > oppScore;
      const verb = won ? 'defeated' : 'fell to';
      parts.push(`${verb} ${opponent} ${Math.max(teamScore, oppScore)}-${Math.min(teamScore, oppScore)}${isHome ? ' at home' : ' on the road'} (${g.date})`);
    } else {
      parts.push(`${g.status} vs ${opponent}`);
    }
  }
  if (team.nextGame) {
    const g = team.nextGame;
    const espnId = team.espnId;
    const isHome = espnId ? String(g.homeTeamId) === String(espnId) : true;
    const opponent = isHome ? g.awayTeam : g.homeTeam;
    const where = isHome ? 'host' : 'visit';
    parts.push(`Next up: ${where} ${opponent} on ${g.date}`);
  }
  if (parts.length === 0) return null;
  return parts.join('. ') + '.';
}

function renderAnthropicBilling(data: any): string {
  if (!data) return '';

  let html = sectionHeader('Anthropic API Usage', '🤖');

  const daily = data.daily;
  html += `<tr><td style="padding:8px 16px;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#f8fafc;">
        <td style="padding:6px 8px;" colspan="2"><strong>Yesterday (${daily.date})</strong></td>
      </tr>
      <tr><td style="padding:4px 8px;">Total Cost</td><td style="padding:4px 8px;text-align:right;font-weight:600;color:#4f46e5;">$${daily.totalCost.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 8px;">Input Tokens</td><td style="padding:4px 8px;text-align:right;">${daily.totalInputTokens.toLocaleString()}</td></tr>
      <tr><td style="padding:4px 8px;">Output Tokens</td><td style="padding:4px 8px;text-align:right;">${daily.totalOutputTokens.toLocaleString()}</td></tr>
    </table>
  </td></tr>`;

  if (Object.keys(daily.byModel || {}).length > 0) {
    html += `<tr><td style="padding:4px 16px;font-size:12px;color:#64748b;">
      <strong>By Model:</strong>
      ${Object.entries(daily.byModel).map(([model, stats]: [string, any]) =>
        `${model}: $${stats.cost.toFixed(2)}`
      ).join(' • ')}
    </td></tr>`;
  }

  if (data.weekly) {
    const w = data.weekly;
    html += `<tr><td style="padding:12px 16px;background:#f0f9ff;border-radius:8px;margin-top:8px;">
      <p style="margin:0;font-weight:600;font-size:14px;color:#1e40af;">📊 Weekly Summary (${w.startDate} to ${w.endDate})</p>
      <p style="margin:4px 0;font-size:13px;">Total Cost: <strong>$${w.totalCost.toFixed(2)}</strong> • ${w.totalInputTokens.toLocaleString()} input / ${w.totalOutputTokens.toLocaleString()} output tokens</p>
      <p style="margin:2px 0;font-size:11px;color:#64748b;">Daily: ${(w.dailyBreakdown || []).map((d: any) => `${d.date}: $${d.cost.toFixed(2)}`).join(' • ')}</p>
    </td></tr>`;
  }

  if (data.error) {
    html += errorSection('Anthropic Billing', data.error);
  }

  return html;
}

function renderReddit(data: any): string {
  if (!data) return '';

  let html = sectionHeader('Reddit Trending', '🔗');

  // Use AI summaries if available
  const aiSummaries = data.aiSummary?.subredditSummaries || [];
  const aiMap = new Map(aiSummaries.map((s: any) => [s.name, s.summary]));

  // Filter to subreddits with posts
  const subsWithPosts = (data.subreddits || []).filter((s: any) => s.posts?.length > 0);

  if (subsWithPosts.length === 0 && aiSummaries.length === 0) {
    html += `<tr><td style="padding:8px 16px;font-size:13px;color:#94a3b8;">Nothing notable trending in your subreddits right now.</td></tr>`;
    return html;
  }

  for (const sub of subsWithPosts) {
    const aiSummary = aiMap.get(sub.name);

    html += `<tr><td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-weight:600;font-size:14px;color:#ff4500;">r/${sub.name}</p>`;

    if (aiSummary) {
      html += `<p style="margin:4px 0 0 0;font-size:13px;color:#475569;line-height:1.4;">${aiSummary}</p>`;
    } else {
      // Fallback: show top posts
      for (const post of sub.posts.slice(0, 3)) {
        html += `
          <p style="margin:3px 0 0 12px;font-size:13px;">
            <span style="color:#ff4500;font-weight:600;font-size:11px;">⬆${post.score}</span>
            <a href="${post.permalink}" style="color:#1e293b;text-decoration:none;">${post.title}</a>
            <span style="color:#94a3b8;font-size:11px;"> (${post.numComments} comments)</span>
          </p>`;
      }
    }

    html += `</td></tr>`;
  }

  if (data.error) {
    html += errorSection('Reddit', data.error);
  }

  return html;
}

export function generateDigestHtml(content: DigestContent, enabledSections: Record<string, boolean>, digestName: string = 'Morning Digest'): string {
  const now = new Date();
  const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dateStr = format(nowET, 'EEEE, MMMM d, yyyy');
  const isFriday = nowET.getDay() === 5;

  let sectionsHtml = '';
  const errors = content.errors || {};

  const sectionRenderers: Array<{ key: string; render: () => string }> = [
    { key: 'weather', render: () => errors.weather ? errorSection('Weather', errors.weather) : renderWeather(content.weather) },
    { key: 'calendar', render: () => errors.calendar ? errorSection('Calendar', errors.calendar) : renderCalendar(content.calendar) },
    { key: 'emails', render: () => errors.emails ? errorSection('Emails', errors.emails) : renderEmails(content.emails) },
    { key: 'stocks', render: () => errors.stocks ? errorSection('Stocks', errors.stocks) : renderStocks(content.stocks) },
    { key: 'news', render: () => errors.news ? errorSection('News', errors.news) : renderNews(content.news) },
    { key: 'sports', render: () => errors.sports ? errorSection('Sports', errors.sports) : renderSports(content.sports) },
    { key: 'anthropicBilling', render: () => errors.anthropicBilling ? errorSection('Anthropic Billing', errors.anthropicBilling) : renderAnthropicBilling(content.anthropicBilling) },
    { key: 'reddit', render: () => errors.reddit ? errorSection('Reddit', errors.reddit) : renderReddit(content.reddit) },
  ];

  for (const section of sectionRenderers) {
    if (enabledSections[section.key] !== false) {
      sectionsHtml += section.render();
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${digestName} — ${dateStr}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" style="width:100%;max-width:640px;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 24px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;">☀️ ${digestName}</h1>
              <p style="margin:6px 0 0;font-size:14px;color:#c7d2fe;">${dateStr}${isFriday ? ' • 🎉 TGIF' : ''}</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:8px 24px 24px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                ${sectionsHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                Generated at ${format(now, 'h:mm a')} EST • ${digestName} by Dan Plato
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
