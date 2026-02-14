# Daily Digest Automation

Automated morning email digest system that aggregates information from multiple sources and delivers a beautifully formatted email every morning at 6:30 AM EST.

## Features

| Section | Source | Description |
|---------|--------|-------------|
| Email Summaries | Gmail API | Unread emails from platodw@gmail.com and dan@danplato.com, grouped by sender |
| Calendar Events | Google Calendar API | Today's events + tomorrow preview from both accounts |
| Weather | OpenWeatherMap | Current conditions and forecast for Highland Heights, OH |
| Stock Market | Yahoo Finance / Alpha Vantage | S&P 500, Dow, Nasdaq closes + futures |
| News & Trends | NewsAPI | Top US headlines and trending topics |
| Sports Scores | ESPN API | Cavaliers, Browns, Guardians, Ohio State (football, basketball, lacrosse), SLU Billikens (basketball, soccer) |
| Anthropic Billing | Anthropic API | Daily API usage/cost summary (weekly summary on Fridays) |
| Discord Updates | Discord API | GSPro mentions from #software-updates and #public-beta-build |
| Reddit Feed | Reddit API | Top posts from user-configured subreddits |

## Dashboard

- **/** — Quick stats, send test digest, preview last digest
- **/config** — Toggle sections, set recipient email, configure subreddits
- **/history** — Last 30 digests with full content and status
- **/setup** — Step-by-step wizard for all API integrations
- **/test** — Run health checks and send test digests

## Tech Stack

- Next.js 14 (App Router, TypeScript)
- Vercel (hosting, cron jobs, Postgres)
- Tailwind CSS
- Gmail API (send-as alias for james@danplato.com)

## Setup

### 1. Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Gmail API** and **Google Calendar API**
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Application type: Web application
6. Add authorized redirect URI: `https://your-domain.vercel.app/api/oauth/google/callback`
7. Copy Client ID and Client Secret

### Gmail Send-As Alias

The digest sends from `james@danplato.com` using the Gmail API authenticated as `platodw@gmail.com`:

1. Log in to Gmail as platodw@gmail.com
2. Settings → Accounts and Import → Send mail as
3. Click "Add another email address"
4. Enter `james@danplato.com`
5. Complete the verification process

### 2. Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. New Application → name it "Daily Digest Bot"
3. Go to Bot → Add Bot
4. Enable "Message Content Intent" under Privileged Gateway Intents
5. Copy the Bot Token
6. OAuth2 → URL Generator: select `bot` scope
7. Permissions: Read Messages/View Channels, Read Message History
8. Use the generated URL to invite the bot to your GSPro Discord server
9. Get the Guild (Server) ID: enable Developer Mode in Discord, right-click server → Copy Server ID

### 3. Reddit API

1. Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
2. Click "create another app..."
3. Select "script" type
4. Copy the Client ID (shown below the app name) and Secret

### 4. Other API Keys

| Service | URL | Notes |
|---------|-----|-------|
| OpenWeatherMap | [openweathermap.org/api](https://openweathermap.org/api) | Free tier works |
| NewsAPI | [newsapi.org](https://newsapi.org/) | Free: 100 req/day |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) | Needs billing read access |
| Alpha Vantage | [alphavantage.co](https://www.alphavantage.co/support/#api-key) | Optional stock fallback |

## Environment Variables

Copy `.env.example` to `.env.local` and fill in all values. See the file for descriptions of each variable.

Key variables:
- `DASHBOARD_PASSWORD` — Password for the web dashboard
- `CRON_SECRET` — Secret for Vercel cron authentication (generate with `openssl rand -hex 32`)
- `DIGEST_RECIPIENT_EMAIL` — Where to send the daily digest

## Deployment

### Vercel

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add all environment variables in the Vercel dashboard
4. Create a **Vercel Postgres** database in Storage tab
5. Deploy

### Post-Deployment

1. Visit `https://your-app.vercel.app/api/health` to verify
2. Log in to the dashboard
3. Click "Initialize Database" to create tables
4. Complete Google OAuth setup via the Setup Wizard
5. Send a test digest

### Cron Schedule

The digest runs daily at 6:30 AM EST (11:30 UTC), configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "30 11 * * *"
    }
  ]
}
```

The cron endpoint requires the `CRON_SECRET` to be set and passes it via the `Authorization: Bearer <secret>` header (handled automatically by Vercel).

## Architecture

### Digest Engine

The digest engine (`src/lib/digest-engine.ts`) fetches all sections in parallel. Each section:
- Has its own fetcher in `src/lib/sections/`
- Uses retry logic (3 retries with exponential backoff)
- Fails independently — one section error doesn't block others
- Logs execution time and errors

### Email Template

The HTML email template (`src/lib/email-template.ts`) is:
- Mobile responsive
- Professional design with gradient header
- Sections clearly separated with headers
- Inline CSS for maximum email client compatibility

### Database Schema

| Table | Purpose |
|-------|---------|
| `digests` | Stores each digest sent with full content JSON, status, errors, and timing |
| `config` | Key-value store for user preferences (section toggles, subreddits, etc.) |
| `oauth_tokens` | Google OAuth tokens with auto-refresh |
| `digest_logs` | Per-section execution logs for debugging |

### Error Handling

- Each section is wrapped in try/catch and runs independently
- 3 retries with exponential backoff for API calls
- Digest sends even if some sections fail (status: "partial")
- All errors stored in database for troubleshooting
- Health check endpoint at `/api/health`

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in environment variables
npm run dev
```

Visit `http://localhost:3000/login` and use your `DASHBOARD_PASSWORD`.
