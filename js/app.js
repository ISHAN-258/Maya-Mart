/* =============================================
   MAYA MART – app.js  v6
   Changes: localStorage cache (30min TTL),
   fetch timeout (8s), auto-retry (2x),
   progressive render, batch 3→5 delay 300→200ms,
   partial DOM refresh (no replaceWith),
   sale price bug fix, better WA message,
   search suggestions, out-of-stock filter,
   share product, order history, deep link (?product=ID),
   card entrance animation, heart bounce,
   toast slide-up, cart badge bump
   ============================================= */

'use strict';

const CONFIG = {
  SHEET_ID:    '1dDM4IZnsjaXXnk3ODuFdzXYPmem-_zcIBC_4JwF6ZzQ',
  WA_NUMBER:   '919278224984',
  PAGE_SIZE:   40,
  DEBOUNCE_MS: 320,
  RECENT_MAX:  10,
  STORE_NAME:  'Maya Mart',
  BATCH_SIZE:  5,
  CACHE_KEY:   'mm_products_v6',
  CACHE_TTL:   30 * 60 * 1000,

  PRODUCT_SHEETS: [
    'pkt SPICES','FITNESS','SPICES','GRAIN LEGUMES',
    'EDIBLE OIL','DRY FRUITS','PKT','DEEP FREZZER',
    'SNACKS','COOKIES','PASTA MAKING PRODUCTS',
    'TEA','DETERGENT','EXTRA','COSMETICS',
    'BABY PRODUCTS','CLEANER','HAIR','SOAP','TOOTH PASTE'
  ],

  SHEET_CATEGORY: {
    'pkt SPICES':           'SPICES',
    'SPICES':               'SPICES',
    'FITNESS':              'FITNESS',
    'GRAIN LEGUMES':        'GRAINS & PULSES',
    'EDIBLE OIL':           'OILS & GHEE',
    'DRY FRUITS':           'DRY FRUITS',
    'PKT':                  'STAPLES',
    'DEEP FREZZER':         'FROZEN',
    'SNACKS':               'SNACKS',
    'COOKIES':              'BISCUITS & COOKIES',
    'PASTA MAKING PRODUCTS':'NOODLES & SAUCES',
    'TEA':                  'TEA & COFFEE',
    'DETERGENT':            'DETERGENT',
    'EXTRA':                'GENERAL',
    'COSMETICS':            'COSMETICS',
    'BABY PRODUCTS':        'BABY CARE',
    'CLEANER':              'CLEANERS',
    'HAIR':                 'HAIR CARE',
    'SOAP':                 'SOAPS',
    'TOOTH PASTE':          'ORAL CARE',
  }
};

const CAT_ICONS = {
  'SPICES':              ['🌶️','🧂','🫚','🌿','🍛','🫙','🌰','🍵'],
  'GRAINS & PULSES':     ['🫘','🌾','🍚','🌽','🟤','🫓','🥙','🌯'],
  'OILS & GHEE':         ['🫙','🧈','🍶','💧','🫗','🥛','🏺','🧴'],
  'DRY FRUITS':          ['🥜','🍇','🌰','🍑','🫐','🍒','🥝','🍈'],
  'STAPLES':             ['🌾','🍞','🧁','🥐','🫓','🍚','🥣','🌽'],
  'FROZEN':              ['❄️','🧊','🍦','🫙','🥶','🍧','🌨️','🎐'],
  'SNACKS':              ['🍿','🥨','🍪','🧆','🥐','🍘','🫔','🥙'],
  'BISCUITS & COOKIES':  ['🍪','🧁','🍩','🎂','🍰','🥧','🍮','🍡'],
  'NOODLES & SAUCES':    ['🍜','🍝','🥫','🍲','🫕','🍛','🥘','🍱'],
  'TEA & COFFEE':        ['🍵','☕','🫖','🧋','🍃','🌿','🫗','🥤'],
  'DETERGENT':           ['🧽','🧴','🫧','🪣','🧹','🫙','🪥','🧼'],
  'GENERAL':             ['🛒','🏪','🛍️','📦','🎁','🏬','🧺','🪣'],
  'COSMETICS':           ['💄','💅','🪞','✨','💋','🧴','👄','💫'],
  'BABY CARE':           ['👶','🍼','🧸','🎀','🛁','🌸','💝','🧷'],
  'CLEANERS':            ['🧹','🫧','🪣','🧽','🧴','🪥','🧼','✨'],
  'HAIR CARE':           ['💇','🪮','✨','🌸','💆','🧴','🫧','🌿'],
  'SOAPS':               ['🧼','🫧','🌸','💧','✨','🪷','🛁','🌿'],
  'ORAL CARE':           ['🪥','✨','💧','😁','🌿','🦷','💊','🌊'],
  'FITNESS':             ['💪','🏋️','🥗','🧃','⚡','🏃','🥤','💊'],
  'DEFAULT':             ['🛒','📦','🏪','🛍️','🎁','🏬','🧺','🪣'],
};

// Pick icon from pool using product id + title hash — better spread for sequential IDs
function getIconForProduct(category, productId, productTitle) {
  const pool = CAT_ICONS[category] || CAT_ICONS['DEFAULT'];
  const str = String(productId) + String(productTitle || '');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash & 0x7fffffff;
  }
  return pool[hash % pool.length];
}

// ============================================================
// STATE
// ============================================================
let allProducts    = [];
let filteredProds  = [];
let displayedCount = 0;
let cart           = JSON.parse(localStorage.getItem('mm_cart')    || '[]');
let wishlist       = JSON.parse(localStorage.getItem('mm_wishlist')|| '[]');
let recentlyViewed = JSON.parse(localStorage.getItem('mm_recent')  || '[]');
let activeCategory = 'ALL';
let activeFilter   = 'all';
let activeSort     = 'default';
let searchQuery    = '';
let isDark         = localStorage.getItem('mm_dark') === 'true';

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  applyDarkMode();
  bindUI();
  initProducts();
  renderCartBadge();
  renderWishlistBadge();
  renderRecentlyViewed();
  injectMobileCartBar();
  injectToast();
  handleDeepLink();
});

