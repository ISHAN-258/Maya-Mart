/* =============================================
   MAYA MART – app.js  v4
   Batch fetching, fixed pagination, fixed cart/wish
   ============================================= */

'use strict';

const CONFIG = {
  SHEET_ID:    '1dDM4IZnsjaXXnk3ODuFdzXYPmem-_zcIBC_4JwF6ZzQ',
  WA_NUMBER:   '919278224984',
  PAGE_SIZE:   40,
  DEBOUNCE_MS: 320,
  RECENT_MAX:  10,
  STORE_NAME:  'Maya Mart',
  BATCH_SIZE:  3, // fetch N sheets at a time to avoid rate limiting

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
  'SPICES':'🌶️','GRAINS & PULSES':'🫘','OILS & GHEE':'🫙',
  'DRY FRUITS':'🥜','STAPLES':'🌾','FROZEN':'❄️',
  'SNACKS':'🍿','BISCUITS & COOKIES':'🍪','NOODLES & SAUCES':'🍜',
  'TEA & COFFEE':'🍵','DETERGENT':'🧽','GENERAL':'🛒',
  'COSMETICS':'💄','BABY CARE':'👶','CLEANERS':'🧹',
  'HAIR CARE':'💇','SOAPS':'🧼','ORAL CARE':'🪥',
  'FITNESS':'💪','DEFAULT':'🛒'
};

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
});

// ============================================================
// DATA FETCHING — batched to avoid Google rate limiting
// ============================================================
async function initProducts() {
  showLoading(true);
  showError(false);
  try {
    const allRows = await fetchAllSheetsBatched();
    allProducts = allRows;
    if (!allProducts.length) throw new Error('No products loaded');
    buildCategoryNav();
    buildCategoryGrid();
    applyFiltersAndRender();
    showLoading(false);
  } catch(e) {
    console.error('Load failed:', e);
    showLoading(false);
    showError(true);
  }
}

// Fetch in batches of BATCH_SIZE to avoid Google rate limiting
async function fetchAllSheetsBatched() {
  const sheets = CONFIG.PRODUCT_SHEETS;
  const products = [];
  for (let i = 0; i < sheets.length; i += CONFIG.BATCH_SIZE) {
    const batch = sheets.slice(i, i + CONFIG.BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(s => fetchSheet(s)));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        products.push(...r.value);
      } else {
        console.warn(`Sheet "${batch[j]}" failed:`, r.reason);
      }
    });
    // Small delay between batches so Google doesn't throttle
    if (i + CONFIG.BATCH_SIZE < sheets.length) {
      await new Promise(res => setTimeout(res, 300));
    }
  }
  return products;
}

async function fetchSheet(sheetName) {
  const encoded = encodeURIComponent(sheetName);
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encoded}&nocache=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const jsonStr = text.replace(/^[^\(]*\(/, '').replace(/\);\s*$/, '');
  const data = JSON.parse(jsonStr);
  if (!data.table || !data.table.rows) return [];
  return parseSheet(data.table, sheetName);
}

