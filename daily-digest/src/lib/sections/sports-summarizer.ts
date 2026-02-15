import { withRetry } from '@/lib/retry';

interface SportsSummaryResult {
  teamSummaries: Array<{
    name: string;
    summary: string;
  }>;
}

export async function summarizeSports(sportsData: any): Promise<SportsSummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Only summarize recent/relevant teams
  const relevantTeams = (sportsData.teams || []).filter((t: any) => t.isRecent);

  if (relevantTeams.length === 0) {
    return { teamSummaries: [] };
  }

  // Build context for each team
  const teamContexts = relevantTeams.map((team: any) => {
    let context = `Team: ${team.name}`;
    if (team.record) context += ` | Record: ${team.record}`;

    if (team.lastGame) {
      const g = team.lastGame;
      context += `\nLast Game (${g.date}): ${g.awayTeam} ${g.awayScore ?? '?'} @ ${g.homeTeam} ${g.homeScore ?? '?'} — ${g.status}`;
    }

    if (team.nextGame) {
      const g = team.nextGame;
      context += `\nNext Game (${g.date}): ${g.awayTeam} @ ${g.homeTeam}`;
    }

    if (team.headlines?.length > 0) {
      context += `\nRecent Headlines:\n${team.headlines.map((h: string) => `- ${h}`).join('\n')}`;
    }

    return context;
  }).join('\n\n---\n\n');

  const prompt = `You are writing the sports section of a personal daily morning digest email. Write a colorful, personality-packed 2-4 sentence summary for each team. You're the reader's witty, opinionated sports buddy who actually watches the games.

Guidelines:
- Bring ENERGY and PERSONALITY — react to the games like a real fan would ("What a gutsy win", "Yikes, that was ugly", "They absolutely dismantled them")
- Include the score naturally but also paint the picture — was it a blowout, a nail-biter, a comeback?
- Drop in context that makes the game matter: playoff implications, rivalry history, streak context, standout player performances
- If there are headlines, weave them in with your own take — don't just state them
- For upcoming games, build some anticipation — is it a revenge game? A must-win? A trap game?
- Don't repeat the team name at the start since it's shown as a header
- Vary your tone per team — a blowout loss gets different energy than a buzzer-beater win
- Keep it fun and readable — this should be the section the reader actually looks forward to

Here are the teams to summarize:

${teamContexts}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "teamSummaries": [
    {
      "name": "exact team name from above",
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
    { label: 'anthropic-sports-summary', retries: 2 }
  );

  const text = response.content?.[0]?.text || '{}';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { teamSummaries: [] };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      teamSummaries: parsed.teamSummaries || [],
    };
  } catch {
    console.error('[AI] Failed to parse sports summary response');
    return { teamSummaries: [] };
  }
}