// ============================================================
// DEEP LINK  (?product=ID opens quickview directly)
// ============================================================
function handleDeepLink() {
  const pid = new URLSearchParams(location.search).get('product');
  if (!pid) return;
  history.replaceState({}, '', location.pathname);
  const tryOpen = (attempts) => {
    const p = allProducts.find(x => x.id === pid);
    if (p) { openQuickView(p); return; }
    if (attempts > 0) setTimeout(() => tryOpen(attempts - 1), 500);
  };
  tryOpen(10);
}

// ============================================================
// TOAST  (slide-up animation)
// ============================================================
function injectToast() {
  if (document.getElementById('mmToast')) return;
  const t = document.createElement('div');
  t.id = 'mmToast';
  t.className = 'mm-toast';
  document.body.appendChild(t);
}

function showToast(msg) {
  const t = document.getElementById('mmToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('show', 'hide');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.replace('show', 'hide');
  }, 2000);
}

// ============================================================
// STICKY MOBILE CART BAR
// ============================================================
function injectMobileCartBar() {
  if (document.getElementById('mobileCartBar')) return;
  const bar = document.createElement('div');
  bar.className = 'mobile-cart-bar';
  bar.id = 'mobileCartBar';
  bar.innerHTML = `
    <button class="btn btn-primary" id="mobileCartBtn" style="flex:1;justify-content:center;gap:8px;">
      <i class="fa-solid fa-cart-shopping"></i>
      Cart <span class="mobile-cart-bar-count" id="mobileCartCount">0</span>
    </button>
    <button class="btn btn-outline" id="mobileWishBtn" style="flex:1;justify-content:center;gap:8px;">
      <i class="fa-regular fa-heart"></i>
      Wishlist <span class="mobile-cart-bar-count" id="mobileWishCount" style="background:var(--red)">0</span>
    </button>`;
  document.body.appendChild(bar);

  document.getElementById('mobileCartBtn').addEventListener('click', () => {
    renderCartPanel();
    document.getElementById('cartOverlay').classList.remove('hidden');
  });
  document.getElementById('mobileWishBtn').addEventListener('click', () => {
    renderWishPanel();
    document.getElementById('wishlistOverlay').classList.remove('hidden');
  });
}

function updateMobileBar() {
  const cartTotal = cart.reduce((s, i) => s + i.qty, 0);
  const mc = document.getElementById('mobileCartCount');
  const mw = document.getElementById('mobileWishCount');
  if (mc) mc.textContent = cartTotal;
  if (mw) mw.textContent = wishlist.length;
}

// ============================================================
// DATA FETCHING  (cache + retry + timeout + progressive render)
// ============================================================
async function initProducts() {
  showLoading(true);
  showError(false);
  try {
    // --- Try localStorage cache first ---
    try {
      const raw = localStorage.getItem(CONFIG.CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.ts && (Date.now() - cached.ts) < CONFIG.CACHE_TTL && Array.isArray(cached.data) && cached.data.length) {
          allProducts = cached.data;
          buildCategoryNav();
          buildCategoryGrid();
          applyFiltersAndRender();
          showLoading(false);
          handleDeepLink();
          return;
        }
      }
    } catch(e) { /* corrupt cache — ignore, fetch fresh */ }

    // --- Fetch fresh ---
    const allRows = await fetchAllSheetsBatched();
    allProducts = allRows;
    if (!allProducts.length) throw new Error('No products loaded');

    // Save to cache
    try {
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ ts: Date.now(), data: allProducts }));
    } catch(e) { /* storage full — skip cache */ }

    buildCategoryNav();
    buildCategoryGrid();
    applyFiltersAndRender();
    showLoading(false);
    handleDeepLink();
  } catch(e) {
    console.error('Load failed:', e);
    showLoading(false);
    showError(true);
  }
}

async function fetchAllSheetsBatched() {
  const sheets = CONFIG.PRODUCT_SHEETS;
  const products = [];
  let firstBatchDone = false;

  for (let i = 0; i < sheets.length; i += CONFIG.BATCH_SIZE) {
    const batch = sheets.slice(i, i + CONFIG.BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(s => fetchSheet(s)));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') products.push(...r.value);
      else console.warn(`Sheet "${batch[j]}" failed:`, r.reason);
    });

    // Progressive render — show first batch immediately
    if (!firstBatchDone && products.length) {
      firstBatchDone = true;
      allProducts = [...products];
      buildCategoryNav();
      buildCategoryGrid();
      applyFiltersAndRender();
      showLoading(false);
    }

    if (i + CONFIG.BATCH_SIZE < sheets.length)
      await new Promise(res => setTimeout(res, 200));
  }

  // Final update with all products
  if (products.length !== allProducts.length) {
    allProducts = products;
    buildCategoryNav();
    buildCategoryGrid();
    applyFiltersAndRender();
  }

  return products;
}

