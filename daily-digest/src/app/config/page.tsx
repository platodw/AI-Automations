'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';

const SECTIONS = [
  { key: 'emails', label: 'Email Summaries', desc: 'Emails received since last digest with AI-powered action items' },
  { key: 'calendar', label: 'Calendar Events', desc: 'Today and tomorrow events' },
  { key: 'weather', label: 'Weather', desc: 'Lyndhurst, OH forecast' },
  { key: 'stocks', label: 'Stock Market', desc: 'S&P 500, Dow, Nasdaq' },
  { key: 'news', label: 'News & Trends', desc: 'Top headlines and trending topics' },
  { key: 'sports', label: 'Sports Scores', desc: 'Cleveland + Ohio State + SLU teams' },
  { key: 'anthropicBilling', label: 'Anthropic Billing', desc: 'Daily API usage (weekly on Fridays)' },
  { key: 'discord', label: 'Discord GSPro', desc: 'GSPro updates from Discord' },
  { key: 'reddit', label: 'Reddit Feed', desc: 'Top posts from monitored subreddits' },
];

export default function ConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        setConfig(await res.json());
      } else {
        setError('Failed to load configuration.');
      }
    } catch {
      setError('Failed to connect. Check your network connection.');
    }
  };

  const saveConfig = async (updates: Record<string, string>) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setConfig((prev) => ({ ...prev, ...updates }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError('Failed to save configuration.');
      }
    } catch {
      setError('Failed to connect. Check your network connection.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (key: string) => {
    const currentValue = config[`section_${key}`] !== 'false';
    saveConfig({ [`section_${key}`]: currentValue ? 'false' : 'true' });
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          {saved && <span className="text-green-600 text-sm font-medium">Saved!</span>}
        </div>

        {error && (
          <div className="p-4 rounded-lg mb-6 bg-red-50 text-red-800">
            {error}
          </div>
        )}

        {/* Section Toggles */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Digest Sections</h2>
          <div className="space-y-3">
            {SECTIONS.map((section) => (
              <div key={section.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{section.label}</p>
                  <p className="text-xs text-gray-500">{section.desc}</p>
                </div>
                <button
                  onClick={() => toggleSection(section.key)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    config[`section_${section.key}`] !== 'false'
                      ? 'bg-indigo-600'
                      : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      config[`section_${section.key}`] !== 'false' ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recipient Email */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Digest Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.digest_name || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, digest_name: e.target.value }))}
                  placeholder="Morning Digest"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => saveConfig({ digest_name: config.digest_name || '' })}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Used in the email subject line and header. Default: Morning Digest</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={config.recipient_email || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, recipient_email: e.target.value }))}
                  placeholder="platodw@gmail.com"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => saveConfig({ recipient_email: config.recipient_email || '' })}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Time (Eastern Time)</label>
              <div className="flex gap-2">
                <input
                  type="time"
                  value={config.delivery_time || '06:30'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, delivery_time: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => saveConfig({ delivery_time: config.delivery_time || '06:30' })}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Default: 6:30 AM ET. The digest will be sent within 15 minutes of this time.</p>
            </div>
          </div>
        </div>

        {/* Reddit Subreddits */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reddit Configuration</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subreddits to Monitor (comma-separated)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.reddit_subreddits || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, reddit_subreddits: e.target.value }))}
                placeholder="technology, programming, worldnews, golf"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={() => saveConfig({ reddit_subreddits: config.reddit_subreddits || '' })}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Default: technology, programming, worldnews</p>
          </div>
        </div>

        {/* API Keys Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">API Keys Status</h2>
          <p className="text-sm text-gray-500 mb-4">API keys are configured via environment variables. Go to the Setup page for configuration instructions.</p>
          <div className="space-y-2">
            {[
              { key: 'GOOGLE_CLIENT_ID', label: 'Google OAuth' },
              { key: 'OPENWEATHER_API_KEY', label: 'OpenWeatherMap' },
              { key: 'NEWSAPI_KEY', label: 'NewsAPI' },
              { key: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
              { key: 'DISCORD_BOT_TOKEN', label: 'Discord Bot' },
              { key: 'REDDIT_CLIENT_ID', label: 'Reddit' },
              { key: 'ALPHA_VANTAGE_API_KEY', label: 'Alpha Vantage' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-600">{item.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  config[`__env_${item.key}`] === 'true' || true
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-red-100 text-red-600'
                }`}>
                  Set via env vars
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
