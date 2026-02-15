import { withRetry } from '@/lib/retry';

interface GameScore {
  homeTeam: string;
  homeTeamId: string;
  awayTeam: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  date: string;
  rawDate: string; // ISO string for recency checks
  league: string;
}

interface TeamData {
  name: string;
  espnId: string;
  lastGame: GameScore | null;
  nextGame: GameScore | null;
  record?: string;
  headlines: string[];
  isRecent: boolean; // true if last game within 3 days or next game within 2 days
}

interface SportsData {
  teams: TeamData[];
  errors: string[];
}

const TEAMS = [
  { name: 'Cleveland Cavaliers', espnId: '5', league: 'nba', sport: 'basketball' },
  { name: 'Cleveland Browns', espnId: '5', league: 'nfl', sport: 'football' },
  { name: 'Cleveland Guardians', espnId: '5', league: 'mlb', sport: 'baseball' },
  { name: 'Ohio State Buckeyes Football', espnId: '194', league: 'college-football', sport: 'football', group: '80' },
  { name: 'Ohio State Buckeyes Basketball', espnId: '194', league: 'mens-college-basketball', sport: 'basketball', group: '50' },
  { name: 'Ohio State Buckeyes Lacrosse', espnId: '194', league: 'college-lacrosse', sport: 'lacrosse' },
  { name: 'SLU Billikens Basketball', espnId: '139', league: 'mens-college-basketball', sport: 'basketball', group: '50' },
  { name: 'SLU Billikens Soccer', espnId: '139', league: 'college-soccer', sport: 'soccer' },
];

function parseScore(comp: any): number | null {
  if (!comp) return null;
  // ESPN score can be: comp.score (string), comp.score.value, or comp.score.displayValue
  const raw = typeof comp.score === 'object'
    ? (comp.score?.displayValue ?? comp.score?.value)
    : comp.score;
  if (raw === undefined || raw === null || raw === '') return null;
  const num = parseInt(String(raw), 10);
  return isNaN(num) ? null : num;
}