// fetchSheet with timeout (8s) + auto-retry (2x)
async function fetchSheet(sheetName, retries = 2) {
  const encoded = encodeURIComponent(sheetName);
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encoded}&nocache=${Date.now()}`;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const jsonStr = text.replace(/^[^\(]*\(/, '').replace(/\);\s*$/, '');
    const data = JSON.parse(jsonStr);
    if (!data.table || !data.table.rows) return [];
    return parseSheet(data.table, sheetName);
  } catch(e) {
    clearTimeout(tid);
    if (retries > 0) {
      await new Promise(res => setTimeout(res, 1000));
      return fetchSheet(sheetName, retries - 1);
    }
    throw e;
  }
}

// ============================================================
// PARSING
// ============================================================
function parseSheet(table, sheetName) {
  const category = CONFIG.SHEET_CATEGORY[sheetName] || 'GENERAL';
  const colMap = {};
  table.cols.forEach((col, i) => {
    const label = (col.label || '').toLowerCase().trim()
      .replace(/[\s\-\.]+/g, '_').replace(/[^a-z0-9_]/g, '');
    colMap[label] = i;
    if (label === 'item_name') colMap['title'] = i;
    if (label === 'name')      colMap['title'] = i;
    if (label === 'mrp' || label === 'mro') colMap['price'] = i;
    if (label === 'image_url') colMap['image_link'] = i;
  });

  const get = (row, key) => {
    const idx = colMap[key];
    if (idx === undefined || !row.c[idx]) return '';
    const v = row.c[idx].v;
    return v !== null && v !== undefined ? String(v).trim() : '';
  };

  const products = [];
  table.rows.forEach(row => {
    if (!row.c || row.c.every(c => !c || !c.v)) return;
    const id    = get(row, 'id');
    const title = get(row, 'title') || get(row, 'item_name');
    if (!id || !title) return;
    if (title.toLowerCase() === 'title' || title.toLowerCase() === 'item name') return;

    const rawImage = get(row, 'image_link') || get(row, 'image_url') || '';
    const image = rawImage.startsWith('http')
      ? rawImage
      : getCatFallbackSvg(category, id, title);

    const rawPrice     = get(row, 'price') || get(row, 'mrp') || get(row, 'mro') || get(row, 'rate') || '';
    const rawSalePrice = get(row, 'sale_price') || get(row, 'sale') || '';
    const price        = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;
    const salePrice    = rawSalePrice ? (parseFloat(rawSalePrice.replace(/[^0-9.]/g, '')) || 0) : 0;
    const availRaw     = (get(row, 'availability') || 'IN STOCK').toUpperCase();
    const available    = availRaw.includes('IN') && !availRaw.includes('OUT');

    const showCol = colMap['show_on_website'];
    if (showCol !== undefined) {
      const showVal = get(row, 'show_on_website').toUpperCase();
      if (showVal === 'FALSE' || showVal === 'NO') return;
    }

    const barcode = get(row, 'barcode') || get(row, 'ean') || '';
    const desc    = get(row, 'description') || '';
    const displayPrice = salePrice > 0 ? Math.min(price, salePrice) : price;

    products.push({
      id: String(id), title, description: desc,
      price, sale_price: displayPrice,
      availability: available ? 'IN STOCK' : 'OUT OF STOCK',
      image, barcode, category, sheet: sheetName,
    });
  });
  return products;
}

// ============================================================
// CATEGORY BUILD
// ============================================================
function buildCategoryNav() {
  const cats = getAllCategories();
  const navInner = document.getElementById('catNav').querySelector('.cat-nav-inner');
  navInner.innerHTML = '';
  navInner.appendChild(makePill('ALL', '🛒 All'));
  cats.forEach(cat => navInner.appendChild(makePill(cat, `${getCatIcon(cat)} ${titleCase(cat)}`)));
}

function buildCategoryGrid() {
  const cats = getAllCategories().slice(0, 20);
  const grid = document.getElementById('catGrid');
  grid.innerHTML = cats.map(cat => {
    const count = allProducts.filter(p => p.category === cat).length;
    return `<button class="cat-card" data-cat="${escHtml(cat)}">
      <div class="cat-card-icon">${getCatIcon(cat)}</div>
      <div class="cat-card-name">${titleCase(cat)}</div>
      <div class="cat-card-count">${count} items</div>
    </button>`;
  }).join('');
  grid.querySelectorAll('.cat-card').forEach(btn => {
    btn.addEventListener('click', () => {
      setCategory(btn.dataset.cat);
      document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function getAllCategories() {
  const counts = {};
  allProducts.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

function makePill(cat, label) {
  const btn = document.createElement('button');
  btn.className = 'cat-pill' + (cat === activeCategory ? ' active' : '');
  btn.dataset.cat = cat;
  btn.textContent = label;
  btn.addEventListener('click', () => setCategory(cat));
  return btn;
}

function setCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.cat === cat));
  document.querySelectorAll('.cat-card').forEach(c =>
    c.classList.toggle('active', c.dataset.cat === cat));
  updateTitle();
  applyFiltersAndRender();
}

function getCatIcon(cat) {
  const pool = CAT_ICONS[cat] || CAT_ICONS['DEFAULT'];
  return pool[0]; // first icon for nav/category grid
}

// Returns SVG with product-specific icon from category pool
function getCatFallbackSvg(category, productId, productTitle) {
  const icon = productId ? getIconForProduct(category, productId, productTitle) : getCatIcon(category);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>
    <rect width='200' height='200' fill='%23fff0f0' rx='16'/>
    <text x='100' y='115' font-size='72' text-anchor='middle' dominant-baseline='middle'>${icon}</text>
  </svg>`;
  return `data:image/svg+xml,${svg.replace(/\n\s*/g, ' ')}`;
}

