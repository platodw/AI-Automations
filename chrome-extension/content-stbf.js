// Content script for STBF app (*.lovable.app)
// Auto-extracts Supabase JWT and listens for cross-listing events

(function () {
  'use strict';

  const SUPABASE_URL = 'https://muhqtjlusrezcnhpstql.supabase.co';
  // Supabase stores auth in localStorage under this key pattern
  const STORAGE_KEY = `sb-muhqtjlusrezcnhpstql-auth-token`;

  // Extract the access token from Supabase's localStorage entry
  function extractToken() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Supabase stores { access_token, refresh_token, ... } or nested under .currentSession
      const token = parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token);
      return token || null;
    } catch (e) {
      console.warn('[STBF→Poshmark] Failed to parse Supabase auth from localStorage:', e);
      return null;
    }
  }

  // Send token to the background script
  function syncToken() {
    const token = extractToken();
    if (token) {
      chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[STBF→Poshmark] Token sync error:', chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success) {
          console.log('[STBF→Poshmark] Token auto-synced from STBF app');
        }
      });
    }
  }

  // Sync token immediately on page load
  syncToken();

  // Re-sync periodically (Supabase refreshes tokens) — every 60 seconds
  setInterval(syncToken, 60 * 1000);

  // Also sync when localStorage changes (e.g. after login/token refresh)
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      console.log('[STBF→Poshmark] Supabase auth changed, re-syncing token');
      syncToken();
    }
  });

  // Listen for cross-listing events from the STBF app
  window.addEventListener('stbf-poshmark-publish', (event) => {
    const { itemId } = event.detail || {};
    if (!itemId) {
      console.error('[STBF→Poshmark] No itemId in event detail');
      return;
    }

    console.log('[STBF→Poshmark] Publishing item:', itemId);

    chrome.runtime.sendMessage({
      type: 'STBF_PUBLISH_TO_POSHMARK',
      itemId: itemId
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[STBF→Poshmark] Error:', chrome.runtime.lastError.message);
        return;
      }
      console.log('[STBF→Poshmark] Response:', response);
    });
  });

  console.log('[STBF→Poshmark] Content script loaded on STBF app');
})();
