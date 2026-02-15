'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';

interface Automation {
  id: number;
  name: string;
  delivery_time: string;
  recipient_email: string;
  enabled: boolean;
  sections: Record<string, boolean>;
  created_at: string;
}

interface DigestSummary {
  id: number;
  sent_at: string;
  status: string;
  automation_name: string | null;
}

export default function HomePage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [recentDigests, setRecentDigests] = useState<DigestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState('06:30');
  const [newEmail, setNewEmail] = useState('platodw@gmail.com');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [autoRes, histRes] = await Promise.all([
        fetch('/api/automations'),
        fetch('/api/digest/history'),
      ]);
      if (autoRes.ok) setAutomations(await autoRes.json());
      if (histRes.ok) setRecentDigests(await histRes.json());
    } catch {
      // Will show empty state
    } finally {
      setLoading(false);
    }
  };

  const createAutomation = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          delivery_time: newTime,
          recipient_email: newEmail,
        }),
      });
      if (res.ok) {
        const automation = await res.json();
        setShowCreate(false);
        setNewName('');
        setNewTime('06:30');
        router.push(`/automations/${automation.id}`);
      }
    } catch {
      // Error creating
    } finally {
      setCreating(false);
    }
  };

  const initDb = async () => {
    try {
      const res = await fetch('/api/init', { method: 'POST' });
      const data = await res.json();
      alert(data.success ? 'Database initialized!' : `Error: ${data.error}`);
      fetchData();
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  const enabledCount = (sections: Record<string, boolean>) =>
    Object.values(sections).filter(Boolean).length;

  const statusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'partial': return 'bg-yellow-100 text-yellow-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
          <div className="flex gap-2">
            <button
              onClick={initDb}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            >
              Init DB
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
            >
              + New Automation
            </button>
          </div>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Automation</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Evening Summary"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Time (ET)</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={createAutomation}
                  disabled={creating || !newName.trim()}
                  className="flex-1 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : automations.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500 mb-4">No automations configured yet.</p>
            <button
              onClick={initDb}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
            >
              Initialize Database
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {automations.map((auto) => (
              <div
                key={auto.id}
                onClick={() => router.push(`/automations/${auto.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${auto.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <h3 className="font-semibold text-gray-900">{auto.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {auto.delivery_time} ET &bull; {auto.recipient_email} &bull; {enabledCount(auto.sections)} sections
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${auto.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {auto.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Activity */}
        {recentDigests.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {recentDigests.slice(0, 5).map((d) => (
                <div key={d.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {d.automation_name || 'Digest'} #{d.id}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(d.sent_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(d.status)}`}>
                    {d.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