// ============================================================
// FILTER / SORT / SEARCH
// ============================================================
function applyFiltersAndRender() {
  let prods = [...allProducts];

  if (activeCategory !== 'ALL')
    prods = prods.filter(p => p.category === activeCategory);

  if (activeFilter === 'instock')
    prods = prods.filter(p => p.availability === 'IN STOCK');
  else if (activeFilter === 'outofstock')
    prods = prods.filter(p => p.availability !== 'IN STOCK');
  else if (activeFilter === 'sale')
    prods = prods.filter(p => p.sale_price > 0 && p.price > 0 && p.sale_price < p.price);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    prods = prods.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  if (activeSort === 'price-low')  prods.sort((a, b) => a.sale_price - b.sale_price);
  if (activeSort === 'price-high') prods.sort((a, b) => b.sale_price - a.sale_price);
  if (activeSort === 'alpha-az')   prods.sort((a, b) => a.title.localeCompare(b.title));
  if (activeSort === 'alpha-za')   prods.sort((a, b) => b.title.localeCompare(a.title));

  filteredProds  = prods;
  displayedCount = 0;

  const grid = document.getElementById('productGrid');
  grid.innerHTML = '';

  updateSearchCount(prods.length);

  if (!prods.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style="margin:0 auto 16px;display:block;opacity:.35">
        <rect x="8" y="16" width="48" height="36" rx="6" stroke="currentColor" stroke-width="2.5" fill="none"/>
        <path d="M22 16v-4a10 10 0 0 1 20 0v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <circle cx="32" cy="34" r="5" stroke="currentColor" stroke-width="2.5" fill="none"/>
        <path d="M32 39v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <div style="font-size:1rem;font-weight:700;margin-bottom:6px">No products found</div>
      <div style="font-size:.85rem">Try a different search or filter</div>
    </div>`;
    document.getElementById('loadMoreWrap').classList.add('hidden');
    updateSubtitle(0);
    return;
  }

  renderNextPage();
  updateSubtitle(prods.length);
}

function updateSearchCount(count) {
  const el = document.getElementById('searchResultCount');
  if (!el) return;
  if (!searchQuery) { el.textContent = ''; return; }
  el.textContent = count === 0
    ? `No results for "${searchQuery}"`
    : `${count} result${count === 1 ? '' : 's'} for "${searchQuery}"`;
}

function renderNextPage() {
  const slice = filteredProds.slice(displayedCount, displayedCount + CONFIG.PAGE_SIZE);
  const grid  = document.getElementById('productGrid');
  const frag  = document.createDocumentFragment();
  slice.forEach((p, i) => {
    const card = createProductCard(p);
    card.style.animationDelay = `${(i % CONFIG.PAGE_SIZE) * 12}ms`;
    frag.appendChild(card);
  });
  grid.appendChild(frag);
  displayedCount += slice.length;
  document.getElementById('loadMoreWrap')
    .classList.toggle('hidden', displayedCount >= filteredProds.length);
}

// ============================================================
// SEARCH SUGGESTIONS
// ============================================================
function showSuggestions(q) {
  let box = document.getElementById('searchSuggestions');
  if (!box) {
    box = document.createElement('div');
    box.id = 'searchSuggestions';
    box.className = 'suggestion-box';
    const wrap = document.querySelector('.search-wrap');
    if (wrap) wrap.appendChild(box);
  }
  if (!q || q.length < 2) { box.innerHTML = ''; box.style.display = 'none'; return; }
  const matches = allProducts
    .filter(p => p.title.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 5);
  if (!matches.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.innerHTML = matches.map(p =>
    `<div class="suggestion-item" data-id="${escHtml(p.id)}">
       <span style="font-size:.85rem;font-weight:700">${escHtml(p.title)}</span>
       <span style="font-size:.78rem;color:var(--text-muted);margin-left:6px">${p.sale_price > 0 ? '₹'+p.sale_price : ''}</span>
     </div>`
  ).join('');
  box.style.display = 'block';
  box.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      const p = allProducts.find(x => x.id === item.dataset.id);
      if (p) openQuickView(p);
      box.style.display = 'none';
    });
  });
}

function hideSuggestions() {
  const box = document.getElementById('searchSuggestions');
  if (box) box.style.display = 'none';
}

// ============================================================
// SKELETON LOADING
// ============================================================
function showSkeletons() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = Array(8).fill(0).map(() => `
    <div class="product-card skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="product-card-body">
        <div class="skeleton skeleton-line" style="width:80%;height:14px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-line" style="width:50%;height:12px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-line" style="width:35%;height:18px"></div>
      </div>
      <div class="product-card-footer">
        <div class="skeleton skeleton-line" style="width:100%;height:34px;border-radius:6px"></div>
      </div>
    </div>`).join('');
}

// ============================================================
// PRODUCT CARD
// ============================================================
function createProductCard(p) {
  const inCart  = getCartQty(p.id);
  const inWish  = wishlist.some(w => w.id === p.id);
  const inStock = p.availability === 'IN STOCK';
  // FIXED: sale check — both prices must be positive
  const hasSale = p.sale_price > 0 && p.price > 0 && p.sale_price < p.price;

  const card = document.createElement('div');
  card.className = 'product-card';
  card.setAttribute('data-id', p.id);

  card.innerHTML = `
    <div class="product-card-img-wrap">
      <img class="product-card-img"
           data-src="${escHtml(p.image)}"
           data-cat="${escHtml(p.category)}"
           data-pid="${escHtml(p.id)}"
           data-ptitle="${escHtml(p.title)}"
           src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"
           alt="${escHtml(p.title)}" loading="lazy" />
      ${!inStock
        ? '<span class="product-card-badge product-card-badge--oos">Out of Stock</span>'
        : hasSale ? '<span class="product-card-badge product-card-badge--sale">Sale</span>' : ''}
      <button class="product-card-wish${inWish ? ' wished' : ''}" aria-label="Wishlist">
        <i class="fa-${inWish ? 'solid' : 'regular'} fa-heart"></i>
      </button>
    </div>
    <div class="product-card-body">
      <div class="product-card-name">${escHtml(p.title)}</div>
      <div class="product-card-meta">
        ${p.id      ? `<span>ID: ${escHtml(p.id)}</span>` : ''}
        ${p.barcode ? `<span>${escHtml(p.barcode)}</span>` : ''}
        <span>${titleCase(p.category)}</span>
      </div>
      <div class="product-card-price">
        ${p.sale_price > 0
          ? `₹${p.sale_price}`
          : '<span style="color:var(--text-muted);font-size:.85rem">Price on request</span>'}
        ${hasSale ? `<span class="original">₹${p.price}</span>` : ''}
      </div>
      <div class="product-card-avail ${inStock ? 'in-stock' : 'out-stock'}">
        ${inStock ? '● In Stock' : '● Out of Stock'}
      </div>
    </div>
    <div class="product-card-footer" data-footer="${escHtml(p.id)}">
      ${inCart > 0
        ? qtyStepperHTML(p.id, inCart)
        : `<button class="btn-add" ${!inStock ? 'disabled' : ''}>
             <i class="fa-solid fa-cart-plus"></i> Add to Cart
           </button>`}
      <button class="btn-qv"><i class="fa-solid fa-eye"></i> Quick View</button>
    </div>`;

  lazyLoad(card.querySelector('.product-card-img'));

  card.querySelector('.product-card-wish').addEventListener('click', e => {
    e.stopPropagation();
    toggleWishlist(p);
    // Heart bounce — toggle class
    const btn = e.currentTarget;
    btn.classList.remove('heart-bounce');
    void btn.offsetWidth;
    btn.classList.add('heart-bounce');
    refreshCardFooter(p.id);
    // Update wish icon without full rebuild
    const icon = btn.querySelector('i');
    const nowWished = wishlist.some(w => w.id === p.id);
    icon.className = `fa-${nowWished ? 'solid' : 'regular'} fa-heart`;
    btn.classList.toggle('wished', nowWished);
  });

  card.querySelector('.btn-qv').addEventListener('click', () => openQuickView(p));

  const addBtn = card.querySelector('.btn-add');
  if (addBtn) addBtn.addEventListener('click', () => {
    addToCart(p);
    refreshCardFooter(p.id);
    showToast(`✓ ${p.title} added to cart`);
  });

  bindStepperEvents(card, p);
  return card;
}

function qtyStepperHTML(id, qty) {
  return `<div class="qty-stepper">
    <button class="stepper-minus" aria-label="Decrease">−</button>
    <span class="qty-val">${qty}</span>
    <button class="stepper-plus" aria-label="Increase">+</button>
  </div>`;
}

function addBtnHTML(p) {
  const inStock = p.availability === 'IN STOCK';
  return `<button class="btn-add" ${!inStock ? 'disabled' : ''}>
    <i class="fa-solid fa-cart-plus"></i> Add to Cart
  </button>`;
}

function bindStepperEvents(card, p) {
  const minus = card.querySelector('.stepper-minus');
  const plus  = card.querySelector('.stepper-plus');
  if (minus) minus.addEventListener('click', () => { changeCartQty(p.id, -1); refreshCardFooter(p.id); });
  if (plus)  plus.addEventListener('click',  () => { changeCartQty(p.id,  1); refreshCardFooter(p.id); });
}

// FIXED: Update only footer — no replaceWith, IntersectionObserver stays intact
function refreshCardFooter(id) {
  const card = document.querySelector(`.product-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const footer = card.querySelector(`[data-footer="${CSS.escape(id)}"]`);
  if (!footer) return;
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const qty = getCartQty(id);
  const qvBtn = '<button class="btn-qv"><i class="fa-solid fa-eye"></i> Quick View</button>';
  footer.innerHTML = (qty > 0 ? qtyStepperHTML(id, qty) : addBtnHTML(p)) + qvBtn;

  const addBtn = footer.querySelector('.btn-add');
  if (addBtn) addBtn.addEventListener('click', () => {
    addToCart(p);
    refreshCardFooter(id);
    showToast(`✓ ${p.title} added to cart`);
  });
  footer.querySelector('.btn-qv').addEventListener('click', () => openQuickView(p));
  bindStepperEvents(card, p);
}

// Keep refreshCard for backward compat (quickview uses it)
function refreshCard(id) { refreshCardFooter(id); }

// ============================================================
// LAZY LOAD
// ============================================================
const imgObserver = window.IntersectionObserver
  ? new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target;
        img.src = img.dataset.src;
        img.onerror = () => { img.src = getCatFallbackSvg(img.dataset.cat||'DEFAULT', img.dataset.pid, img.dataset.ptitle); img.onerror = null; };
        obs.unobserve(img);
      });
    }, { rootMargin: '300px' })
  : null;

