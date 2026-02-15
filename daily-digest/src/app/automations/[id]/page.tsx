'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';

interface Automation {
  id: number;
  name: string;
  delivery_time: string;
  recipient_email: string;
  enabled: boolean;
  sections: Record<string, boolean>;
  settings: Record<string, string>;
}

const SECTIONS = [
  { key: 'emails', label: 'Email Summaries', desc: 'Emails received since last digest with AI-powered action items' },
  { key: 'calendar', label: 'Calendar Events', desc: 'Today and tomorrow events' },
  { key: 'weather', label: 'Weather', desc: 'Lyndhurst, OH forecast' },
  { key: 'stocks', label: 'Stock Market', desc: 'S&P 500, Dow, Nasdaq' },
  { key: 'news', label: 'News & Trends', desc: 'Top headlines and trending topics' },
  { key: 'sports', label: 'Sports Scores', desc: 'Cleveland + Ohio State + SLU teams' },
  { key: 'anthropicBilling', label: 'Anthropic Billing', desc: 'Daily API usage (weekly on Fridays)' },
  { key: 'reddit', label: 'Reddit Feed', desc: 'Top posts from monitored subreddits' },
];

export default function AutomationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const fetchAutomation = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/${id}`);
      if (res.ok) {
        setAutomation(await res.json());
      } else {
        setError('Automation not found.');
      }
    } catch {
      setError('Failed to connect.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAutomation();
  }, [fetchAutomation]);

  const saveField = async (updates: Partial<Automation>) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setAutomation(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError('Failed to save.');
      }
    } catch {
      setError('Failed to connect.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (key: string) => {
    if (!automation) return;
    const newSections = { ...automation.sections, [key]: !automation.sections[key] };
    setAutomation({ ...automation, sections: newSections });
    saveField({ sections: newSections });
  };

  const toggleEnabled = () => {
    if (!automation) return;
    saveField({ enabled: !automation.enabled });
  };

  const sendTestDigest = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`/api/digest?automationId=${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSendResult(`Digest #${data.digestId} sent in ${(data.executionTimeMs / 1000).toFixed(1)}s`);
      } else {
        setSendResult(`Errors: ${JSON.stringify(data.errors)}`);
      }
    } catch (err) {
      setSendResult(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const loadPreview = async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch(`/api/digest?automationId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
      } else {
        setError('Failed to load preview.');
      }
    } catch {
      setError('Failed to connect.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const deleteAutomation = async () => {
    try {
      const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
      } else {
        setError('Failed to delete automation.');
      }
    } catch {
      setError('Failed to connect.');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-500">Loading...</p>
      </DashboardLayout>
    );
  }

  if (!automation) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl">
          <p className="text-red-600">{error || 'Automation not found.'}</p>
          <button onClick={() => router.push('/')} className="mt-4 text-indigo-600 text-sm hover:underline">
            Back to automations
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600">
              &larr;
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{automation.name}</h1>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${automation.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {automation.enabled ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-green-600 text-sm font-medium">Saved!</span>}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg mb-6 bg-red-50 text-red-800">{error}</div>
        )}

        {sendResult && (
          <div className={`p-4 rounded-lg mb-6 ${sendResult.includes('sent') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {sendResult}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <button
            onClick={sendTestDigest}
            disabled={sending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-4 text-left transition disabled:opacity-50"
          >
            <p className="font-semibold text-sm">{sending ? 'Sending...' : 'Send Now'}</p>
            <p className="text-xs text-indigo-200 mt-1">Send this digest immediately</p>
          </button>

          <button
            onClick={loadPreview}
            disabled={loadingPreview}
            className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 text-left transition"
          >
            <p className="font-semibold text-gray-900 text-sm">{loadingPreview ? 'Loading...' : 'Preview'}</p>
            <p className="text-xs text-gray-500 mt-1">Preview without sending</p>
          </button>

          <button
            onClick={toggleEnabled}
            className={`rounded-xl p-4 text-left transition border ${
              automation.enabled
                ? 'bg-white hover:bg-gray-50 border-gray-200'
                : 'bg-green-50 hover:bg-green-100 border-green-200'
            }`}
          >
            <p className="font-semibold text-gray-900 text-sm">
              {automation.enabled ? 'Pause' : 'Resume'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {automation.enabled ? 'Stop scheduled sends' : 'Re-enable scheduling'}
            </p>
          </button>
        </div>

        {/* General Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Automation Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={automation.name}
                  onChange={(e) => setAutomation({ ...automation, name: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => saveField({ name: automation.name })}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Used in the email subject line and header</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Time (Eastern Time)</label>
              <div className="flex gap-2">
                <input
                  type="time"
                  value={automation.delivery_time}
                  onChange={(e) => setAutomation({ ...automation, delivery_time: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => saveField({ delivery_time: automation.delivery_time })}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">The digest will be sent within 15 minutes of this time</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={automation.recipient_email}
                  onChange={(e) => setAutomation({ ...automation, recipient_email: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => saveField({ recipient_email: automation.recipient_email })}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

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
                    automation.sections[section.key]
                      ? 'bg-indigo-600'
                      : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      automation.sections[section.key] ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Weather Settings */}
        {automation.sections.weather && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Weather Configuration</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weather Mode</label>
              <div className="flex gap-2">
                <select
                  value={automation.settings.weather_mode || 'today'}
                  onChange={(e) => {
                    const newSettings = { ...automation.settings, weather_mode: e.target.value };
                    setAutomation({ ...automation, settings: newSettings });
                    saveField({ settings: newSettings });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="today">Today&apos;s Weather — current conditions + hourly forecast</option>
                  <option value="tomorrow">Tomorrow&apos;s Preview — next day forecast with comparison</option>
                </select>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {(automation.settings.weather_mode || 'today') === 'tomorrow'
                  ? 'Shows brief current conditions, then highlights tomorrow\'s high/low, conditions, and how it compares to today'
                  : 'Shows current temperature, conditions, and 6-hour forecast'
                }
              </p>
            </div>
          </div>
        )}

        {/* Reddit Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reddit Configuration</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subreddits to Monitor (comma-separated)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={automation.settings.reddit_subreddits || ''}
                onChange={(e) => setAutomation({
                  ...automation,
                  settings: { ...automation.settings, reddit_subreddits: e.target.value },
                })}
                placeholder="technology, programming, worldnews, golf"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={() => saveField({ settings: automation.settings })}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Default: technology, programming, worldnews</p>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-xl border border-red-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Danger Zone</h2>
          <p className="text-sm text-gray-500 mb-4">Permanently delete this automation and all its history.</p>
          <button
            onClick={() => setShowDelete(true)}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
          >
            Delete Automation
          </button>
        </div>

        {/* Delete Confirmation */}
        {showDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete &quot;{automation.name}&quot;?</h2>
              <p className="text-sm text-gray-500 mb-4">This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDelete(false)}
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteAutomation}
                  className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preview */}
        {previewHtml && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Digest Preview</h2>
              <button
                onClick={() => setPreviewHtml(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                &times;
              </button>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="w-full border-0"
              style={{ height: '800px' }}
              title="Digest Preview"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
