// Popup script for STBF Poshmark Cross-Lister

const $ = (sel) => document.querySelector(sel);

const statusDot = $('#status-dot');
const statusText = $('#status-text');
const authConnected = $('#auth-connected');
const authDisconnected = $('#auth-disconnected');
const logoutBtn = $('#logout-btn');
const openAppBtn = $('#open-app-btn');
const authMessage = $('#auth-message');
const itemsSection = $('#items-section');
const itemsList = $('#items-list');
const itemsError = $('#items-error');
const loading = $('#loading');
const refreshBtn = $('#refresh-btn');

function setAuthState(authenticated) {
  if (authenticated) {
    statusDot.className = 'status-dot on';
    statusText.textContent = 'Connected';
    authConnected.style.display = 'block';
    authDisconnected.style.display = 'none';
    itemsSection.style.display = 'block';
    loadPendingItems();
  } else {
    statusDot.className = 'status-dot off';
    statusText.textContent = 'Not connected';
    authConnected.style.display = 'none';
    authDisconnected.style.display = 'block';
    itemsSection.style.display = 'none';
  }
}

function showMessage(el, text, type) {
  el.className = type === 'error' ? 'error-msg' : 'success-msg';
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

// Check auth on popup open
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  setAuthState(response && response.authenticated);
});

// Open STBF app to trigger auto-connect
openAppBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://stbf.lovable.app/' });
  showMessage(authMessage, 'Opening STBF app — token will sync automatically', 'success');
});

// Logout
logoutBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, (response) => {
    if (response && response.success) {
      setAuthState(false);
      showMessage(authMessage, 'Logged out', 'success');
    }
  });
});

// Load pending items
function loadPendingItems() {
  loading.style.display = 'block';
  itemsList.innerHTML = '';
  itemsError.textContent = '';

  chrome.runtime.sendMessage({ type: 'FETCH_PENDING_ITEMS' }, (response) => {
    loading.style.display = 'none';

    if (!response || !response.success) {
      const errMsg = (response && response.error) || 'Failed to load items';
      showMessage(itemsError, errMsg, 'error');
      return;
    }

    const items = response.items || [];
    if (items.length === 0) {
      itemsList.innerHTML = '<div class="empty-state">No pending items. All caught up!</div>';
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-info">
          <div class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="item-meta">
            ${escapeHtml(item.brand || 'No brand')} · ${escapeHtml(item.size || 'No size')}
            · <span class="item-price">$${item.price || '?'}</span>
          </div>
        </div>
        <button class="btn btn-primary btn-sm list-btn" data-item-id="${item.id}">
          List on Poshmark
        </button>
      `;
      itemsList.appendChild(card);
    });

    // Attach click handlers
    document.querySelectorAll('.list-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const itemId = e.target.dataset.itemId;
        e.target.disabled = true;
        e.target.textContent = 'Opening...';
        chrome.runtime.sendMessage({
          type: 'STBF_PUBLISH_TO_POSHMARK',
          itemId
        }, (response) => {
          if (response && response.success) {
            e.target.textContent = 'Opened';
          } else {
            e.target.disabled = false;
            e.target.textContent = 'List on Poshmark';
            showMessage(itemsError, (response && response.error) || 'Failed', 'error');
          }
        });
      });
    });
  });
}

refreshBtn.addEventListener('click', loadPendingItems);

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