function lazyLoad(img) {
  if (imgObserver) imgObserver.observe(img);
  else img.src = img.dataset.src;
}

// ============================================================
// QUICK VIEW
// ============================================================
function openQuickView(p) {
  addToRecentlyViewed(p);
  const hasSale = p.sale_price > 0 && p.price > 0 && p.sale_price < p.price;
  const inStock = p.availability === 'IN STOCK';

  document.getElementById('qvContent').innerHTML = `
    <div class="qv-img-wrap">
      <img class="qv-img" src="${escHtml(p.image)}" alt="${escHtml(p.title)}" loading="lazy"
           onerror="this.src=getCatFallbackSvg('${escHtml(p.category)}');this.onerror=null" />
    </div>
    <div class="qv-info">
      <div class="qv-cat">${titleCase(p.category)}</div>
      <div class="qv-name">${escHtml(p.title)}</div>
      ${p.description ? `<div class="qv-desc">${escHtml(p.description)}</div>` : ''}
      <div class="qv-metas">
        ${p.id      ? `<span class="qv-meta-tag">ID: ${escHtml(p.id)}</span>` : ''}
        ${p.barcode ? `<span class="qv-meta-tag">📦 ${escHtml(p.barcode)}</span>` : ''}
        <span class="qv-meta-tag">${p.availability}</span>
      </div>
      <div class="qv-price">
        ${p.sale_price > 0 ? `₹${p.sale_price}` : '<span style="font-size:.9rem">Price on request</span>'}
        ${hasSale ? `<span style="font-size:.85rem;text-decoration:line-through;color:var(--text-muted);font-weight:600;margin-left:6px">₹${p.price}</span>` : ''}
      </div>
      <div class="qv-price-label">MRP (incl. all taxes)</div>
      <div class="qv-avail ${inStock ? 'in-stock' : 'out-stock'}">${inStock ? '✔ In Stock' : '✖ Out of Stock'}</div>
      <div class="qv-actions" id="qvActions">
        ${getCartQty(p.id) > 0
          ? qtyStepperHTML(p.id, getCartQty(p.id))
          : `<button class="btn btn-primary btn-full qv-add-btn" ${!inStock ? 'disabled' : ''}>
               <i class="fa-solid fa-cart-plus"></i> Add to Cart
             </button>`}
      </div>
      <button class="btn btn-outline btn-full qv-share-btn" style="margin-top:8px;">
        <i class="fa-solid fa-share-nodes"></i> Share Product
      </button>
    </div>`;

  const overlay = document.getElementById('quickViewOverlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  bindQVActions(overlay, p);

  // Share button
  overlay.querySelector('.qv-share-btn').addEventListener('click', () => shareProduct(p));
}

function bindQVActions(overlay, p) {
  const actionsDiv = overlay.querySelector('#qvActions');
  const addBtn = actionsDiv.querySelector('.qv-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addToCart(p);
      refreshCardFooter(p.id);
      showToast(`✓ ${p.title} added to cart`);
      actionsDiv.innerHTML = qtyStepperHTML(p.id, getCartQty(p.id));
      bindQVSteppers(actionsDiv, p);
    });
  }
  bindQVSteppers(actionsDiv, p);
}

function bindQVSteppers(ctx, p) {
  const minus = ctx.querySelector('.stepper-minus');
  const plus  = ctx.querySelector('.stepper-plus');
  const qvActions = document.getElementById('qvActions');

  if (minus) minus.addEventListener('click', () => {
    changeCartQty(p.id, -1);
    refreshCardFooter(p.id);
    const q = getCartQty(p.id);
    const qv = ctx.querySelector('.qty-val');
    if (qv) qv.textContent = q;
    if (q === 0 && qvActions) {
      qvActions.innerHTML = `<button class="btn btn-primary btn-full qv-add-btn">
        <i class="fa-solid fa-cart-plus"></i> Add to Cart
      </button>`;
      bindQVActions(document.getElementById('quickViewOverlay'), p);
    }
  });

  if (plus) plus.addEventListener('click', () => {
    changeCartQty(p.id, 1);
    refreshCardFooter(p.id);
    const qv = ctx.querySelector('.qty-val');
    if (qv) qv.textContent = getCartQty(p.id);
  });
}

