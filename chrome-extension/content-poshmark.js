// Content script for Poshmark create-listing page
// Auto-fills listing form with item data from STBF
// Uses Vue.js-compatible selectors and native value setters for reactivity

(function () {
  'use strict';

  const LOG_PREFIX = '[STBF→Poshmark]';
  const MAX_PHOTOS = 16;
  const VUE_HYDRATION_DELAY = 1500;

  // --- Field Selector Maps ---
  // Each field has an array of selectors tried in order (primary Vue selectors first, then fallbacks)

  const FIELD_SELECTORS = {
    title: [
      "input[data-vv-name='title']",
      "input[name='title']",
      "input[id='title']",
      "input[data-testid='title']",
      "input[data-testid='TextInput-listingTitle']",
      "input[placeholder*='itle']",
      "#listing-title input"
    ],
    brand: [
      "input[placeholder='Enter the Brand/Designer']",
      "input[data-vv-name='brand']",
      "input[name='brand']",
      "input[id='brand']",
      "input[data-testid='brand']",
      "input[data-testid='TextInput-listingBrand']",
      "input[placeholder*='rand']",
      "#listing-brand input"
    ],
    originalPrice: [
      "input[data-vv-name='originalPrice']",
      "input[name='originalPrice']",
      "input[id='originalPrice']",
      "input[data-testid='originalPrice']",
      "input[data-testid='TextInput-originalPrice']",
      "input[placeholder*='riginal']",
      "input[placeholder*='MSRP']",
      "input[placeholder*='Retail']"
    ],
    listingPrice: [
      "input[data-vv-name='listingPrice']",
      "input[name='listingPrice']",
      "input[id='listingPrice']",
      "input[data-testid='listingPrice']",
      "input[data-testid='TextInput-listingPrice']",
      "input[placeholder*='isting']",
      "input[placeholder*='rice']"
    ],
    description: [
      "textarea[data-vv-name='description']",
      "textarea[name='description']",
      "textarea[id='description']",
      "textarea[data-testid='description']",
      "textarea[data-testid='TextInput-listingDescription']",
      "textarea[placeholder*='escri']",
      "#listing-description textarea"
    ],
    size: [
      "input[data-vv-name='size']",
      "input[name='size']",
      "input[placeholder*='ize']"
    ],
    styleTags: [
      "input[data-vv-name='styleTags']",
      "input[data-testid='TextInput-styleTags']",
      "input[name='styleTags']",
      "input[placeholder*='tyle']"
    ]
  };

  // Selectors that indicate the Poshmark create-listing form is present
  const FORM_DETECTION_SELECTORS = [
    "input[data-vv-name='title']",
    "input[data-testid='TextInput-listingTitle']",
    "input[name='title']",
    "input[placeholder*='itle']",
    "#listing-title input",
    "form[name='listingForm']",
    ".listing-editor"
  ];

  // --- Utilities ---

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Find the first matching element from an array of selectors.
   */
  function queryFirst(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * Set a value on an input or textarea using the native setter to trigger Vue reactivity.
   * Uses HTMLInputElement setter for inputs, HTMLTextAreaElement setter for textareas.
   */
  function setNativeValue(el, value) {
    if (!el || value == null) return false;

    const isTextarea = el.tagName.toLowerCase() === 'textarea';
    const proto = isTextarea
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function click(el) {
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }

  async function waitFor(selector, timeout = 5000, root = document) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = root.querySelector(selector);
      if (el) return el;
      await sleep(200);
    }
    return null;
  }

  /**
   * Wait for any one of an array of selectors to match.
   */
  async function waitForAny(selectors, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = queryFirst(selectors);
      if (el) return el;
      await sleep(200);
    }
    return null;
  }

  function findByText(selector, text, parent = document) {
    const els = parent.querySelectorAll(selector);
    const lowerText = text.toLowerCase().trim();
    for (const el of els) {
      if (el.textContent.trim().toLowerCase() === lowerText) return el;
    }
    for (const el of els) {
      if (el.textContent.trim().toLowerCase().includes(lowerText)) return el;
    }
    return null;
  }

  // --- Condition Mapping ---

  const CONDITION_MAP = {
    'new with tags': 'nwt',
    'nwt': 'nwt',
    'new without tags': 'nwot',
    'nwot': 'nwot',
    'excellent': 'excellent',
    'like new': 'excellent',
    'very good': 'good',
    'good': 'good',
    'fair': 'fair',
    'acceptable': 'fair',
    'poor': 'poor'
  };

  function mapCondition(condition) {
    if (!condition) return 'good';
    return CONDITION_MAP[condition.toLowerCase().trim()] || 'good';
  }

  // --- Poshmark Category / Department ---

  const DEPARTMENT_KEYWORDS = {
    women: ['women', 'woman', 'womens', "women's", 'ladies', 'female'],
    men: ['men', 'man', 'mens', "men's", 'male'],
    kids: ['kids', 'kid', 'children', 'child', 'boys', 'girls', 'baby', 'toddler', 'infant']
  };

  function detectDepartment(item) {
    const dept = (item.department || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    const combined = `${dept} ${cat}`;
    for (const [key, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
      if (keywords.some((kw) => combined.includes(kw))) return key;
    }
    return 'women';
  }

  // --- Main Form Filler ---

  async function fillListingForm(item) {
    log('Starting form fill for:', item.title);

    // Vue hydration delay — let Poshmark's Vue.js finish binding to the DOM
    log(`Waiting ${VUE_HYDRATION_DELAY}ms for Vue hydration...`);
    await sleep(VUE_HYDRATION_DELAY);

    // --- Title ---
    await fillField('title', item.title, 80);

    // --- Description ---
    await fillDescription(item);

    // --- Category ---
    await fillCategory(item);
    await sleep(500);

    // --- Size ---
    await fillSize(item.size);

    // --- Brand ---
    await fillBrand(item.brand);

    // --- Color ---
    await fillColor(item.color);

    // --- Condition ---
    await fillCondition(item.condition);

    // --- Original Price (MSRP) --- mapped from item.original_price
    await fillPriceField('originalPrice', item.original_price);

    // --- Listing Price --- mapped from item.price
    await fillPriceField('listingPrice', item.price);

    // --- Style Tags ---
    await fillStyleTags(item.style_tags);

    // --- Photos ---
    await handlePhotos(item.photoUrls);

    log('Form fill complete. Please review and submit.');
    showNotification('Form auto-filled! Review the details and upload photos if needed, then submit.');
  }

  /**
   * Generic field filler: finds element via FIELD_SELECTORS[fieldName] and sets its value.
   */
  async function fillField(fieldName, value, maxLength) {
    if (!value) return;
    const selectors = FIELD_SELECTORS[fieldName];
    if (!selectors) {
      log(`No selectors defined for field: ${fieldName}`);
      return;
    }
    const el = queryFirst(selectors);
    if (el) {
      const trimmed = maxLength ? String(value).substring(0, maxLength) : String(value);
      setNativeValue(el, trimmed);
      log(`${fieldName} set`);
    } else {
      log(`${fieldName} input not found`);
    }
  }

  async function fillDescription(item) {
    let desc = item.description || '';
    const extras = [];
    if (item.material) extras.push(`Material: ${item.material}`);
    if (item.measurements) extras.push(`Measurements: ${item.measurements}`);
    if (item.pattern) extras.push(`Pattern: ${item.pattern}`);
    if (item.closure) extras.push(`Closure: ${item.closure}`);
    if (item.garment_length) extras.push(`Length: ${item.garment_length}`);
    if (item.occasion) extras.push(`Occasion: ${item.occasion}`);
    if (item.season) extras.push(`Season: ${item.season}`);
    if (extras.length > 0) {
      desc += '\n\n' + extras.join('\n');
    }

    const textarea = queryFirst(FIELD_SELECTORS.description);
    if (textarea) {
      setNativeValue(textarea, desc);
      log('Description set');
    } else {
      log('Description textarea not found');
    }
  }

  async function fillCategory(item) {
    const department = detectDepartment(item);
    const category = item.category || '';

    const categoryBtn = document.querySelector('[data-testid="ListingCategory-btn"]')
      || document.querySelector('.listing-editor__category')
      || findByText('button', 'Category')
      || findByText('div[role="button"]', 'Category')
      || findByText('a', 'Category');

    if (!categoryBtn) {
      log('Category button not found — user should select manually');
      return;
    }

    click(categoryBtn);
    await sleep(800);

    const deptEl = findByText('li, div[role="option"], button, a', department);
    if (deptEl) {
      click(deptEl);
      log('Department selected:', department);
      await sleep(600);
    }

    if (category) {
      const catEl = findByText('li, div[role="option"], button, a', category);
      if (catEl) {
        click(catEl);
        log('Category selected:', category);
        await sleep(600);

        const subItems = document.querySelectorAll('li[role="option"], div[role="option"]');
        if (subItems.length > 0 && subItems.length < 30) {
          const otherEl = findByText('li, div[role="option"], button, a', 'Other');
          if (otherEl) {
            click(otherEl);
            log('Subcategory: selected "Other"');
          }
        }
      } else {
        log('Category not found in picker:', category);
      }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
  }

  async function fillSize(size) {
    if (!size) return;

    const sizeBtn = document.querySelector('[data-testid="ListingSize-btn"]')
      || findByText('button', 'Size')
      || findByText('div[role="button"]', 'Size');

    if (sizeBtn) {
      click(sizeBtn);
      await sleep(600);

      const sizeEl = findByText('li, div[role="option"], button, label, span', size);
      if (sizeEl) {
        click(sizeEl);
        log('Size selected:', size);
      } else {
        log('Size option not found:', size);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      await sleep(300);
    } else {
      const sizeInput = queryFirst(FIELD_SELECTORS.size);
      if (sizeInput) {
        setNativeValue(sizeInput, size);
        log('Size set via input');
      } else {
        log('Size selector not found');
      }
    }
  }

  async function fillBrand(brand) {
    if (!brand) return;

    const brandInput = queryFirst(FIELD_SELECTORS.brand);
    if (brandInput) {
      setNativeValue(brandInput, brand);
      await sleep(500);

      const suggestion = await waitFor(
        '.dropdown-menu li, [role="listbox"] [role="option"], .brand-search__results li',
        2000
      );
      if (suggestion) {
        click(suggestion);
        log('Brand selected from dropdown:', brand);
      } else {
        log('Brand typed (no dropdown match):', brand);
      }
    } else {
      log('Brand input not found');
    }
  }

  async function fillColor(color) {
    if (!color) return;

    const colorEl = findByText('label, button, span, div[role="option"]', color);
    if (colorEl) {
      click(colorEl);
      log('Color selected:', color);
    } else {
      const colorInput = document.querySelector('input[name="color"]')
        || document.querySelector('input[placeholder*="olor"]');
      if (colorInput) {
        setNativeValue(colorInput, color);
        log('Color set via input');
      } else {
        log('Color option not found:', color);
      }
    }
  }

  async function fillCondition(condition) {
    const mapped = mapCondition(condition);
    const conditionLabels = {
      'nwt': 'NWT',
      'nwot': 'NWOT',
      'excellent': 'Excellent',
      'good': 'Good',
      'fair': 'Fair',
      'poor': 'Poor'
    };
    const label = conditionLabels[mapped] || 'Good';
    const condEl = findByText('label, button, span, div[role="option"], div[role="radio"]', label);
    if (condEl) {
      click(condEl);
      log('Condition set:', label);
    } else {
      log('Condition option not found:', label);
    }
  }

  /**
   * Fill a price field — strips non-numeric characters before setting.
   */
  async function fillPriceField(fieldName, value) {
    if (!value) return;
    const priceStr = String(value).replace(/[^0-9.]/g, '');
    if (!priceStr) return;

    const el = queryFirst(FIELD_SELECTORS[fieldName]);
    if (el) {
      setNativeValue(el, priceStr);
      log(`${fieldName} set:`, priceStr);
    } else {
      log(`${fieldName} input not found`);
    }
  }

  async function fillStyleTags(styleTags) {
    if (!styleTags || !Array.isArray(styleTags) || styleTags.length === 0) return;

    const tags = styleTags.slice(0, 3); // Poshmark allows up to 3
    const tagInput = queryFirst(FIELD_SELECTORS.styleTags);

    if (tagInput) {
      for (const tag of tags) {
        setNativeValue(tagInput, tag);
        await sleep(300);
        tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        tagInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        await sleep(300);
      }
      log('Style tags set:', tags.join(', '));
    } else {
      log('Style tags input not found');
    }
  }

  // --- Photo Handling ---

  async function handlePhotos(photoUrls) {
    if (!photoUrls || photoUrls.length === 0) {
      log('No photos to upload');
      return;
    }

    // Cap at Poshmark's maximum
    const urls = photoUrls.slice(0, MAX_PHOTOS);
    log(`Attempting to upload ${urls.length} photo(s) (max ${MAX_PHOTOS})...`);

    const fileInput = document.querySelector('input[type="file"][accept*="image"]')
      || document.querySelector('input[type="file"]');

    if (!fileInput) {
      log('File input not found — showing photo URLs for manual upload');
      showPhotoHelper(urls);
      return;
    }

    try {
      const files = [];
      for (let i = 0; i < urls.length; i++) {
        try {
          const response = await fetch(urls[i]);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const file = new File([blob], `photo_${i + 1}.${ext}`, { type: blob.type });
          files.push(file);
          log(`Downloaded photo ${i + 1}/${urls.length}`);
        } catch (err) {
          log(`Failed to download photo ${i + 1}:`, err.message);
        }
      }

      if (files.length === 0) {
        log('No photos downloaded successfully');
        showPhotoHelper(urls);
        return;
      }

      // Inject files into the file input via DataTransfer
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      fileInput.files = dt.files;

      // Dispatch both change and input events for Vue compatibility
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      log(`Uploaded ${files.length} photo(s) via file input`);

      // Verify upload
      await sleep(1500);
      const photoThumbs = document.querySelectorAll(
        '.listing-editor__photo img, .photo-thumbnail, [data-testid*="photo"], .image-con img'
      );
      if (photoThumbs.length === 0) {
        log('Photos may not have been accepted — showing fallback');
        showPhotoHelper(urls);
      }
    } catch (err) {
      log('Photo upload failed:', err.message);
      showPhotoHelper(urls);
    }
  }

  // Fallback: show photo URLs so user can download/drag them manually
  function showPhotoHelper(photoUrls) {
    const existing = document.getElementById('stbf-photo-helper');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'stbf-photo-helper';
    container.style.cssText = `
      position: fixed; bottom: 80px; right: 20px; z-index: 99999;
      background: white; border: 2px solid #7b2d8e; border-radius: 8px;
      padding: 16px; max-width: 320px; max-height: 400px; overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2); font-family: sans-serif;
    `;
    container.innerHTML = `
      <div style="font-weight:600; margin-bottom:8px; color:#7b2d8e;">
        Photos to Upload
      </div>
      <p style="font-size:12px; color:#666; margin-bottom:8px;">
        Drag these images into the photo upload area, or right-click and Save to upload manually.
      </p>
      <div id="stbf-photo-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:6px;"></div>
      <button id="stbf-photo-close" style="
        margin-top:10px; padding:4px 12px; background:#7b2d8e; color:white;
        border:none; border-radius:4px; cursor:pointer; font-size:12px;
      ">Close</button>
    `;
    document.body.appendChild(container);

    const grid = container.querySelector('#stbf-photo-grid');
    photoUrls.forEach((url, i) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Photo ${i + 1}`;
      img.draggable = true;
      img.style.cssText = 'width:100%; border-radius:4px; cursor:grab;';
      grid.appendChild(img);
    });

    container.querySelector('#stbf-photo-close').addEventListener('click', () => {
      container.remove();
    });
  }

  // --- Notification / Error Banners ---

  function showNotification(message) {
    showBanner(message, '#7b2d8e');
  }

  function showErrorBanner(message) {
    showBanner(message, '#d32f2f');
  }

  function showBanner(message, bgColor) {
    const existing = document.getElementById('stbf-notification');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'stbf-notification';
    banner.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 100000;
      background: ${bgColor}; color: white; padding: 12px 20px;
      border-radius: 8px; font-family: sans-serif; font-size: 14px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3); max-width: 400px;
      animation: stbfSlideIn 0.3s ease-out;
    `;
    banner.textContent = message;
    document.body.appendChild(banner);

    if (!document.getElementById('stbf-anim-style')) {
      const style = document.createElement('style');
      style.id = 'stbf-anim-style';
      style.textContent = `
        @keyframes stbfSlideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => banner.remove(), 12000);
  }

  // --- Listing Completion Detection ---

  function watchForListingCompletion(itemId) {
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkForListingId(itemId);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', () => checkForListingId(itemId));

    const interval = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkForListingId(itemId);
      }
    }, 2000);

    setTimeout(() => clearInterval(interval), 30 * 60 * 1000);
  }

  function checkForListingId(itemId) {
    const match = location.pathname.match(/^\/listing\/(.+)-([0-9a-f]{24})$/i);
    if (match) {
      const poshmarkListingId = match[2];
      log('Listing complete! Poshmark ID:', poshmarkListingId);

      chrome.runtime.sendMessage({
        type: 'POSHMARK_LISTING_COMPLETE',
        itemId: itemId,
        poshmarkListingId: poshmarkListingId
      }, (response) => {
        if (response && response.success) {
          showNotification('Listing synced back to STBF!');
          log('Successfully marked as listed');
        } else {
          log('Failed to sync back:', response?.error);
          showNotification('Listed on Poshmark but failed to sync to STBF. Check the extension popup.');
        }
      });
    }
  }

  // --- Entry Point ---

  async function init() {
    const data = await chrome.storage.local.get(['poshmark_pending_item', 'poshmark_pending_item_id']);
    const item = data.poshmark_pending_item;
    const itemId = data.poshmark_pending_item_id;

    if (!item) {
      log('No pending item data found');
      return;
    }

    log('Found pending item:', item.title);

    // Start watching for listing completion
    watchForListingCompletion(itemId);

    // Wait for the form to appear using all known selectors
    const formReady = await waitForAny(FORM_DETECTION_SELECTORS, 10000);

    if (!formReady) {
      log('Listing form not found after waiting.');
      showErrorBanner(
        'STBF: Could not detect the Poshmark listing form. ' +
        'Please navigate to the "Create Listing" page (poshmark.com/create-listing) and try again.'
      );
      return;
    }

    log('Form detected, filling...');
    await fillListingForm(item);
  }

  // Run when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

  log('Content script loaded on Poshmark');
})();
