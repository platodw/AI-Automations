// Content script for Poshmark create-listing page
// Auto-fills listing form with item data from STBF

(function () {
  'use strict';

  const LOG_PREFIX = '[STBF→Poshmark]';

  // --- Utilities ---

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Set a value on an input/textarea and dispatch events so React picks it up
  function setNativeValue(el, value) {
    if (!el || !value) return false;
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // Click an element
  function click(el) {
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }

  // Wait for an element matching a selector to appear
  async function waitFor(selector, timeout = 5000, root = document) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = root.querySelector(selector);
      if (el) return el;
      await sleep(200);
    }
    return null;
  }

  // Find an element by its visible text content
  function findByText(selector, text, parent = document) {
    const els = parent.querySelectorAll(selector);
    const lowerText = text.toLowerCase().trim();
    for (const el of els) {
      if (el.textContent.trim().toLowerCase() === lowerText) return el;
    }
    // Partial match fallback
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

  // --- Poshmark Category Mapping ---
  // Poshmark uses a tree: Department → Category → Subcategory
  // We do best-effort matching based on the item's category/department fields

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
    return 'women'; // default
  }

  // --- Main Form Filler ---

  async function fillListingForm(item) {
    log('Starting form fill for:', item.title);

    // Wait for the page to load
    await sleep(2000);

    // --- Title ---
    await fillTitle(item.title);

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

    // --- Original Price (MSRP) ---
    await fillOriginalPrice(item.original_price);

    // --- Listing Price ---
    await fillListingPrice(item.price);

    // --- Style Tags ---
    await fillStyleTags(item.style_tags);

    // --- Photos ---
    await handlePhotos(item.photoUrls);

    log('Form fill complete. Please review and submit.');
    showNotification('Form auto-filled! Review the details and upload photos if needed, then submit.');
  }

  async function fillTitle(title) {
    if (!title) return;
    const input = document.querySelector('input[data-testid="TextInput-listingTitle"]')
      || document.querySelector('#listing-title input')
      || document.querySelector('input[placeholder*="itle"]')
      || document.querySelector('input[name="title"]');
    if (input) {
      setNativeValue(input, title.substring(0, 80)); // Poshmark 80 char limit
      log('Title set');
    } else {
      log('Title input not found');
    }
  }

  async function fillDescription(item) {
    let desc = item.description || '';
    // Append extra details
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

    const textarea = document.querySelector('textarea[data-testid="TextInput-listingDescription"]')
      || document.querySelector('#listing-description textarea')
      || document.querySelector('textarea[placeholder*="escri"]')
      || document.querySelector('textarea[name="description"]');
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

    // Click the category selector to open the picker
    const categoryBtn = document.querySelector('[data-testid="ListingCategory-btn"]')
      || document.querySelector('.listing-editor__category')
      || findByText('button', 'Category')
      || findByText('div[role="button"]', 'Category')
      || findByText('a', 'Category');

    if (!categoryBtn) {
      log('Category button not found - user should select manually');
      return;
    }

    click(categoryBtn);
    await sleep(800);

    // Step 1: Select department
    const deptEl = findByText('li, div[role="option"], button, a', department);
    if (deptEl) {
      click(deptEl);
      log('Department selected:', department);
      await sleep(600);
    }

    // Step 2: Try to select the category
    if (category) {
      // Try direct match first
      const catEl = findByText('li, div[role="option"], button, a', category);
      if (catEl) {
        click(catEl);
        log('Category selected:', category);
        await sleep(600);

        // Step 3: If there's a subcategory level, try to pick something reasonable
        // Just look for any selectable item and skip if it's too ambiguous
        const subItems = document.querySelectorAll('li[role="option"], div[role="option"]');
        if (subItems.length > 0 && subItems.length < 30) {
          // Try to find "Other" as a safe default subcategory
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

    // Close picker if still open (press Escape)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
  }

  async function fillSize(size) {
    if (!size) return;

    // Poshmark size selector — look for buttons/options with size text
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
        // Close the picker
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      await sleep(300);
    } else {
      // Try direct input field
      const sizeInput = document.querySelector('input[name="size"]')
        || document.querySelector('input[placeholder*="ize"]');
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

    const brandInput = document.querySelector('input[data-testid="TextInput-listingBrand"]')
      || document.querySelector('#listing-brand input')
      || document.querySelector('input[placeholder*="rand"]')
      || document.querySelector('input[name="brand"]');

    if (brandInput) {
      setNativeValue(brandInput, brand);
      await sleep(500);

      // Poshmark shows a dropdown of brand suggestions — try to click the first match
      const suggestion = await waitFor('.dropdown-menu li, [role="listbox"] [role="option"], .brand-search__results li', 2000);
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

    // Poshmark uses color chips/buttons
    const colorEl = findByText('label, button, span, div[role="option"]', color);
    if (colorEl) {
      click(colorEl);
      log('Color selected:', color);
    } else {
      // Try color input
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

    // Condition labels on Poshmark
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

  async function fillOriginalPrice(originalPrice) {
    if (!originalPrice) return;
    const priceStr = String(originalPrice).replace(/[^0-9.]/g, '');
    if (!priceStr) return;

    const input = document.querySelector('input[data-testid="TextInput-originalPrice"]')
      || document.querySelector('input[name="originalPrice"]')
      || document.querySelector('input[placeholder*="riginal"]')
      || document.querySelector('input[placeholder*="MSRP"]');
    if (input) {
      setNativeValue(input, priceStr);
      log('Original price set:', priceStr);
    } else {
      log('Original price input not found');
    }
  }

  async function fillListingPrice(price) {
    if (!price) return;
    const priceStr = String(price).replace(/[^0-9.]/g, '');
    if (!priceStr) return;

    const input = document.querySelector('input[data-testid="TextInput-listingPrice"]')
      || document.querySelector('input[name="listingPrice"]')
      || document.querySelector('input[placeholder*="isting"]')
      || document.querySelector('input[placeholder*="rice"]');
    if (input) {
      setNativeValue(input, priceStr);
      log('Listing price set:', priceStr);
    } else {
      log('Listing price input not found');
    }
  }

  async function fillStyleTags(styleTags) {
    if (!styleTags || !Array.isArray(styleTags) || styleTags.length === 0) return;

    const tags = styleTags.slice(0, 3); // Poshmark allows up to 3

    const tagInput = document.querySelector('input[data-testid="TextInput-styleTags"]')
      || document.querySelector('input[placeholder*="tyle"]')
      || document.querySelector('input[name="styleTags"]');

    if (tagInput) {
      for (const tag of tags) {
        setNativeValue(tagInput, tag);
        await sleep(300);
        // Press Enter to confirm the tag
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

    log(`Attempting to upload ${photoUrls.length} photos...`);

    // Find the file input on Poshmark's form
    const fileInput = document.querySelector('input[type="file"][accept*="image"]')
      || document.querySelector('input[type="file"]');

    if (!fileInput) {
      log('File input not found — showing photo URLs for manual upload');
      showPhotoHelper(photoUrls);
      return;
    }

    try {
      // Download photos as blobs and create File objects
      const files = [];
      for (let i = 0; i < photoUrls.length; i++) {
        try {
          const response = await fetch(photoUrls[i]);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const file = new File([blob], `photo_${i + 1}.${ext}`, { type: blob.type });
          files.push(file);
          log(`Downloaded photo ${i + 1}/${photoUrls.length}`);
        } catch (err) {
          log(`Failed to download photo ${i + 1}:`, err.message);
        }
      }

      if (files.length === 0) {
        log('No photos downloaded successfully');
        showPhotoHelper(photoUrls);
        return;
      }

      // Create a DataTransfer to set the files on the input
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      log(`Uploaded ${files.length} photos via file input`);

      // Verify upload took effect
      await sleep(1000);
      // If Poshmark didn't pick them up, show fallback
      const photoThumbs = document.querySelectorAll('.listing-editor__photo img, .photo-thumbnail, [data-testid*="photo"]');
      if (photoThumbs.length === 0) {
        log('Photos may not have been accepted — showing fallback');
        showPhotoHelper(photoUrls);
      }
    } catch (err) {
      log('Photo upload failed:', err.message);
      showPhotoHelper(photoUrls);
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
        📷 Photos to Upload
      </div>
      <p style="font-size:12px; color:#666; margin-bottom:8px;">
        Drag these images into the photo upload area, or right-click → Save and upload manually.
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

  // --- Notification Banner ---

  function showNotification(message) {
    const existing = document.getElementById('stbf-notification');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'stbf-notification';
    banner.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 100000;
      background: #7b2d8e; color: white; padding: 12px 20px;
      border-radius: 8px; font-family: sans-serif; font-size: 14px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3); max-width: 350px;
      animation: slideIn 0.3s ease-out;
    `;
    banner.textContent = message;
    document.body.appendChild(banner);

    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    setTimeout(() => banner.remove(), 10000);
  }

  // --- Listing Completion Detection ---

  function watchForListingCompletion(itemId) {
    // After the user submits, Poshmark redirects to /listing/<id>
    // Watch for URL changes
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkForListingId(itemId);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also check on popstate / navigation
    window.addEventListener('popstate', () => checkForListingId(itemId));

    // Periodically check URL as fallback
    const interval = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkForListingId(itemId);
      }
      // Stop checking after 30 minutes
    }, 2000);

    setTimeout(() => clearInterval(interval), 30 * 60 * 1000);
  }

  function checkForListingId(itemId) {
    // Poshmark listing URLs look like: /listing/<title-slug>-<hexId>
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
    // Check for pending item data
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

    // Wait for the form to be ready
    const formReady = await waitFor(
      'input[data-testid="TextInput-listingTitle"], #listing-title input, input[name="title"], input[placeholder*="itle"]',
      10000
    );

    if (!formReady) {
      log('Listing form not found after waiting. User may need to navigate to create-listing page.');
      showNotification('STBF item loaded but form not detected. Make sure you are on the create listing page.');
      return;
    }

    // Fill the form
    await fillListingForm(item);
  }

  // Run when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let Poshmark's SPA render
    setTimeout(init, 1500);
  }

  log('Content script loaded on Poshmark');
})();