function closeQuickView() {
  document.getElementById('quickViewOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ============================================================
// SHARE PRODUCT
// ============================================================
function shareProduct(p) {
  const url = `${location.origin}${location.pathname}?product=${encodeURIComponent(p.id)}`;
  if (navigator.share) {
    navigator.share({ title: p.title, text: `Check out ${p.title} on Maya Mart`, url })
      .catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      showToast('📋 Link copied to clipboard!');
    }).catch(() => {
      showToast('📋 Copy this link: ' + url);
    });
  }
}

// ============================================================
// CART
// ============================================================
function addToCart(p) {
  const existing = cart.find(i => i.id === p.id);
  if (existing) existing.qty += 1;
  else cart.push({ id: p.id, title: p.title, price: p.sale_price || p.price, image: p.image, qty: 1, category: p.category });
  saveCart();
  renderCartBadge();
  updateMobileBar();
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCartBadge();
  updateMobileBar();
}

function changeCartQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCartBadge();
  updateMobileBar();
}

function getCartQty(id) {
  const item = cart.find(i => i.id === id);
  return item ? item.qty : 0;
}

function saveCart() { localStorage.setItem('mm_cart', JSON.stringify(cart)); }

function renderCartBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const el = document.getElementById('cartCount');
  if (el) {
    el.textContent = total;
    el.classList.toggle('hidden', total === 0);
    // Cart badge bump animation
    el.classList.remove('cart-bump');
    void el.offsetWidth;
    el.classList.add('cart-bump');
  }
}

// ============================================================
// WISHLIST
// ============================================================
function toggleWishlist(p) {
  const idx = wishlist.findIndex(w => w.id === p.id);
  if (idx >= 0) wishlist.splice(idx, 1);
  else wishlist.push({ id: p.id, title: p.title, price: p.sale_price || p.price, image: p.image, category: p.category });
  localStorage.setItem('mm_wishlist', JSON.stringify(wishlist));
  renderWishlistBadge();
  updateMobileBar();
}

function renderWishlistBadge() {
  const el = document.getElementById('wishlistCount');
  if (el) { el.textContent = wishlist.length; el.classList.toggle('hidden', wishlist.length === 0); }
}

// ============================================================
// ORDER HISTORY
// ============================================================
function saveOrderToHistory(cartItems, total, deliveryMode, name, address) {
  try {
    const orders = JSON.parse(localStorage.getItem('mm_orders') || '[]');
    orders.unshift({
      id: Date.now(),
      date: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
      items: cartItems.map(i => ({ id: i.id, title: i.title, qty: i.qty, price: i.price })),
      total,
      type: deliveryMode,
      name,
      address: deliveryMode === 'delivery' ? address : ''
    });
    localStorage.setItem('mm_orders', JSON.stringify(orders.slice(0, 20)));
  } catch(e) { /* storage full */ }
}

// ============================================================
// RECENTLY VIEWED
// ============================================================
function addToRecentlyViewed(p) {
  recentlyViewed = recentlyViewed.filter(r => r.id !== p.id);
  recentlyViewed.unshift({ id: p.id, title: p.title, price: p.sale_price || p.price, image: p.image, category: p.category });
  if (recentlyViewed.length > CONFIG.RECENT_MAX) recentlyViewed.pop();
  localStorage.setItem('mm_recent', JSON.stringify(recentlyViewed));
  renderRecentlyViewed();
}

