// Content script for STBF app (*.lovable.app)
// Listens for custom events dispatched by the STBF app to trigger Poshmark cross-listing

(function () {
  'use strict';

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
