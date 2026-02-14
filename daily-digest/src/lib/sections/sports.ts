import { withRetry } from '@/lib/retry';

interface GameScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  date: string;
  league: string;
}

interface TeamData {
  name: string;
  lastGame: GameScore | null;
  nextGame: GameScore | null;
  record?: string;
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
        awayTeam: awayComp?.team?.displayName || awayComp?.team?.name || 'TBD',
        homeScore: competitions.status?.type?.completed ? parseInt(homeComp?.score || '0') : null,
        awayScore: competitions.status?.type?.completed ? parseInt(awayComp?.score || '0') : null,
        status: competitions.status?.type?.shortDetail || event.status?.type?.shortDetail || 'Scheduled',
        date: eventDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
        league: team.league,
      };

      if (eventDate < now && competitions.status?.type?.completed) {
        lastGame = game;
      } else if (eventDate >= now && !nextGame) {
        nextGame = game;
      }
    }

    const record = data.team?.record?.items?.[0]?.summary;

    return { name: team.name, lastGame, nextGame, record };
  } catch (error) {
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
            (c: any) => c.team?.id === team.espnId
          )
        );

        if (teamEvent) {
          const competitions = teamEvent.competitions[0];
          const homeComp = competitions.competitors.find((c: any) => c.homeAway === 'home');
          const awayComp = competitions.competitors.find((c: any) => c.homeAway === 'away');

          return {
            name: team.name,
            lastGame: {
              homeTeam: homeComp?.team?.displayName || 'TBD',
              awayTeam: awayComp?.team?.displayName || 'TBD',
              homeScore: parseInt(homeComp?.score || '0'),
              awayScore: parseInt(awayComp?.score || '0'),
              status: competitions.status?.type?.shortDetail || 'Final',
              date: new Date(teamEvent.date).toLocaleDateString('en-US'),
              league: team.league,
            },
            nextGame: null,
          };
        }
      }
    } catch {
      // Fallback also failed
    }

    return {
      name: team.name,
      lastGame: null,
      nextGame: null,
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
      teams.push({ name: TEAMS[i].name, lastGame: null, nextGame: null });
    }
  }

  return { teams, errors };
}