function renderRecentlyViewed() {
  const wrap = document.getElementById('recentSection');
  const list = document.getElementById('recentGrid');
  if (!wrap || !list) return;
  if (!recentlyViewed.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  list.innerHTML = recentlyViewed.map(r => `
    <div class="recent-card" data-id="${escHtml(r.id)}" style="
      flex-shrink:0;width:130px;background:var(--surface);border:1.5px solid var(--border);
      border-radius:12px;overflow:hidden;cursor:pointer;display:flex;
      flex-direction:column;transition:box-shadow .2s,transform .2s;">
      <div style="width:130px;height:100px;background:var(--surface2);display:flex;
                  align-items:center;justify-content:center;overflow:hidden;">
        <img src="${escHtml(r.image)}" alt="${escHtml(r.title)}"
             data-cat="${escHtml(r.category||'DEFAULT')}" data-pid="${escHtml(r.id)}"
             style="width:100%;height:100%;object-fit:contain;padding:6px;"
             onerror="this.src=getCatFallbackSvg(this.dataset.cat,this.dataset.pid);this.onerror=null" />
      </div>
      <div style="padding:8px;flex:1;display:flex;flex-direction:column;gap:3px;">
        <div style="font-size:.75rem;font-weight:700;color:var(--text);line-height:1.3;
                    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
                    overflow:hidden;">${escHtml(r.title)}</div>
        <div style="font-size:.78rem;font-weight:800;color:var(--green);">
          ${r.price > 0 ? `₹${r.price}` : '—'}
        </div>
      </div>
    </div>`).join('');
  list.querySelectorAll('.recent-card').forEach(card => {
    card.addEventListener('click', () => {
      const p = allProducts.find(x => x.id === card.dataset.id);
      if (p) openQuickView(p);
    });
  });
}

// ============================================================
// DARK MODE
// ============================================================
function applyDarkMode() {
  document.body.classList.toggle('dark-mode', isDark);
}

function toggleDarkMode() {
  isDark = !isDark;
  localStorage.setItem('mm_dark', isDark);
  applyDarkMode();
}

// ============================================================
// UI HELPERS
// ============================================================
function showLoading(show) {
  const el = document.getElementById('loadingState');
  if (el) el.classList.toggle('hidden', !show);
  if (show) showSkeletons();
}

function showError(show) {
  const el = document.getElementById('errorState');
  if (el) el.classList.toggle('hidden', !show);
}

function updateTitle() {
  const el = document.getElementById('productsTitle');
  if (!el) return;
  el.textContent = activeCategory === 'ALL'
    ? 'All Products'
    : `${getCatIcon(activeCategory)} ${titleCase(activeCategory)}`;
}

function updateSubtitle(count) {
  const el = document.getElementById('productsSubtitle');
  if (!el) return;
  el.textContent = activeCategory === 'ALL'
    ? `Showing all ${count} products`
    : `Showing ${count} products in ${titleCase(activeCategory)}`;
}

// ============================================================
// BIND UI
// ============================================================
function bindUI() {
  let debounceTimer;

  const updateClearBtn = (input) => {
    const wrap = input.closest('.search-wrap');
    const btn = wrap && wrap.querySelector('.search-clear-btn');
    if (btn) btn.style.display = input.value ? 'flex' : 'none';
  };

  const onSearchInput = (input) => {
    updateClearBtn(input);
    showSuggestions(input.value.trim());
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value.trim();
      const other = input.id === 'searchInput'
        ? document.getElementById('searchInputMobile')
        : document.getElementById('searchInput');
      if (other && other.value !== input.value) { other.value = input.value; updateClearBtn(other); }
      applyFiltersAndRender();
    }, CONFIG.DEBOUNCE_MS);
  };

  const clearSearch = () => {
    ['searchInput', 'searchInputMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; updateClearBtn(el); }
    });
    searchQuery = '';
    hideSuggestions();
    applyFiltersAndRender();
  };

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => onSearchInput(searchInput));
    searchInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
  }

  const searchInputMobile = document.getElementById('searchInputMobile');
  if (searchInputMobile) {
    searchInputMobile.addEventListener('input', () => onSearchInput(searchInputMobile));
    searchInputMobile.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
  }

  document.querySelectorAll('.search-clear-btn').forEach(btn => {
    btn.addEventListener('click', () => { clearSearch(); btn.closest('.search-wrap')?.querySelector('input')?.focus(); });
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFiltersAndRender();
    });
  });

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', () => { activeSort = sortSelect.value; applyFiltersAndRender(); });

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', renderNextPage);

  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) darkToggle.addEventListener('click', toggleDarkMode);

  // Quick view
  const qvClose = document.getElementById('qvClose');
  if (qvClose) qvClose.addEventListener('click', closeQuickView);
  const qvOverlay = document.getElementById('quickViewOverlay');
  if (qvOverlay) qvOverlay.addEventListener('click', e => { if (e.target === qvOverlay) closeQuickView(); });

  // Cart panel + tap-outside-to-close
  const cartBtn   = document.getElementById('cartBtn');
  const cartPanel = document.getElementById('cartOverlay');
  const cartClose = document.getElementById('cartClose');
  if (cartBtn)   cartBtn.addEventListener('click', () => { renderCartPanel(); cartPanel.classList.remove('hidden'); });
  if (cartClose) cartClose.addEventListener('click', () => cartPanel.classList.add('hidden'));
  if (cartPanel) cartPanel.addEventListener('click', e => { if (e.target === cartPanel) cartPanel.classList.add('hidden'); });

  // Wishlist panel + tap-outside-to-close
  const wishBtn   = document.getElementById('wishlistBtn');
  const wishPanel = document.getElementById('wishlistOverlay');
  const wishClose = document.getElementById('wishlistClose');
  if (wishBtn)   wishBtn.addEventListener('click', () => { renderWishPanel(); wishPanel.classList.remove('hidden'); });
  if (wishClose) wishClose.addEventListener('click', () => wishPanel.classList.add('hidden'));
  if (wishPanel) wishPanel.addEventListener('click', e => { if (e.target === wishPanel) wishPanel.classList.add('hidden'); });
}

