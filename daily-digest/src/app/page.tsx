'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';

interface DigestSummary {
  id: number;
  sent_at: string;
  status: string;
  errors: Record<string, string> | null;
  execution_time_ms: number;
  recipient_email: string;
}

export default function HomePage() {
  const [lastDigest, setLastDigest] = useState<DigestSummary | null>(null);
  const [stats, setStats] = useState<{ total: number; successful: number; failed: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/digest/history');
      if (res.ok) {
        const digests = await res.json();
        if (digests.length > 0) {
          setLastDigest(digests[0]);
          setStats({
            total: digests.length,
            successful: digests.filter((d: DigestSummary) => d.status === 'sent').length,
            failed: digests.filter((d: DigestSummary) => d.status === 'error').length,
          });
        }
      }
    } catch {
      // Database may not be initialized yet
    }
  };

  const sendTestDigest = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/digest', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSendResult(`Digest #${data.digestId} sent successfully in ${(data.executionTimeMs / 1000).toFixed(1)}s`);
        fetchHistory();
      } else {
        setSendResult(`Errors: ${JSON.stringify(data.errors)}`);
      }
    } catch (error) {
      setSendResult(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const loadPreview = async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch('/api/digest');
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
      } else {
        setError('Failed to load preview. Please try again.');
      }
    } catch {
      setError('Failed to connect. Check your network connection.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const initDb = async () => {
    try {
      const res = await fetch('/api/init', { method: 'POST' });
      const data = await res.json();
      alert(data.success ? 'Database initialized!' : `Error: ${data.error}`);
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={sendTestDigest}
            disabled={sending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-4 text-left transition disabled:opacity-50"
          >
            <p className="font-semibold">{sending ? 'Sending...' : 'Send Test Digest'}</p>
            <p className="text-sm text-indigo-200 mt-1">Send a digest right now</p>
          </button>

          <button
            onClick={loadPreview}
            disabled={loadingPreview}
            className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 text-left transition"
          >
            <p className="font-semibold text-gray-900">{loadingPreview ? 'Loading...' : 'Preview Digest'}</p>
            <p className="text-sm text-gray-500 mt-1">Preview without sending</p>
          </button>

          <button
            onClick={initDb}
            className="bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 text-left transition"
          >
            <p className="font-semibold text-gray-900">Initialize Database</p>
            <p className="text-sm text-gray-500 mt-1">Create tables if needed</p>
          </button>
        </div>

        {sendResult && (
          <div className={`p-4 rounded-lg mb-6 ${sendResult.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {sendResult}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg mb-6 bg-red-50 text-red-800">
            {error}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Digests</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-2xl font-bold text-green-600">{stats.successful}</p>
              <p className="text-sm text-gray-500">Successful</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              <p className="text-sm text-gray-500">Failed</p>
            </div>
          </div>
        )}

        {/* Last Digest */}
        {lastDigest && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Last Digest</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Sent:</span> <span className="font-medium">{new Date(lastDigest.sent_at).toLocaleString()}</span></p>
              <p><span className="text-gray-500">Status:</span> <span className={`font-medium ${lastDigest.status === 'sent' ? 'text-green-600' : lastDigest.status === 'partial' ? 'text-yellow-600' : 'text-red-600'}`}>{lastDigest.status}</span></p>
              <p><span className="text-gray-500">Execution Time:</span> <span className="font-medium">{(lastDigest.execution_time_ms / 1000).toFixed(1)}s</span></p>
              <p><span className="text-gray-500">Recipient:</span> <span className="font-medium">{lastDigest.recipient_email}</span></p>
              {lastDigest.errors && Object.keys(lastDigest.errors).length > 0 && (
                <div className="mt-2 p-3 bg-red-50 rounded-lg">
                  <p className="font-medium text-red-800 mb-1">Errors:</p>
                  {Object.entries(lastDigest.errors).map(([key, val]) => (
                    <p key={key} className="text-red-600 text-xs">{key}: {val}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        {previewHtml && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
