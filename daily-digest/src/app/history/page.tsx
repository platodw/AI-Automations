'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';

interface DigestRecord {
  id: number;
  sent_at: string;
  status: string;
  errors: Record<string, string> | null;
  execution_time_ms: number;
  recipient_email: string;
  content_json: any;
}

export default function HistoryPage() {
  const [digests, setDigests] = useState<DigestRecord[]>([]);
  const [selectedDigest, setSelectedDigest] = useState<DigestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDigests();
  }, []);

  const fetchDigests = async () => {
    try {
      const res = await fetch('/api/digest/history');
      if (res.ok) {
        setDigests(await res.json());
      } else {
        setError('Failed to load digest history.');
      }
    } catch {
      setError('Failed to connect. Check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  const viewDigest = async (id: number) => {
    try {
      const res = await fetch(`/api/digest/history?id=${id}`);
      if (res.ok) {
        setSelectedDigest(await res.json());
      } else {
        setError('Failed to load digest details.');
      }
    } catch {
      setError('Failed to connect. Check your network connection.');
    }
  };

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
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Digest History</h1>

        {error && (
          <div className="p-4 rounded-lg mb-6 bg-red-50 text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : digests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No digests sent yet. Send your first test digest from the dashboard.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {digests.map((digest) => (
              <div
                key={digest.id}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 transition cursor-pointer"
                onClick={() => viewDigest(digest.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-gray-400">#{digest.id}</span>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {new Date(digest.sent_at).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(digest.sent_at).toLocaleTimeString()} &bull; {digest.recipient_email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {(digest.execution_time_ms / 1000).toFixed(1)}s
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor(digest.status)}`}>
                      {digest.status}
                    </span>
                  </div>
                </div>
                {digest.errors && Object.keys(digest.errors).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.keys(digest.errors).filter(k => k !== '_send').map((key) => (
                      <span key={key} className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">
                        {key}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Digest Detail Modal */}
        {selectedDigest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Digest #{selectedDigest.id} &mdash; {new Date(selectedDigest.sent_at).toLocaleDateString()}
                </h2>
                <button
                  onClick={() => setSelectedDigest(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  &times;
                </button>
              </div>
              <div className="overflow-auto flex-1 p-4">
                {selectedDigest.content_json?.generatedAt && (
                  <p className="text-sm text-gray-500 mb-4">
                    Generated: {new Date(selectedDigest.content_json.generatedAt).toLocaleString()}
                  </p>
                )}
                <div className="space-y-4">
                  {Object.entries(selectedDigest.content_json || {}).map(([key, value]) => {
                    if (key === 'errors' || key === 'generatedAt') return null;
                    return (
                      <div key={key} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-medium text-sm text-indigo-600 mb-2">{key}</p>
                        <pre className="text-xs text-gray-600 overflow-auto max-h-48 whitespace-pre-wrap">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