// ============================================================
// CART PANEL RENDER
// ============================================================
function renderCartPanel() {
  const list   = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  if (!list) return;

  if (!cart.length) {
    list.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted)">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style="margin:0 auto 14px;display:block;opacity:.4">
        <circle cx="28" cy="28" r="26" stroke="currentColor" stroke-width="2" fill="none"/>
        <path d="M16 20h4l3 12h14l3-8H22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="25" cy="36" r="1.5" fill="currentColor"/>
        <circle cx="35" cy="36" r="1.5" fill="currentColor"/>
      </svg>
      <div style="font-weight:700;font-size:.95rem;margin-bottom:4px">Your cart is empty</div>
      <div style="font-size:.82rem">Add products to get started</div>
    </div>`;
    if (footer) footer.innerHTML = '';
    return;
  }

  list.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${escHtml(item.id)}">
      <img class="cart-item-img" src="${escHtml(item.image)}" alt="${escHtml(item.title)}"
           data-cat="${escHtml(item.category||'DEFAULT')}" data-pid="${escHtml(item.id)}"
           onerror="this.src=getCatFallbackSvg(this.dataset.cat,this.dataset.pid);this.onerror=null" />
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(item.title)}</div>
        <div class="cart-item-price">${item.price > 0 ? `₹${item.price}` : 'Confirm price'}</div>
      </div>
      <div class="cart-item-right">
        <button class="cart-item-remove-btn" data-id="${escHtml(item.id)}" aria-label="Remove item" title="Remove">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="cart-item-stepper">
          <button class="stepper-minus" data-id="${escHtml(item.id)}">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="stepper-plus" data-id="${escHtml(item.id)}">+</button>
        </div>
        ${item.price > 0 ? `<div style="font-size:.75rem;color:var(--text-muted);text-align:right">= ₹${item.price * item.qty}</div>` : ''}
      </div>
    </div>`).join('');

  list.querySelectorAll('.cart-item-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromCart(btn.dataset.id);
      refreshCardFooter(btn.dataset.id);
      renderCartPanel();
    });
  });
  list.querySelectorAll('.stepper-minus').forEach(btn => {
    btn.addEventListener('click', () => { changeCartQty(btn.dataset.id, -1); refreshCardFooter(btn.dataset.id); renderCartPanel(); });
  });
  list.querySelectorAll('.stepper-plus').forEach(btn => {
    btn.addEventListener('click', () => { changeCartQty(btn.dataset.id, 1); refreshCardFooter(btn.dataset.id); renderCartPanel(); });
  });

  const sum = cart.reduce((s, i) => s + (i.price * i.qty), 0);

  if (footer) {
    const savedName    = localStorage.getItem('mm_cust_name')    || '';
    const savedAddress = localStorage.getItem('mm_cust_address') || '';

    footer.innerHTML = `
      <div class="cart-total">
        <span>Total</span>
        <strong>${sum > 0 ? `₹${sum}` : 'Confirm with store'}</strong>
      </div>
      <div class="cart-total-mrp">MRP prices · final amount confirmed by store</div>
      <div style="display:flex;gap:8px;">
        <button id="btnDelivery" class="btn btn-outline" style="flex:1;justify-content:center;font-size:.82rem;padding:9px 0;">
          <i class="fa-solid fa-truck-fast"></i> Home Delivery
        </button>
        <button id="btnPickup" class="btn btn-primary" style="flex:1;justify-content:center;font-size:.82rem;padding:9px 0;">
          <i class="fa-solid fa-store"></i> Store Pickup
        </button>
      </div>
      <input id="coName" class="co-input" type="text" placeholder="Your name *" value="${escHtml(savedName)}" />
      <div id="coAddressWrap" style="display:none;">
        <textarea id="coAddress" class="co-input" rows="2" placeholder="Delivery address *" style="resize:none;">${escHtml(savedAddress)}</textarea>
      </div>
      <button id="waOrderBtn" class="btn btn-wa btn-full">
        <i class="fa-brands fa-whatsapp"></i> Send Order via WhatsApp
      </button>`;

    let deliveryMode = 'pickup';

    const btnDelivery   = footer.querySelector('#btnDelivery');
    const btnPickup     = footer.querySelector('#btnPickup');
    const coAddressWrap = footer.querySelector('#coAddressWrap');
    const coName        = footer.querySelector('#coName');
    const coAddress     = footer.querySelector('#coAddress');

    const setMode = (mode) => {
      deliveryMode = mode;
      btnDelivery.className = mode === 'delivery' ? 'btn btn-primary' : 'btn btn-outline';
      btnDelivery.style.cssText = 'flex:1;justify-content:center;font-size:.82rem;padding:9px 0;';
      btnPickup.className   = mode === 'pickup'   ? 'btn btn-primary' : 'btn btn-outline';
      btnPickup.style.cssText   = 'flex:1;justify-content:center;font-size:.82rem;padding:9px 0;';
      coAddressWrap.style.display = mode === 'delivery' ? 'block' : 'none';
    };

    btnDelivery.addEventListener('click', () => setMode('delivery'));
    btnPickup.addEventListener('click',   () => setMode('pickup'));

    coName.addEventListener('blur',    () => localStorage.setItem('mm_cust_name',    coName.value.trim()));
    coAddress.addEventListener('blur', () => localStorage.setItem('mm_cust_address', coAddress.value.trim()));

    footer.querySelector('#waOrderBtn').addEventListener('click', () => {
      const name    = coName.value.trim();
      const address = coAddress ? coAddress.value.trim() : '';

      coName.classList.remove('error');
      if (coAddress) coAddress.classList.remove('error');

      if (!name) { coName.classList.add('error'); coName.focus(); return; }
      if (deliveryMode === 'delivery' && !address) { coAddress.classList.add('error'); coAddress.focus(); return; }

      localStorage.setItem('mm_cust_name', name);
      if (deliveryMode === 'delivery') localStorage.setItem('mm_cust_address', address);

      // IMPROVED: full product detail in WA message
      const lines = cart.map(i =>
        `• ${i.title}\n  ID: ${i.id} | Qty: ${i.qty}${i.price > 0 ? ` | ₹${i.price} × ${i.qty} = ₹${i.price * i.qty}` : ''}`
      ).join('\n');
      const orderType = deliveryMode === 'delivery' ? 'Home Delivery 🚚' : 'Store Pickup 🏪';
      const addrLine  = deliveryMode === 'delivery' ? `\nAddress: ${address}` : '';
      const msg = `🛒 *Maya Mart Order*\n\nOrder Type: ${orderType}\nName: ${name}${addrLine}\n\n*My Order:*\n${lines}\n\n${sum > 0 ? `*Total (MRP): ₹${sum}*` : 'Please confirm prices.'}`;

      // Save to order history
      saveOrderToHistory(cart, sum, deliveryMode, name, address);

      window.open(`https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }
}

// ============================================================
// WISHLIST PANEL RENDER
// ============================================================
function renderWishPanel() {
  const list = document.getElementById('wishlistItems');
  if (!list) return;

  if (!wishlist.length) {
    list.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted)">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style="margin:0 auto 14px;display:block;opacity:.4">
        <path d="M28 44s-18-10-18-22a10 10 0 0 1 18-6 10 10 0 0 1 18 6c0 12-18 22-18 22z"
              stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
      </svg>
      <div style="font-weight:700;font-size:.95rem;margin-bottom:4px">Your wishlist is empty</div>
      <div style="font-size:.82rem">Tap the ♡ on any product to save it</div>
    </div>`;
    return;
  }

  list.innerHTML = wishlist.map(item => `
    <div class="wish-item" data-id="${escHtml(item.id)}">
      <img class="wish-item-img" src="${escHtml(item.image)}" alt="${escHtml(item.title)}"
           data-cat="${escHtml(item.category||'DEFAULT')}" data-pid="${escHtml(item.id)}"
           onerror="this.src=getCatFallbackSvg(this.dataset.cat,this.dataset.pid);this.onerror=null" />
      <div class="wish-item-info">
        <div class="wish-item-name">${escHtml(item.title)}</div>
        <div class="wish-item-price">${item.price > 0 ? `₹${item.price}` : '—'}</div>
      </div>
      <div class="wish-item-actions">
        <button class="wish-add-btn" data-id="${escHtml(item.id)}" aria-label="Add to cart" title="Add to cart">
          <i class="fa-solid fa-cart-plus"></i>
        </button>
        <button class="wish-remove" data-id="${escHtml(item.id)}" aria-label="Remove from wishlist">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.wish-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = allProducts.find(x => x.id === btn.dataset.id);
      if (p) {
        addToCart(p);
        refreshCardFooter(p.id);
        showToast(`✓ ${p.title} added to cart`);
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.style.background = 'var(--green-dark)';
        setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-cart-plus"></i>'; btn.style.background = ''; }, 1500);
      }
    });
  });

  list.querySelectorAll('.wish-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = allProducts.find(x => x.id === btn.dataset.id);
      if (p) { toggleWishlist(p); refreshCardFooter(p.id); }
      renderWishPanel();
    });
  });
}

// ============================================================
// UTILITY
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
