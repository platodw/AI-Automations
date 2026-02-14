'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';

interface TestResult {
  section: string;
  status: 'success' | 'error' | 'pending' | 'running';
  message?: string;
  data?: any;
  timeMs?: number;
}

export default function TestPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestResult, setDigestResult] = useState<any>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const testEndpoints = [
    { section: 'Health Check', path: '/api/health' },
  ];

  const runTests = async () => {
    setResults(testEndpoints.map((e) => ({ section: e.section, status: 'pending' })));

    for (let i = 0; i < testEndpoints.length; i++) {
      const endpoint = testEndpoints[i];
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'running' } : r))
      );

      try {
        const start = Date.now();
        const res = await fetch(endpoint.path);
        const data = await res.json();
        const timeMs = Date.now() - start;

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: res.ok ? 'success' : 'error',
                  message: res.ok ? 'OK' : `HTTP ${res.status}`,
                  data,
                  timeMs,
                }
              : r
          )
        );
      } catch (error) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: 'error',
                  message: error instanceof Error ? error.message : 'Unknown error',
                }
              : r
          )
        );
      }
    }
  };

  const sendTestDigest = async () => {
    setSendingDigest(true);
    setDigestResult(null);
    try {
      const res = await fetch('/api/digest', { method: 'POST' });
      const data = await res.json();
      setDigestResult(data);
    } catch (error) {
      setDigestResult({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSendingDigest(false);
    }
  };

  const previewDigest = async () => {
    try {
      const res = await fetch('/api/digest');
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
      }
    } catch {
      // Ignore
    }
  };

  const statusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'running': return '⟳';
      default: return '○';
    }
  };

  const statusColorClass = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'running': return 'text-blue-600';
      default: return 'text-gray-400';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Test Integrations</h1>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={runTests}
            className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:bg-gray-50 transition"
          >
            <p className="font-semibold text-gray-900">Run Health Checks</p>
            <p className="text-sm text-gray-500 mt-1">Test API endpoints</p>
          </button>

          <button
            onClick={previewDigest}
            className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:bg-gray-50 transition"
          >
            <p className="font-semibold text-gray-900">Preview Digest</p>
            <p className="text-sm text-gray-500 mt-1">Generate without sending</p>
          </button>

          <button
            onClick={sendTestDigest}
            disabled={sendingDigest}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-4 text-left transition disabled:opacity-50"
          >
            <p className="font-semibold">{sendingDigest ? 'Sending...' : 'Send Test Digest'}</p>
            <p className="text-sm text-indigo-200 mt-1">Send to configured recipient</p>
          </button>
        </div>

        {/* Test Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h2>
            <div className="space-y-3">
              {results.map((result) => (
                <div key={result.section} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${statusColorClass(result.status)}`}>
                      {statusIcon(result.status)}
                    </span>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{result.section}</p>
                      {result.message && (
                        <p className={`text-xs ${result.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                          {result.message}
                        </p>
                      )}
                    </div>
                  </div>
                  {result.timeMs && (
                    <span className="text-xs text-gray-400">{result.timeMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Digest Send Result */}
        {digestResult && (
          <div className={`rounded-xl border p-6 mb-8 ${
            digestResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <h2 className="text-lg font-semibold mb-2">
              {digestResult.success ? 'Digest Sent Successfully!' : 'Digest Send Result'}
            </h2>
            {digestResult.digestId && (
              <p className="text-sm">Digest ID: #{digestResult.digestId}</p>
            )}
            {digestResult.executionTimeMs && (
              <p className="text-sm">Execution time: {(digestResult.executionTimeMs / 1000).toFixed(1)}s</p>
            )}
            {digestResult.errors && Object.keys(digestResult.errors).length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium">Section Errors:</p>
                {Object.entries(digestResult.errors).map(([key, val]) => (
                  <p key={key} className="text-xs text-red-600 mt-1">{key}: {String(val)}</p>
                ))}
              </div>
            )}
            {digestResult.error && (
              <p className="text-sm text-red-600 mt-2">{digestResult.error}</p>
            )}
          </div>
        )}

        {/* Email Preview */}
        {previewHtml && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Email Preview</h2>
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
              title="Email Preview"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