// ============================================================
// PARSING
// ============================================================
function parseSheet(table, sheetName) {
  const category = CONFIG.SHEET_CATEGORY[sheetName] || 'GENERAL';

  const colMap = {};
  table.cols.forEach((col, i) => {
    const label = (col.label || '').toLowerCase().trim()
      .replace(/[\s\-\.]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
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
      : `https://placehold.co/200x200/e8f5e9/1a7a4a?text=${encodeURIComponent(title.slice(0, 14))}`;

    const rawPrice     = get(row, 'price') || get(row, 'mrp') || get(row, 'mro') || get(row, 'rate') || '';
    const rawSalePrice = get(row, 'sale_price') || get(row, 'sale') || '';
    const price        = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;
    const salePrice    = rawSalePrice ? (parseFloat(rawSalePrice.replace(/[^0-9.]/g, '')) || 0) : 0;

    const availRaw = (get(row, 'availability') || 'IN STOCK').toUpperCase();
    const available = availRaw.includes('IN') && !availRaw.includes('OUT');

    const showCol = colMap['show_on_website'];
    if (showCol !== undefined) {
      const showVal = get(row, 'show_on_website').toUpperCase();
      if (showVal === 'FALSE' || showVal === 'NO') return;
    }

    const barcode = get(row, 'barcode') || get(row, 'ean') || '';
    const desc    = get(row, 'description') || '';
    const displayPrice = salePrice > 0 ? Math.min(price, salePrice) : price;

    products.push({
      id:           String(id),
      title:        title,
      description:  desc,
      price:        price,
      sale_price:   displayPrice,
      availability: available ? 'IN STOCK' : 'OUT OF STOCK',
      image:        image,
      barcode:      barcode,
      category:     category,
      sheet:        sheetName,
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
  return CAT_ICONS[cat] || CAT_ICONS['DEFAULT'];
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
  else if (activeFilter === 'sale')
    prods = prods.filter(p => p.sale_price < p.price && p.price > 0 && p.sale_price > 0);

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

  if (!prods.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:var(--text-muted)">
      <i class="fa-solid fa-box-open" style="font-size:2.5rem;margin-bottom:12px;display:block"></i>
      No products found. Try a different search or filter.
    </div>`;
    document.getElementById('loadMoreWrap').classList.add('hidden');
    updateSubtitle(0);
    return;
  }

  renderNextPage();
  updateSubtitle(prods.length);
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
// PRODUCT CARD
// ============================================================
function createProductCard(p) {
  const inCart  = getCartQty(p.id);
  const inWish  = wishlist.some(w => w.id === p.id);
  const inStock = p.availability === 'IN STOCK';
  const hasSale = p.sale_price < p.price && p.price > 0 && p.sale_price > 0;

  const card = document.createElement('div');
  card.className = 'product-card';
  // data-id holds the raw id; CSS.escape makes the selector safe
  card.setAttribute('data-id', p.id);

  card.innerHTML = `
    <div class="product-card-img-wrap">
      <img class="product-card-img"
           data-src="${escHtml(p.image)}"
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
    <div class="product-card-footer">
      ${inCart > 0
        ? qtyStepperHTML(p.id, inCart)
        : `<button class="btn-add" ${!inStock ? 'disabled' : ''}>
             <i class="fa-solid fa-cart-plus"></i> Add to Cart
           </button>`}
      <button class="btn-qv"><i class="fa-solid fa-eye"></i> Quick View</button>
    </div>`;

  lazyLoad(card.querySelector('.product-card-img'));

  // Bind events directly — no data-id lookups needed
  card.querySelector('.product-card-wish').addEventListener('click', e => {
    e.stopPropagation();
    toggleWishlist(p);
    refreshCard(p.id);
  });

  card.querySelector('.btn-qv').addEventListener('click', () => openQuickView(p));

  const addBtn = card.querySelector('.btn-add');
  if (addBtn) addBtn.addEventListener('click', () => { addToCart(p); refreshCard(p.id); });

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

function bindStepperEvents(card, p) {
  const minus = card.querySelector('.stepper-minus');
  const plus  = card.querySelector('.stepper-plus');
  if (minus) minus.addEventListener('click', () => { changeCartQty(p.id, -1); refreshCard(p.id); });
  if (plus)  plus.addEventListener('click',  () => { changeCartQty(p.id,  1); refreshCard(p.id); });
}

function refreshCard(id) {
  // CSS.escape makes the attribute selector safe for ids with special chars
  // (quotes, brackets, slashes, etc.) that would otherwise break the selector string
  const card = document.querySelector(`.product-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const newCard = createProductCard(p);
  newCard.style.animation = 'none';
  card.replaceWith(newCard);
}

// ============================================================
// LAZY LOAD
// ============================================================
const imgObserver = window.IntersectionObserver
  ? new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target;
        img.src = img.dataset.src;
        img.onerror = () => {
          img.src = `https://placehold.co/200x200/e8f5e9/1a7a4a?text=No+Image`;
          img.onerror = null;
        };
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
  const hasSale = p.sale_price < p.price && p.price > 0 && p.sale_price > 0;
  const inStock = p.availability === 'IN STOCK';

  document.getElementById('qvContent').innerHTML = `
    <div class="qv-img-wrap">
      <img class="qv-img" src="${escHtml(p.image)}" alt="${escHtml(p.title)}" loading="lazy"
           onerror="this.src='https://placehold.co/300x300/e8f5e9/1a7a4a?text=No+Image'" />
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
    </div>`;

  const overlay = document.getElementById('quickViewOverlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  bindQVActions(overlay, p);
}

function bindQVActions(overlay, p) {
  const actionsDiv = overlay.querySelector('#qvActions');

  const addBtn = actionsDiv.querySelector('.qv-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addToCart(p);
      refreshCard(p.id);
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
    refreshCard(p.id);
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
    refreshCard(p.id);
    const qv = ctx.querySelector('.qty-val');
    if (qv) qv.textContent = getCartQty(p.id);
  });
}

function closeQuickView() {
  document.getElementById('quickViewOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ============================================================
// CART
// ============================================================
function addToCart(p) {
  const existing = cart.find(i => i.id === p.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id:    p.id,
      title: p.title,
      price: p.sale_price || p.price,
      image: p.image,
      qty:   1
    });
  }
  saveCart();
  renderCartBadge();
}

function changeCartQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCartBadge();
}

function getCartQty(id) {
  const item = cart.find(i => i.id === id);
  return item ? item.qty : 0;
}

function saveCart() {
  localStorage.setItem('mm_cart', JSON.stringify(cart));
}

function renderCartBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  // HTML uses id="cartCount", not class="cart-badge"
  const el = document.getElementById('cartCount');
  if (el) {
    el.textContent = total;
    el.classList.toggle('hidden', total === 0);
  }
}

// ============================================================
// WISHLIST
// ============================================================
function toggleWishlist(p) {
  const idx = wishlist.findIndex(w => w.id === p.id);
  if (idx >= 0) wishlist.splice(idx, 1);
  else wishlist.push({ id: p.id, title: p.title, price: p.sale_price || p.price, image: p.image });
  localStorage.setItem('mm_wishlist', JSON.stringify(wishlist));
  renderWishlistBadge();
}

function renderWishlistBadge() {
  // HTML uses id="wishlistCount", not class="wish-badge"
  const el = document.getElementById('wishlistCount');
  if (el) {
    el.textContent = wishlist.length;
    el.classList.toggle('hidden', wishlist.length === 0);
  }
}

// ============================================================
// RECENTLY VIEWED
// ============================================================
function addToRecentlyViewed(p) {
  recentlyViewed = recentlyViewed.filter(r => r.id !== p.id);
  recentlyViewed.unshift({ id: p.id, title: p.title, price: p.sale_price || p.price, image: p.image });
  if (recentlyViewed.length > CONFIG.RECENT_MAX) recentlyViewed.pop();
  localStorage.setItem('mm_recent', JSON.stringify(recentlyViewed));
  renderRecentlyViewed();
}

function renderRecentlyViewed() {
  const wrap = document.getElementById('recentSection'); // HTML id is "recentSection"
  const list = document.getElementById('recentGrid');    // HTML id is "recentGrid"
  if (!wrap || !list) return;
  if (!recentlyViewed.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  list.innerHTML = recentlyViewed.map(r => `
    <div class="recent-card" data-id="${escHtml(r.id)}" style="
      flex-shrink:0;width:130px;background:#fff;border:1.5px solid #e0e8e2;
      border-radius:12px;overflow:hidden;cursor:pointer;display:flex;
      flex-direction:column;transition:box-shadow .2s;">
      <div style="width:130px;height:100px;background:#f9faf9;display:flex;
                  align-items:center;justify-content:center;overflow:hidden;">
        <img src="${escHtml(r.image)}" alt="${escHtml(r.title)}"
             style="width:100%;height:100%;object-fit:contain;padding:6px;"
             onerror="this.src='https://placehold.co/130x100/e8f5e9/1a7a4a?text=?'" />
      </div>
      <div style="padding:8px;flex:1;display:flex;flex-direction:column;gap:3px;">
        <div style="font-size:.75rem;font-weight:800;color:#1a2b22;line-height:1.3;
                    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
                    overflow:hidden;">${escHtml(r.title)}</div>
        <div style="font-size:.78rem;font-weight:800;color:#1a7a4a;">
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
  // CSS uses ".dark-mode" on body — not "dark" on <html>
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
}

function showError(show) {
  const el = document.getElementById('errorState');
  if (el) el.classList.toggle('hidden', !show);
}

function updateTitle() {
  const el = document.getElementById('productsTitle'); // HTML id is "productsTitle"
  if (!el) return;
  el.textContent = activeCategory === 'ALL'
    ? 'All Products'
    : `${getCatIcon(activeCategory)} ${titleCase(activeCategory)}`;
}

function updateSubtitle(count) {
  const el = document.getElementById('productsSubtitle'); // HTML id is "productsSubtitle"
  if (!el) return;
  el.textContent = activeCategory === 'ALL'
    ? `Showing all ${count} products`
    : `Showing ${count} products in ${titleCase(activeCategory)}`;
}

// ============================================================
// BIND UI EVENTS
// ============================================================
function bindUI() {
  // Search — bind both desktop and mobile inputs to same handler
  let debounceTimer;
  const onSearchInput = (input) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value.trim();
      // Keep both inputs in sync
      const other = input.id === 'searchInput'
        ? document.getElementById('searchInputMobile')
        : document.getElementById('searchInput');
      if (other && other.value !== input.value) other.value = input.value;
      applyFiltersAndRender();
    }, CONFIG.DEBOUNCE_MS);
  };

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', () => onSearchInput(searchInput));

  const searchInputMobile = document.getElementById('searchInputMobile');
  if (searchInputMobile) searchInputMobile.addEventListener('input', () => onSearchInput(searchInputMobile));

  // Filter buttons
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFiltersAndRender();
    });
  });

  // Sort select
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      activeSort = sortSelect.value;
      applyFiltersAndRender();
    });
  }

  // Load more
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', renderNextPage);

  // Dark mode toggle
  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) darkToggle.addEventListener('click', toggleDarkMode);

  // Quick view close
  const qvClose = document.getElementById('qvClose');
  if (qvClose) qvClose.addEventListener('click', closeQuickView);
  const qvOverlay = document.getElementById('quickViewOverlay');
  if (qvOverlay) qvOverlay.addEventListener('click', e => {
    if (e.target === qvOverlay) closeQuickView();
  });

  // Cart panel — HTML ids: cartBtn, cartOverlay, cartClose
  const cartBtn   = document.getElementById('cartBtn');
  const cartPanel = document.getElementById('cartOverlay');
  const cartClose = document.getElementById('cartClose');
  if (cartBtn)   cartBtn.addEventListener('click',  () => { renderCartPanel(); cartPanel.classList.remove('hidden'); });
  if (cartClose) cartClose.addEventListener('click', () => cartPanel.classList.add('hidden'));

  // Wishlist panel — HTML ids: wishlistBtn, wishlistOverlay, wishlistClose
  const wishBtn   = document.getElementById('wishlistBtn');
  const wishPanel = document.getElementById('wishlistOverlay');
  const wishClose = document.getElementById('wishlistClose');
  if (wishBtn)   wishBtn.addEventListener('click',  () => { renderWishPanel(); wishPanel.classList.remove('hidden'); });
  if (wishClose) wishClose.addEventListener('click', () => wishPanel.classList.add('hidden'));

  // Note: retry button uses inline onclick="initProducts()" in HTML — no JS binding needed
}

// ============================================================
// CART PANEL RENDER
// ============================================================
function renderCartPanel() {
  const list   = document.getElementById('cartItems');   // was 'cartList' — doesn't exist
  const footer = document.getElementById('cartFooter');
  if (!list) return;

  if (!cart.length) {
    list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">
      <i class="fa-solid fa-cart-shopping" style="font-size:2rem;margin-bottom:8px;display:block"></i>
      Your cart is empty
    </div>`;
    if (footer) footer.innerHTML = '';
    return;
  }

  list.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${escHtml(item.id)}">
      <img src="${escHtml(item.image)}" alt="${escHtml(item.title)}"
           onerror="this.src='https://placehold.co/60x60/e8f5e9/1a7a4a?text=?'" />
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(item.title)}</div>
        <div class="cart-item-price">${item.price > 0 ? `₹${item.price} × ${item.qty}` : `Qty: ${item.qty}`}</div>
      </div>
      <div class="cart-item-controls">
        <button class="stepper-minus" data-id="${escHtml(item.id)}">−</button>
        <span>${item.qty}</span>
        <button class="stepper-plus"  data-id="${escHtml(item.id)}">+</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.stepper-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      changeCartQty(btn.dataset.id, -1);
      renderCartPanel();
      refreshCard(btn.dataset.id);
    });
  });
  list.querySelectorAll('.stepper-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      changeCartQty(btn.dataset.id, 1);
      renderCartPanel();
      refreshCard(btn.dataset.id);
    });
  });

  const sum = cart.reduce((s, i) => s + (i.price * i.qty), 0);

  // Render total + checkout UI into cartFooter
  if (footer) {
    // Load saved name/address from localStorage
    const savedName    = localStorage.getItem('mm_cust_name')    || '';
    const savedAddress = localStorage.getItem('mm_cust_address') || '';

    footer.innerHTML = `
      <div class="cart-total" style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span>Total</span>
        <strong>${sum > 0 ? `₹${sum}` : 'Confirm with store'}</strong>
      </div>
      <div style="font-size:.72rem;color:#6b8a74;margin-bottom:10px;">
        MRP prices. Final amount confirmed by store.
      </div>

      <!-- Delivery type toggle -->
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button id="btnDelivery" class="btn btn-primary" style="flex:1;justify-content:center;font-size:.85rem;padding:9px 0;">
          <i class="fa-solid fa-truck-fast"></i> Home Delivery
        </button>
        <button id="btnPickup" class="btn btn-outline" style="flex:1;justify-content:center;font-size:.85rem;padding:9px 0;">
          <i class="fa-solid fa-store"></i> Store Pickup
        </button>
      </div>

      <!-- Name field (always shown) -->
      <div style="margin-bottom:8px;">
        <input id="coName" type="text" placeholder="Your name *"
          value="${escHtml(savedName)}"
          style="width:100%;padding:9px 12px;border:2px solid #e0e8e2;border-radius:8px;
                 font-size:.88rem;font-family:inherit;outline:none;background:#f9faf9;color:#1a2b22;" />
      </div>

      <!-- Address field (shown only for delivery) -->
      <div id="coAddressWrap" style="margin-bottom:10px;display:none;">
        <textarea id="coAddress" rows="2" placeholder="Delivery address *"
          style="width:100%;padding:9px 12px;border:2px solid #e0e8e2;border-radius:8px;
                 font-size:.88rem;font-family:inherit;outline:none;resize:none;
                 background:#f9faf9;color:#1a2b22;">${escHtml(savedAddress)}</textarea>
      </div>

      <button id="waOrderBtn" class="btn btn-wa btn-full" style="margin-top:4px;">
        <i class="fa-brands fa-whatsapp"></i> Send Order via WhatsApp
      </button>`;

    // State: which mode is active
    let deliveryMode = 'pickup'; // default

    const btnDelivery    = footer.querySelector('#btnDelivery');
    const btnPickup      = footer.querySelector('#btnPickup');
    const coAddressWrap  = footer.querySelector('#coAddressWrap');
    const coName         = footer.querySelector('#coName');
    const coAddress      = footer.querySelector('#coAddress');
    const waBtn          = footer.querySelector('#waOrderBtn');

    const setMode = (mode) => {
      deliveryMode = mode;
      if (mode === 'delivery') {
        btnDelivery.className = 'btn btn-primary';
        btnDelivery.style.cssText = 'flex:1;justify-content:center;font-size:.85rem;padding:9px 0;';
        btnPickup.className = 'btn btn-outline';
        btnPickup.style.cssText = 'flex:1;justify-content:center;font-size:.85rem;padding:9px 0;';
        coAddressWrap.style.display = 'block';
      } else {
        btnPickup.className = 'btn btn-primary';
        btnPickup.style.cssText = 'flex:1;justify-content:center;font-size:.85rem;padding:9px 0;';
        btnDelivery.className = 'btn btn-outline';
        btnDelivery.style.cssText = 'flex:1;justify-content:center;font-size:.85rem;padding:9px 0;';
        coAddressWrap.style.display = 'none';
      }
    };

    btnDelivery.addEventListener('click', () => setMode('delivery'));
    btnPickup.addEventListener('click',   () => setMode('pickup'));

    // Persist name/address on blur
    coName.addEventListener('blur',    () => localStorage.setItem('mm_cust_name',    coName.value.trim()));
    coAddress.addEventListener('blur', () => localStorage.setItem('mm_cust_address', coAddress.value.trim()));

    waBtn.addEventListener('click', () => {
      const name    = coName.value.trim();
      const address = coAddress ? coAddress.value.trim() : '';

      if (!name) {
        coName.style.borderColor = '#e53935';
        coName.focus();
        return;
      }
      if (deliveryMode === 'delivery' && !address) {
        coAddress.style.borderColor = '#e53935';
        coAddress.focus();
        return;
      }

      // Save to localStorage for next visit
      localStorage.setItem('mm_cust_name', name);
      if (deliveryMode === 'delivery') localStorage.setItem('mm_cust_address', address);

      const lines = cart.map(i =>
        `• ${i.title} × ${i.qty}${i.price > 0 ? ` = ₹${i.price * i.qty}` : ''}`
      ).join('\n');

      const orderType = deliveryMode === 'delivery' ? 'Home Delivery' : 'Store Pickup';
      const addrLine  = deliveryMode === 'delivery' ? `\nAddress: ${address}` : '';

      const msg = `Hello Maya Mart! 🛒\n\nOrder Type: ${orderType}\nName: ${name}${addrLine}\n\nMy Order:\n${lines}\n\n${sum > 0 ? `Total (MRP): ₹${sum}` : 'Please confirm prices.'}`;
      window.open(`https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }
}

// ============================================================
// WISHLIST PANEL RENDER
// ============================================================
function renderWishPanel() {
  const list = document.getElementById('wishlistItems');  // was 'wishList' — doesn't exist
  if (!list) return;

  if (!wishlist.length) {
    list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">
      <i class="fa-regular fa-heart" style="font-size:2rem;margin-bottom:8px;display:block"></i>
      Your wishlist is empty
    </div>`;
    return;
  }

  list.innerHTML = wishlist.map(item => `
    <div class="wish-item" data-id="${escHtml(item.id)}">
      <img src="${escHtml(item.image)}" alt="${escHtml(item.title)}"
           onerror="this.src='https://placehold.co/60x60/e8f5e9/1a7a4a?text=?'" />
      <div class="wish-item-info">
        <div class="wish-item-name">${escHtml(item.title)}</div>
        <div class="wish-item-price">${item.price > 0 ? `₹${item.price}` : '—'}</div>
      </div>
      <button class="wish-remove" data-id="${escHtml(item.id)}" aria-label="Remove">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`).join('');

  list.querySelectorAll('.wish-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = allProducts.find(x => x.id === btn.dataset.id);
      if (p) { toggleWishlist(p); refreshCard(p.id); }
      renderWishPanel();
    });
  });
}

// ============================================================
// UTILITY
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