function formatDateET(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

function checkRecency(lastGame: GameScore | null, nextGame: GameScore | null): boolean {
  const now = new Date();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  if (lastGame?.rawDate) {
    const lastDate = new Date(lastGame.rawDate);
    if (now.getTime() - lastDate.getTime() <= THREE_DAYS_MS) return true;
  }
  if (nextGame?.rawDate) {
    const nextDate = new Date(nextGame.rawDate);
    if (nextDate.getTime() - now.getTime() <= TWO_DAYS_MS) return true;
  }
  return false;
}

function getSportPath(team: typeof TEAMS[number]): string {
  if (team.league.includes('college')) {
    return team.sport === 'football' ? 'football/college-football'
      : team.sport === 'basketball' ? 'basketball/mens-college-basketball'
      : team.sport === 'lacrosse' ? 'lacrosse/mens-college-lacrosse'
      : 'soccer/college-soccer';
  }
  return `${team.sport}/${team.league}`;
}

async function fetchTeamHeadlines(team: typeof TEAMS[number]): Promise<string[]> {
  try {
    const sportPath = getSportPath(team);
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/news?team=${team.espnId}&limit=3`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DailyDigest/1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).slice(0, 3).map((a: any) => {
      const headline = a.headline || '';
      const description = a.description || '';
      return description ? `${headline}: ${description}` : headline;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchESPNTeamSchedule(team: typeof TEAMS[number]): Promise<TeamData> {
  try {
    let url: string;
    if (team.league.includes('college')) {
      const sportPath = team.sport === 'football' ? 'football/college-football'
        : team.sport === 'basketball' ? 'basketball/mens-college-basketball'
        : team.sport === 'lacrosse' ? 'lacrosse/mens-college-lacrosse'
        : `soccer/college-soccer`;
      url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${team.espnId}/schedule`;
    } else {
      url = `https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.league}/teams/${team.espnId}/schedule`;
    }

    const data = await withRetry(
      async () => {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'DailyDigest/1.0' },
        });
        if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
        return res.json();
      },
      { label: `sports-${team.name}`, retries: 2 }
    );

    const events = data.events || [];
    const now = new Date();
    let lastGame: GameScore | null = null;
    let nextGame: GameScore | null = null;

    for (const event of events) {
      const eventDate = new Date(event.date);
      const competitions = event.competitions?.[0];
      if (!competitions) continue;

      const homeComp = competitions.competitors?.find((c: any) => c.homeAway === 'home');
      const awayComp = competitions.competitors?.find((c: any) => c.homeAway === 'away');

      const game: GameScore = {
        homeTeam: homeComp?.team?.displayName || homeComp?.team?.name || 'TBD',
        homeTeamId: String(homeComp?.team?.id || ''),
        awayTeam: awayComp?.team?.displayName || awayComp?.team?.name || 'TBD',
        awayTeamId: String(awayComp?.team?.id || ''),
        homeScore: competitions.status?.type?.completed ? parseScore(homeComp) : null,
        awayScore: competitions.status?.type?.completed ? parseScore(awayComp) : null,
        status: competitions.status?.type?.shortDetail || event.status?.type?.shortDetail || 'Scheduled',
        date: formatDateET(eventDate),
        rawDate: eventDate.toISOString(),
        league: team.league,
      };

      if (eventDate < now && competitions.status?.type?.completed) {
        lastGame = game;
      } else if (eventDate >= now && !nextGame) {
        nextGame = game;
      }
    }

    const record = data.team?.record?.items?.[0]?.summary;
    const headlines = await fetchTeamHeadlines(team);
    const isRecent = checkRecency(lastGame, nextGame);

    return { name: team.name, espnId: team.espnId, lastGame, nextGame, record, headlines, isRecent };
  } catch {
    // Try the scoreboard endpoint as fallback
    try {
      const sportPath = team.sport === 'football'
        ? (team.league === 'nfl' ? 'football/nfl' : 'football/college-football')
        : team.sport === 'basketball'
        ? (team.league === 'nba' ? 'basketball/nba' : 'basketball/mens-college-basketball')
        : team.sport === 'baseball' ? 'baseball/mlb'
        : `${team.sport}/${team.league}`;

      const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard`;
      const res = await fetch(scoreboardUrl);
      if (res.ok) {
        const data = await res.json();
        const teamEvent = data.events?.find((e: any) =>
          e.competitions?.[0]?.competitors?.some(
            (c: any) => String(c.team?.id) === team.espnId
          )
        );

        if (teamEvent) {
          const competitions = teamEvent.competitions[0];
          const homeComp = competitions.competitors.find((c: any) => c.homeAway === 'home');
          const awayComp = competitions.competitors.find((c: any) => c.homeAway === 'away');

          const lastGame: GameScore = {
            homeTeam: homeComp?.team?.displayName || 'TBD',
            homeTeamId: String(homeComp?.team?.id || ''),
            awayTeam: awayComp?.team?.displayName || 'TBD',
            awayTeamId: String(awayComp?.team?.id || ''),
            homeScore: parseScore(homeComp),
            awayScore: parseScore(awayComp),
            status: competitions.status?.type?.shortDetail || 'Final',
            date: formatDateET(new Date(teamEvent.date)),
            rawDate: new Date(teamEvent.date).toISOString(),
            league: team.league,
          };
          const headlines = await fetchTeamHeadlines(team);
          return {
            name: team.name,
            espnId: team.espnId,
            lastGame,
            nextGame: null,
            headlines,
            isRecent: checkRecency(lastGame, null),
          };
        }
      }
    } catch {
      // Fallback also failed
    }

    return {
      name: team.name,
      espnId: team.espnId,
      lastGame: null,
      nextGame: null,
      headlines: [],
      isRecent: false,
    };
  }
}

export async function fetchSports(): Promise<SportsData> {
  const errors: string[] = [];
  const results = await Promise.allSettled(
    TEAMS.map((team) => fetchESPNTeamSchedule(team))
  );

  const teams: TeamData[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      teams.push(result.value);
    } else {
      errors.push(`${TEAMS[i].name}: ${result.reason}`);
      teams.push({ name: TEAMS[i].name, espnId: TEAMS[i].espnId, lastGame: null, nextGame: null, headlines: [], isRecent: false });
    }
  }

  return { teams, errors };
}
