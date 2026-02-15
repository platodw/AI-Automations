'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';

interface SetupStep {
  id: string;
  title: string;
  content: React.ReactNode;
}

export default function SetupPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [connectingGoogle, setConnectingGoogle] = useState<string | null>(null);

  const connectGoogle = async (account: string) => {
    setConnectingGoogle(account);
    try {
      const res = await fetch(`/api/oauth/google?account=${encodeURIComponent(account)}`);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      }
    } catch {
      alert('Failed to initiate Google OAuth');
      setConnectingGoogle(null);
    }
  };

  const steps: SetupStep[] = [
    {
      id: 'google',
      title: '1. Google OAuth Setup',
      content: (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-semibold mb-2">Prerequisites:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to <a href="https://console.cloud.google.com/" className="underline" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
              <li>Create a new project or select existing one</li>
              <li>Enable Gmail API and Google Calendar API</li>
              <li>Go to Credentials &rarr; Create Credentials &rarr; OAuth 2.0 Client ID</li>
              <li>Set Application Type to &quot;Web application&quot;</li>
              <li>Add authorized redirect URI: <code className="bg-blue-100 px-1 rounded">YOUR_DOMAIN/api/oauth/google/callback</code></li>
              <li>Copy Client ID and Client Secret to your environment variables</li>
            </ol>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
            <p className="font-semibold mb-2">Gmail Send-As Alias Setup:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Log in to Gmail as platodw@gmail.com</li>
              <li>Go to Settings &rarr; Accounts and Import &rarr; Send mail as</li>
              <li>Click &quot;Add another email address&quot;</li>
              <li>Enter &quot;james@danplato.com&quot; as the email</li>
              <li>Follow the verification steps</li>
              <li>This allows sending digest emails from james@danplato.com via the platodw@gmail.com account</li>
            </ol>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Connect Google Accounts:</p>
            <div className="flex gap-3">
              <button
                onClick={() => connectGoogle('platodw@gmail.com')}
                disabled={connectingGoogle !== null}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                {connectingGoogle === 'platodw@gmail.com' ? 'Connecting...' : 'Connect platodw@gmail.com'}
              </button>
              <button
                onClick={() => connectGoogle('dan@danplato.com')}
                disabled={connectingGoogle !== null}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                {connectingGoogle === 'dan@danplato.com' ? 'Connecting...' : 'Connect dan@danplato.com'}
              </button>
              <button
                onClick={() => connectGoogle('dan@narrativemoney.com')}
                disabled={connectingGoogle !== null}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                {connectingGoogle === 'dan@narrativemoney.com' ? 'Connecting...' : 'Connect dan@narrativemoney.com'}
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg font-mono">
            GOOGLE_CLIENT_ID=your_client_id<br />
            GOOGLE_CLIENT_SECRET=your_client_secret<br />
            GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/api/oauth/google/callback
          </div>
        </div>
      ),
    },
    {
      id: 'discord',
      title: '2. Discord Bot Setup',
      content: (
        <div className="space-y-4">
          <div className="bg-indigo-50 rounded-lg p-4 text-sm text-indigo-800">
            <p className="font-semibold mb-2">Create Discord Bot:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to <a href="https://discord.com/developers/applications" className="underline" target="_blank" rel="noopener noreferrer">Discord Developer Portal</a></li>
              <li>Click &quot;New Application&quot; &rarr; name it &quot;Morning Digest Bot&quot;</li>
              <li>Go to Bot section &rarr; Click &quot;Add Bot&quot;</li>
              <li>Under Privileged Gateway Intents, enable &quot;Message Content Intent&quot;</li>
              <li>Copy the Bot Token to your environment variables</li>
              <li>Go to OAuth2 &rarr; URL Generator</li>
              <li>Select scopes: <code className="bg-indigo-100 px-1 rounded">bot</code></li>
              <li>Select permissions: <code className="bg-indigo-100 px-1 rounded">Read Messages/View Channels</code>, <code className="bg-indigo-100 px-1 rounded">Read Message History</code></li>
              <li>Copy the generated URL and open it to invite the bot to your GSPro Discord server</li>
            </ol>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <p className="font-semibold text-gray-700 mb-2">Finding your Guild ID:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>Enable Developer Mode in Discord (User Settings &rarr; App Settings &rarr; Advanced)</li>
              <li>Right-click the server name &rarr; Copy Server ID</li>
              <li>Set this as your DISCORD_GUILD_ID environment variable</li>
            </ol>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg font-mono">
            DISCORD_BOT_TOKEN=your_bot_token<br />
            DISCORD_GUILD_ID=your_guild_id
          </div>
        </div>
      ),
    },
    {
      id: 'reddit',
      title: '3. Reddit Feed',
      content: (
        <div className="space-y-4">
          <div className="bg-green-50 rounded-lg p-4 text-sm text-green-800">
            <p className="font-semibold mb-2">No API keys needed!</p>
            <p>Reddit feeds use public JSON endpoints, so no account or API credentials are required.</p>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 text-sm text-orange-800">
            <p className="font-semibold mb-2">Configure your subreddits:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Deploy your app and log in to the dashboard</li>
              <li>Go to the <strong>Config</strong> page</li>
              <li>Find the <strong>Reddit Subreddits</strong> field</li>
              <li>Enter a comma-separated list of subreddits (e.g. <code className="bg-orange-100 px-1 rounded">technology, programming, golf</code>)</li>
              <li>The digest will include the top posts from each subreddit</li>
            </ol>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-semibold text-gray-700 mb-1">Default subreddits:</p>
            <p>technology, programming, worldnews</p>
          </div>
        </div>
      ),
    },
    {
      id: 'apikeys',
      title: '4. Other API Keys',
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-gray-700 text-sm mb-2">OpenWeatherMap</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                <li>Sign up at <a href="https://openweathermap.org/api" className="underline text-indigo-600" target="_blank" rel="noopener noreferrer">openweathermap.org</a></li>
                <li>Go to API Keys and copy your key</li>
                <li>Free tier supports current weather and 5-day forecast</li>
              </ol>
              <code className="block mt-2 text-xs bg-white p-2 rounded text-gray-500">OPENWEATHER_API_KEY=your_key</code>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-gray-700 text-sm mb-2">NewsAPI</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                <li>Sign up at <a href="https://newsapi.org/" className="underline text-indigo-600" target="_blank" rel="noopener noreferrer">newsapi.org</a></li>
                <li>Go to Account and copy your API key</li>
                <li>Free tier: 100 requests/day (sufficient for morning digest)</li>
              </ol>
              <code className="block mt-2 text-xs bg-white p-2 rounded text-gray-500">NEWSAPI_KEY=your_key</code>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-gray-700 text-sm mb-2">Anthropic API</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                <li>Go to <a href="https://console.anthropic.com/" className="underline text-indigo-600" target="_blank" rel="noopener noreferrer">console.anthropic.com</a></li>
                <li>Navigate to API Keys and create a new key</li>
                <li>Ensure the key has billing/usage read permissions</li>
              </ol>
              <code className="block mt-2 text-xs bg-white p-2 rounded text-gray-500">ANTHROPIC_API_KEY=your_key</code>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-gray-700 text-sm mb-2">Alpha Vantage (optional, stock data backup)</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                <li>Sign up at <a href="https://www.alphavantage.co/support/#api-key" className="underline text-indigo-600" target="_blank" rel="noopener noreferrer">alphavantage.co</a></li>
                <li>Get your free API key</li>
              </ol>
              <code className="block mt-2 text-xs bg-white p-2 rounded text-gray-500">ALPHA_VANTAGE_API_KEY=your_key</code>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'deployment',
      title: '5. Deployment & Cron',
      content: (
        <div className="space-y-4">
          <div className="bg-green-50 rounded-lg p-4 text-sm text-green-800">
            <p className="font-semibold mb-2">Vercel Deployment:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Push your code to GitHub</li>
              <li>Import the project in Vercel</li>
              <li>Add all environment variables in the Vercel dashboard</li>
              <li>Create a Vercel Postgres database in your project settings</li>
              <li>The cron job runs every 30 min and sends at your configured delivery time (default 6:30 AM ET)</li>
              <li>After deploying, visit /api/health to verify all services</li>
              <li>Click &quot;Initialize Database&quot; on the dashboard to create tables</li>
              <li>Send a test digest to verify everything works</li>
            </ol>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <p className="font-semibold text-gray-700 mb-2">Required Environment Variables:</p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap">
{`DASHBOARD_PASSWORD=your_secure_password
CRON_SECRET=your_cron_secret

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/oauth/google/callback

# API Keys
OPENWEATHER_API_KEY=...
NEWSAPI_KEY=...
ANTHROPIC_API_KEY=...
ALPHA_VANTAGE_API_KEY=...

# Discord
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...

# Reddit - no API keys needed (uses public feeds)

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
DIGEST_RECIPIENT_EMAIL=platodw@gmail.com`}
            </pre>
          </div>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Setup Wizard</h1>

        {/* Step Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {steps.map((step, i) => (
            <button
              key={step.id}
              onClick={() => setActiveStep(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                activeStep === i
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {step.title}
            </button>
          ))}
        </div>

        {/* Active Step Content */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{steps[activeStep].title}</h2>
          {steps[activeStep].content}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-4">
          <button
            onClick={() => setActiveStep((p) => Math.max(0, p - 1))}
            disabled={activeStep === 0}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30"
          >
            &larr; Previous
          </button>
          <button
            onClick={() => setActiveStep((p) => Math.min(steps.length - 1, p + 1))}
            disabled={activeStep === steps.length - 1}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-30"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
