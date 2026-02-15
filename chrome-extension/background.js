// Service worker for STBF Poshmark Cross-Lister

const BRIDGE_URL = 'https://muhqtjlusrezcnhpstql.supabase.co/functions/v1/poshmark-bridge';

// Get stored auth token
async function getAuthToken() {
  const result = await chrome.storage.local.get('supabase_jwt');
  return result.supabase_jwt || null;
}

// Make authenticated request to the bridge API
async function apiFetch(url, options = {}) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated. Please set your Supabase JWT token in the extension popup.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

// Fetch item data from bridge API and open Poshmark create-listing page
async function publishToPoshmark(itemId) {
  // Fetch full item data
  const data = await apiFetch(`${BRIDGE_URL}?action=get-item&itemId=${itemId}`);
  const item = data.item;

  if (!item) {
    throw new Error('Item not found');
  }

  // Store item data for the content script to pick up
  await chrome.storage.local.set({
    poshmark_pending_item: item,
    poshmark_pending_item_id: itemId
  });

  // Open Poshmark create-listing page
  await chrome.tabs.create({ url: 'https://poshmark.com/create-listing' });

  return { success: true, itemId };
}

// Mark item as listed on Poshmark
async function markListingComplete(itemId, poshmarkListingId) {
  const data = await apiFetch(BRIDGE_URL, {
    method: 'POST',
    body: JSON.stringify({ itemId, poshmarkListingId })
  });

  // Clear the pending item from storage
  await chrome.storage.local.remove(['poshmark_pending_item', 'poshmark_pending_item_id']);

  return data;
}

// Fetch pending items from bridge API
async function fetchPendingItems() {
  return apiFetch(`${BRIDGE_URL}?action=pending`);
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STBF_PUBLISH_TO_POSHMARK') {
    publishToPoshmark(message.itemId)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'POSHMARK_LISTING_COMPLETE') {
    markListingComplete(message.itemId, message.poshmarkListingId)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'SET_AUTH_TOKEN') {
    chrome.storage.local.set({ supabase_jwt: message.token })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_AUTH_STATUS') {
    getAuthToken()
      .then((token) => sendResponse({ authenticated: !!token }))
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }

  if (message.type === 'FETCH_PENDING_ITEMS') {
    fetchPendingItems()
      .then((data) => sendResponse({ success: true, items: data.items || [] }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'LOGOUT') {
    chrome.storage.local.remove(['supabase_jwt'])
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

console.log('[STBF→Poshmark] Background service worker loaded');
