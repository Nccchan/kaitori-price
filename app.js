// にこにこ買取 価格表サイト

const SHEET_ID = '1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw';

// ===== Recore API 設定 =====
// NOVASTOより発行されたAPIキーを設定してください
const RECORE_API_KEY = '<Recoreより発行されたAPIキーを設定>';
// LINEミニアプリのWebアプリURLを設定してください（不要な場合は空文字のまま）
const MEMBER_APP_URL = '';

const CATEGORIES = {
  pokemon: { label: 'ポケモンカード', sheetName: 'ポケモン', imageDir: 'pokemon' },
  onepiece: { label: 'ONE PIECE', sheetName: 'ワンピース', imageDir: 'onepiece', boxMode: true },
  dragonball: { label: 'ドラゴンボール', sheetName: 'ドラゴンボール', imageDir: 'dragonball', boxMode: true },
};

function getCatLabels(categoryKey) {
  if (CATEGORIES[categoryKey]?.boxMode) return { a: '箱', b: 'カートン' };
  return { a: 'シュリンクあり', b: 'シュリンクなし' };
}

const els = {
  updatedAt: document.getElementById('updatedAt'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  q: document.getElementById('q'),
  clearBtn: document.getElementById('clearBtn'),
  viewBtn: document.getElementById('viewBtn'),
  count: document.getElementById('count'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  retryBtn: document.getElementById('retryBtn'),
  notices: document.getElementById('notices'),
  grid: document.getElementById('grid'),
  tablewrap: document.getElementById('tablewrap'),
  tbody: document.getElementById('tbody'),
  shareModal: document.getElementById('shareModal'),
  shareClose: document.getElementById('shareClose'),
  shareCategory: document.getElementById('shareCategory'),
  shareUpdatedAt: document.getElementById('shareUpdatedAt'),
  shareImg: document.getElementById('shareImg'),
  shareName: document.getElementById('shareName'),
  shareModel: document.getElementById('shareModel'),
  shareShrink: document.getElementById('shareShrink'),
  shareNoShrink: document.getElementById('shareNoShrink'),
};

let allData = {
  pokemon: { items: [], notices: [] },
  onepiece: { items: [], notices: [] },
  dragonball: { items: [], notices: [] },
};
let activeCategory = 'pokemon';
let viewMode = 'card'; // 'card' | 'table'

let imageManifest = { pokemon: {}, onepiece: {}, dragonball: {} };

function normalizeText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function pickCellText(cell) {
  if (!cell) return '';
  if (typeof cell.f === 'string' && cell.f.trim()) return cell.f.trim();
  if (cell.v == null) return '';
  return String(cell.v).trim();
}

function gvizUrl(sheetName) {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const params = new URLSearchParams({ tqx: 'out:json', sheet: sheetName });
  return `${base}?${params.toString()}`;
}

function parseGviz(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('GViz parse error');
  return JSON.parse(text.slice(start, end + 1));
}

function extractUpdatedAt(rows) {
  const re = /^\d{4}\/\d{2}\/\d{2}$/;
  for (const r of rows) {
    const v = pickCellText(r?.c?.[0]);
    if (v && re.test(v)) return v;
  }
  return '';
}

function toItems(gviz) {
  const rows = gviz?.table?.rows || [];
  const items = [];
  const notices = [];
  const modelRe = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
  let startedProducts = false;

  for (const r of rows) {
    // このシートはA列に日付が入るため、実データはB〜E列を読む
    const name = pickCellText(r?.c?.[1]);
    const model = pickCellText(r?.c?.[2]);
    const shrink = pickCellText(r?.c?.[3]);
    const noshrink = pickCellText(r?.c?.[4]);

    const n = String(name || '').trim();
    const m = String(model || '').trim();
    const s = String(shrink || '').trim();
    const ns = String(noshrink || '').trim();

    if (!n || n === '商品名') continue;
    if (n.startsWith('買取価格')) continue;
    if (n.includes('シュリンク') && !m && !s && !ns) continue;

    const hasPrice = !!s || !!ns;
    const isModelCode = !!m && modelRe.test(m);
    const isProductRow = isModelCode || hasPrice;

    // お知らせは「最初の商品の前にある注意文」だけ拾う（それ以降の余計な行は無視）
    if (!startedProducts) {
      if (!isProductRow) {
        if (!m && !s && !ns) notices.push({ text: n });
        continue;
      }
      startedProducts = true;
    }

    if (!isProductRow) continue;
    items.push({ name: n, model: m, shrink: shrink, noshrink: noshrink });
  }

  return { items, notices };
}

function safeFileBase(s) {
  return String(s || '')
    .trim()
    .replace(/[\/]/g, '-')
    .replace(/\s+/g, '')
    .replace(/　/g, '');
}

function getManifestPath(categoryKey, model) {
  const raw = String(model || '').trim();
  const safe = safeFileBase(raw);
  const keys = [];

  // as-is / safe
  if (raw) keys.push(raw);
  if (safe) keys.push(safe);

  // common variants: normalize hyphen variants + strip suffix after first hyphen
  const norm = raw
    .replace(/[‐‑‒–—−ー－]/g, '-')
    .replace(/\s+/g, '')
    .trim();
  const normSafe = safeFileBase(norm);

  if (norm && !keys.includes(norm)) keys.push(norm);
  if (normSafe && !keys.includes(normSafe)) keys.push(normSafe);

  const base = norm.split('-')[0] || '';
  const baseSafe = safeFileBase(base);
  if (base && !keys.includes(base)) keys.push(base);
  if (baseSafe && !keys.includes(baseSafe)) keys.push(baseSafe);

  for (const k of keys) {
    const path = imageManifest?.[categoryKey]?.[k];
    if (path) return path;
  }
  return '';
}

function createImg(categoryKey, model, size) {
  const wrap = document.createElement('div');
  wrap.className = size === 'table' ? 'timg' : 'card__img';

  const img = document.createElement('img');
  img.alt = model ? `${model}` : '';
  img.loading = 'lazy';

  const path = getManifestPath(categoryKey, model);
  img.src = path || './images/placeholder.svg';
  img.onerror = () => {
    img.src = './images/placeholder.svg';
  };

  wrap.appendChild(img);
  return wrap;
}

// モーダル開閉カウント（複数モーダルの重ね対応）
let _modalCount = 0;
function setModalOpen(isOpen) {
  if (isOpen) {
    _modalCount++;
    document.documentElement.classList.add('is-modal-open');
    document.body.classList.add('is-modal-open');
  } else {
    _modalCount = Math.max(0, _modalCount - 1);
    if (_modalCount === 0) {
      document.documentElement.classList.remove('is-modal-open');
      document.body.classList.remove('is-modal-open');
    }
  }
}

function openShare(it) {
  if (!els.shareModal) return;
  const catLabel = CATEGORIES?.[activeCategory]?.label || '';
  const updated = els.updatedAt?.textContent || '—';

  els.shareCategory.textContent = catLabel;
  els.shareUpdatedAt.textContent = updated;
  els.shareName.textContent = it?.name || '';
  els.shareModel.textContent = it?.model ? `型式: ${it.model}` : '';
  els.shareShrink.textContent = it?.shrink || '—';
  els.shareNoShrink.textContent = it?.noshrink || '—';
  const { a: la, b: lb } = getCatLabels(activeCategory);
  const shrinkLabelEl = document.getElementById('shareShrinkLabel');
  const noshrinkLabelEl = document.getElementById('shareNoShrinkLabel');
  if (shrinkLabelEl) shrinkLabelEl.textContent = la;
  if (noshrinkLabelEl) noshrinkLabelEl.textContent = lb;

  const path = getManifestPath(activeCategory, it?.model);
  els.shareImg.alt = it?.model ? `${it.model}` : '';
  els.shareImg.src = path || './images/placeholder.svg';
  els.shareImg.onerror = () => {
    els.shareImg.src = './images/placeholder.svg';
  };

  els.shareModal.hidden = false;
  setModalOpen(true);
}

function closeShare() {
  if (!els.shareModal) return;
  els.shareModal.hidden = true;
  setModalOpen(false);
}

function setStatus({ loading, error }) {
  els.loading.hidden = !loading;
  els.error.hidden = !error;
}

function setViewMode(next) {
  viewMode = next;
  const isTable = viewMode === 'table';
  els.grid.hidden = isTable;
  els.tablewrap.hidden = !isTable;
  els.viewBtn.textContent = isTable ? '表示: 表' : '表示: カード';
  els.viewBtn.setAttribute('aria-pressed', String(isTable));
}

function render() {
  const q = normalizeText(els.q.value);
  const data = allData[activeCategory] || { items: [], notices: [] };

  // テーブルヘッダー・フッター注記をカテゴリに合わせて更新
  const catLabels = getCatLabels(activeCategory);
  const thShrink = document.getElementById('th-shrink');
  const thNoshrink = document.getElementById('th-noshrink');
  if (thShrink) thShrink.textContent = catLabels.a;
  if (thNoshrink) thNoshrink.textContent = catLabels.b;
  const footerNote = document.getElementById('footerNote');
  if (footerNote) {
    footerNote.textContent = CATEGORIES[activeCategory]?.boxMode
      ? '※ カートン価格が空欄の商品は、カートンでのお取り扱いがございません。'
      : '※ シュリンクなし価格が空欄の商品は、シュリンクなしでのお取り扱いがございません。';
  }

  const items = data.items || [];
  const notices = data.notices || [];

  const filtered = q
    ? items.filter((it) => normalizeText(`${it.name} ${it.model}`).includes(q))
    : items;

  els.count.textContent = `${filtered.length} 件`;

  // notices (show only when not searching)
  if (els.notices) {
    els.notices.innerHTML = '';
    const lines = (notices || [])
      .map((n) => String(n?.text || '').trim())
      .filter(Boolean);
    const show = !q && lines.length > 0;
    els.notices.hidden = !show;
    if (show) {
      const box = document.createElement('div');
      box.className = 'notice';

      const row = document.createElement('div');
      row.className = 'notice__row';

      const icon = document.createElement('div');
      icon.className = 'notice__icon';
      icon.textContent = 'i';

      const body = document.createElement('div');
      const text = document.createElement('div');
      text.className = 'notice__text';
      text.textContent = 'お知らせ';

      const sub = document.createElement('div');
      sub.className = 'notice__sub';
      sub.textContent = lines.join('\n');

      body.appendChild(text);
      body.appendChild(sub);

      row.appendChild(icon);
      row.appendChild(body);

      box.appendChild(row);
      els.notices.appendChild(box);
    }
  }

  // grid
  els.grid.innerHTML = '';
  for (const it of filtered) {
    const card = document.createElement('article');
    card.className = 'card';

    const top = document.createElement('div');
    top.className = 'card__top';

    const imgWrap = createImg(activeCategory, it.model, 'card');

    const body = document.createElement('div');
    body.className = 'card__body';

    const h = document.createElement('h3');
    h.className = 'card__name';
    h.textContent = it.name;

    const m = document.createElement('div');
    m.className = 'card__model';
    m.textContent = it.model ? `型式: ${it.model}` : '';

    body.appendChild(h);
    body.appendChild(m);

    top.appendChild(imgWrap);
    top.appendChild(body);

    const prices = document.createElement('div');
    prices.className = 'card__prices';

    const labels = getCatLabels(activeCategory);

    const a = document.createElement('div');
    a.className = 'pricebox';
    a.innerHTML = `<div class="pricebox__label">${labels.a}</div>`;
    const av = document.createElement('div');
    av.className = 'pricebox__value' + (it.shrink ? '' : ' is-empty');
    av.textContent = it.shrink || '—';
    a.appendChild(av);

    const b = document.createElement('div');
    b.className = 'pricebox';
    b.innerHTML = `<div class="pricebox__label">${labels.b}</div>`;
    const bv = document.createElement('div');
    bv.className = 'pricebox__value' + (it.noshrink ? '' : ' is-empty');
    bv.textContent = it.noshrink || '—';
    b.appendChild(bv);

    prices.appendChild(a);
    prices.appendChild(b);

    const actions = document.createElement('div');
    actions.className = 'card__actions';

    const postBtn = document.createElement('button');
    postBtn.className = 'postbtn';
    postBtn.type = 'button';
    postBtn.textContent = '詳細';
    postBtn.addEventListener('click', () => openShare(it));
    actions.appendChild(postBtn);

    // カートに追加ボタン
    if (it.shrink || it.noshrink) {
      const cartBtn = document.createElement('button');
      cartBtn.className = 'cartbtn';
      cartBtn.type = 'button';
      cartBtn.textContent = 'カートに追加';
      const catKey = activeCategory;
      cartBtn.addEventListener('click', () => handleAddToCart(it, catKey));
      actions.appendChild(cartBtn);
    }

    card.appendChild(top);
    card.appendChild(prices);
    card.appendChild(actions);

    els.grid.appendChild(card);
  }

  // table
  els.tbody.innerHTML = '';
  for (const it of filtered) {
    const tr = document.createElement('tr');

    const tdImg = document.createElement('td');
    tdImg.appendChild(createImg(activeCategory, it.model, 'table'));

    const tdName = document.createElement('td');
    tdName.textContent = it.name;

    const tdModel = document.createElement('td');
    tdModel.textContent = it.model;

    const tdShrink = document.createElement('td');
    tdShrink.textContent = it.shrink || '—';

    const tdNo = document.createElement('td');
    tdNo.textContent = it.noshrink || '—';

    const tdAction = document.createElement('td');
    if (it.shrink || it.noshrink) {
      const cartBtn = document.createElement('button');
      cartBtn.className = 'cartbtn cartbtn--sm';
      cartBtn.type = 'button';
      cartBtn.textContent = '追加';
      const catKey = activeCategory;
      cartBtn.addEventListener('click', () => handleAddToCart(it, catKey));
      tdAction.appendChild(cartBtn);
    }

    tr.appendChild(tdImg);
    tr.appendChild(tdName);
    tr.appendChild(tdModel);
    tr.appendChild(tdShrink);
    tr.appendChild(tdNo);
    tr.appendChild(tdAction);

    els.tbody.appendChild(tr);
  }
}

async function loadImageManifest() {
  try {
    const res = await fetch('./images/manifest.json', { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    if (json && typeof json === 'object') {
      imageManifest = {
        pokemon: json.pokemon || {},
        onepiece: json.onepiece || {},
        dragonball: json.dragonball || {},
      };
    }
  } catch {
    // manifest が無くても表示は可能（placeholder）
  }
}

async function loadCategory(key) {
  const sheetName = CATEGORIES[key].sheetName;
  const res = await fetch(gvizUrl(sheetName), { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const text = await res.text();
  const gviz = parseGviz(text);
  const parsed = toItems(gviz);
  return { gviz, items: parsed.items, notices: parsed.notices };
}

async function loadAllData() {
  setStatus({ loading: true, error: false });

  try {
    await loadImageManifest();
    const [p, o, d] = await Promise.all([
      loadCategory('pokemon'),
      loadCategory('onepiece'),
      loadCategory('dragonball'),
    ]);

    allData.pokemon = { items: p.items, notices: p.notices };
    allData.onepiece = { items: o.items, notices: o.notices };
    allData.dragonball = { items: d.items, notices: d.notices };

    const updated =
      extractUpdatedAt(p.gviz?.table?.rows || []) ||
      extractUpdatedAt(o.gviz?.table?.rows || []) ||
      extractUpdatedAt(d.gviz?.table?.rows || []);

    els.updatedAt.textContent = updated || '—';

    setStatus({ loading: false, error: false });

    els.grid.hidden = false;
    setViewMode(viewMode);
    render();
  } catch (e) {
    console.error(e);
    setStatus({ loading: false, error: true });
  }
}

function setActiveCategory(key) {
  activeCategory = key;
  for (const b of els.tabs) {
    b.classList.toggle('is-active', b.dataset.category === key);
  }
  render();
}

function wire() {
  for (const b of els.tabs) {
    b.addEventListener('click', () => setActiveCategory(b.dataset.category));
  }

  els.q.addEventListener('input', () => {
    const has = !!els.q.value;
    els.clearBtn.hidden = !has;
    render();
  });

  els.clearBtn.addEventListener('click', () => {
    els.q.value = '';
    els.clearBtn.hidden = true;
    render();
    els.q.focus();
  });

  els.viewBtn.addEventListener('click', () => {
    setViewMode(viewMode === 'card' ? 'table' : 'card');
  });

  els.retryBtn.addEventListener('click', loadAllData);

  if (els.shareClose) els.shareClose.addEventListener('click', closeShare);
  if (els.shareModal) {
    els.shareModal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.shareClose) closeShare();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.shareModal && !els.shareModal.hidden) { closeShare(); return; }
    const shrinkSel = document.getElementById('shrinkSelector');
    if (shrinkSel && !shrinkSel.hidden) { closeShrinkSelector(); return; }
    const checkoutMod = document.getElementById('checkoutModal');
    if (checkoutMod && !checkoutMod.hidden) { closeCheckoutModal(); return; }
    const cartMod = document.getElementById('cartModal');
    if (cartMod && !cartMod.hidden) { closeCartModal(); return; }
  });
}

// ===== CART SYSTEM =====

// カート状態（localStorage永続化）
let cart = [];
try { cart = JSON.parse(localStorage.getItem('kaitori_cart') || '[]'); } catch { cart = []; }

// シュリンク選択の対象（選択ポップアップ表示中に保持）
let _pendingItem = null;
let _pendingCategory = null;

// -- カートデータ操作 --

function saveCart() {
  try { localStorage.setItem('kaitori_cart', JSON.stringify(cart)); } catch { /* ignore */ }
}

function addToCart(item, categoryKey, shrinkType) {
  const rawPrice = shrinkType === 'shrink' ? item.shrink : item.noshrink;
  const price = parseInt(String(rawPrice || '0').replace(/[^0-9]/g, ''), 10) || 0;
  const { a: la, b: lb } = getCatLabels(categoryKey);
  const shrinkLabel = shrinkType === 'shrink' ? la : lb;

  const existing = cart.find(
    (c) => c.model === item.model && c.category === categoryKey && c.shrinkType === shrinkType
  );
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ name: item.name, model: item.model, category: categoryKey, shrinkType, shrinkLabel, price, quantity: 1 });
  }
  saveCart();
  updateCartBadge();
  showCartToast('カートに追加しました');
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
  updateCartBadge();
  renderCartModal();
}

function changeQuantity(index, delta) {
  const newQty = (cart[index]?.quantity || 1) + delta;
  if (newQty < 1) return;
  cart[index].quantity = newQty;
  saveCart();
  updateCartBadge();
  renderCartModal();
}

function clearCart() {
  cart = [];
  saveCart();
  updateCartBadge();
  renderCartModal();
}

function getCartSummary() {
  const count = cart.reduce((s, c) => s + c.quantity, 0);
  const amount = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  return { count, amount };
}

function buildCommentText(extraComment) {
  const lines = ['【買取申込商品リスト】'];
  for (const item of cart) {
    const sub = item.price * item.quantity;
    lines.push(`・${item.name}${item.model ? ` (${item.model})` : ''} ${item.shrinkLabel} × ${item.quantity}点 → ¥${sub.toLocaleString()}`);
  }
  const { count, amount } = getCartSummary();
  lines.push('---');
  lines.push(`合計: ${count}点 / 合計金額: ¥${amount.toLocaleString()}`);
  if (extraComment && extraComment.trim()) {
    lines.push('');
    lines.push('【お客様備考】');
    lines.push(extraComment.trim());
  }
  return lines.join('\n');
}

// -- カートUI --

function updateCartBadge() {
  const { count } = getCartSummary();
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = count;
    badge.hidden = count === 0;
  }
  const btn = document.getElementById('cartHeaderBtn');
  if (btn) btn.setAttribute('aria-label', `カート (${count}点)`);
}

let _toastTimer = null;
function showCartToast(msg) {
  const toast = document.getElementById('cartToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('is-visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

// -- シュリンク選択ポップアップ --

function openShrinkSelector(item, categoryKey) {
  _pendingItem = item;
  _pendingCategory = categoryKey;

  const el = document.getElementById('shrinkSelector');
  if (!el) return;

  const shrinkBtn = document.getElementById('shrinkShrinkBtn');
  const noshrinkBtn = document.getElementById('shrinkNoshrinkBtn');
  const shrinkPrice = document.getElementById('shrinkShrinkPrice');
  const noshrinkPrice = document.getElementById('shrinkNoshrinkPrice');
  const shrinkLabelEl = document.getElementById('shrinkShrinkLabel');
  const noshrinkLabelEl = document.getElementById('shrinkNoshrinkLabel');

  const { a: la, b: lb } = getCatLabels(categoryKey);
  if (shrinkLabelEl) shrinkLabelEl.textContent = la;
  if (noshrinkLabelEl) noshrinkLabelEl.textContent = lb;

  if (shrinkBtn) shrinkBtn.hidden = !item.shrink;
  if (noshrinkBtn) noshrinkBtn.hidden = !item.noshrink;
  if (shrinkPrice) shrinkPrice.textContent = item.shrink ? `¥${item.shrink}` : '';
  if (noshrinkPrice) noshrinkPrice.textContent = item.noshrink ? `¥${item.noshrink}` : '';

  el.hidden = false;
  setModalOpen(true);
}

function closeShrinkSelector() {
  const el = document.getElementById('shrinkSelector');
  if (el) el.hidden = true;
  _pendingItem = null;
  _pendingCategory = null;
  setModalOpen(false);
}

function handleAddToCart(item, categoryKey) {
  const hasShrink = !!item.shrink;
  const hasNoshrink = !!item.noshrink;
  if (hasShrink && hasNoshrink) {
    openShrinkSelector(item, categoryKey);
  } else if (hasShrink) {
    addToCart(item, categoryKey, 'shrink');
  } else if (hasNoshrink) {
    addToCart(item, categoryKey, 'noshrink');
  }
}

// -- カートモーダル --

function openCartModal() {
  const el = document.getElementById('cartModal');
  if (!el) return;
  renderCartModal();
  el.hidden = false;
  setModalOpen(true);
}

function closeCartModal() {
  const el = document.getElementById('cartModal');
  if (el) el.hidden = true;
  setModalOpen(false);
}

function renderCartModal() {
  const body = document.getElementById('cartModalBody');
  const foot = document.getElementById('cartModalFoot');
  if (!body || !foot) return;

  body.innerHTML = '';
  foot.innerHTML = '';

  if (cart.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cart-modal__empty';
    empty.textContent = 'カートに商品がありません';
    body.appendChild(empty);
    return;
  }

  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];

    const row = document.createElement('div');
    row.className = 'cart-item';

    const info = document.createElement('div');
    info.className = 'cart-item__info';

    const name = document.createElement('div');
    name.className = 'cart-item__name';
    name.textContent = item.name;

    const meta = document.createElement('div');
    meta.className = 'cart-item__meta';
    meta.textContent = `${item.model ? `${item.model} / ` : ''}${item.shrinkLabel}`;

    info.appendChild(name);
    info.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'cart-item__right';

    const qty = document.createElement('div');
    qty.className = 'cart-item__qty';

    const minus = document.createElement('button');
    minus.className = 'cart-qty-btn';
    minus.type = 'button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', '数量を減らす');
    const idx = i;
    minus.addEventListener('click', () => changeQuantity(idx, -1));

    const qtyNum = document.createElement('div');
    qtyNum.className = 'cart-qty-num';
    qtyNum.textContent = item.quantity;

    const plus = document.createElement('button');
    plus.className = 'cart-qty-btn';
    plus.type = 'button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', '数量を増やす');
    plus.addEventListener('click', () => changeQuantity(idx, 1));

    qty.appendChild(minus);
    qty.appendChild(qtyNum);
    qty.appendChild(plus);

    const price = document.createElement('div');
    price.className = 'cart-item__price';
    price.textContent = `¥${(item.price * item.quantity).toLocaleString()}`;

    const del = document.createElement('button');
    del.className = 'cart-item__del';
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', '削除');
    del.addEventListener('click', () => removeFromCart(idx));

    right.appendChild(qty);
    right.appendChild(price);
    right.appendChild(del);

    row.appendChild(info);
    row.appendChild(right);
    body.appendChild(row);
  }

  // フッター
  const { count, amount } = getCartSummary();

  const total = document.createElement('div');
  total.className = 'cart-total';

  const totalLabel = document.createElement('span');
  totalLabel.className = 'cart-total__label';
  totalLabel.textContent = '合計';

  const totalRight = document.createElement('span');
  totalRight.className = 'cart-total__right';

  const totalAmount = document.createElement('span');
  totalAmount.className = 'cart-total__amount';
  totalAmount.textContent = `¥${amount.toLocaleString()}`;

  const totalCount = document.createElement('span');
  totalCount.className = 'cart-total__count';
  totalCount.textContent = `${count}点`;

  totalRight.appendChild(totalAmount);
  totalRight.appendChild(totalCount);
  total.appendChild(totalLabel);
  total.appendChild(totalRight);

  const checkoutBtn = document.createElement('button');
  checkoutBtn.className = 'cart-checkout-btn';
  checkoutBtn.type = 'button';
  checkoutBtn.textContent = '申し込む';
  checkoutBtn.addEventListener('click', () => {
    closeCartModal();
    openCheckoutModal();
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'cart-clear-btn';
  clearBtn.type = 'button';
  clearBtn.textContent = 'カートをクリア';
  clearBtn.addEventListener('click', clearCart);

  foot.appendChild(total);
  foot.appendChild(checkoutBtn);
  foot.appendChild(clearBtn);
}

// -- チェックアウトモーダル --

let _memberJwt = null;

async function initLineSDK() {
  // MEMBER_APP_URLが設定されていない場合はスキップ
  if (!MEMBER_APP_URL || MEMBER_APP_URL.startsWith('<')) return;

  try {
    // SDKを動的ロード
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${MEMBER_APP_URL}/sdk.js`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    recore.member.init({ origin: MEMBER_APP_URL });

    if (recore.member.embedded()) {
      const member = await recore.member.message('member');
      const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      fill('co_last_name', member.last_name);
      fill('co_first_name', member.first_name);
      fill('co_tel', member.tel);
      fill('co_email', member.email);
    }
  } catch {
    // SDK未設定またはLINE外ブラウザの場合は無視
  }
}

function validateAndRefreshCartPrices() {
  const params = new URLSearchParams(location.search);
  const isTestPriceChange = params.get('testMode') === '1' && params.get('testPriceChange') === '1';

  // testPriceChange=1 のとき：カート内価格を意図的にズラしてバグ再現をシミュレート
  if (isTestPriceChange && cart.length > 0) {
    for (const item of cart) {
      item.price = item.price + 100;
    }
    saveCart();
  }

  const changed = [];
  for (const item of cart) {
    const currentItem = allData[item.category]?.items?.find(d => d.model === item.model);
    if (!currentItem) continue;
    const rawPrice = item.shrinkType === 'shrink' ? currentItem.shrink : currentItem.noshrink;
    const currentPrice = parseInt(String(rawPrice || '0').replace(/[^0-9]/g, ''), 10) || 0;
    if (currentPrice > 0 && currentPrice !== item.price) {
      changed.push({ name: item.name, model: item.model, oldPrice: item.price, newPrice: currentPrice });
      item.price = currentPrice;
    }
  }
  if (changed.length > 0) saveCart();
  return changed;
}

function openCheckoutModal() {
  const el = document.getElementById('checkoutModal');
  if (!el) return;

  // 価格の再検証
  const changed = validateAndRefreshCartPrices();

  // フォームをリセット
  const form = document.getElementById('checkoutForm');
  const done = document.getElementById('checkoutDone');
  const errEl = document.getElementById('checkoutError');
  const submitBtn = document.getElementById('checkoutSubmit');
  if (form) form.hidden = false;
  if (done) done.hidden = true;
  if (submitBtn) submitBtn.disabled = false;

  // 価格変動があれば警告を表示
  if (errEl) {
    if (changed.length > 0) {
      const lines = changed.map(c =>
        `・${c.name}（${c.model}）: ¥${c.oldPrice.toLocaleString()} → ¥${c.newPrice.toLocaleString()}`
      );
      errEl.textContent = `⚠️ 以下の商品の買取価格が更新されました。最新価格に自動修正しました。\n${lines.join('\n')}`;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
    }
  }

  renderCheckoutPreview();

  el.hidden = false;
  setModalOpen(true);
}

function closeCheckoutModal() {
  const el = document.getElementById('checkoutModal');
  if (el) el.hidden = true;
  setModalOpen(false);
}

function openTermsModal() {
  // バリデーションを先に実行（エラーがあれば利用規約を開かない）
  const errEl = document.getElementById('checkoutError');
  const lastName = (document.getElementById('co_last_name')?.value || '').trim();
  const firstName = (document.getElementById('co_first_name')?.value || '').trim();
  const tel = (document.getElementById('co_tel')?.value || '').trim();
  const errors = [];
  if (!lastName) errors.push('氏名（姓）を入力してください');
  if (!firstName) errors.push('氏名（名）を入力してください');
  if (!tel) errors.push('電話番号を入力してください');
  if (errors.length > 0) {
    if (errEl) { errEl.textContent = errors.join('\n'); errEl.hidden = false; }
    return;
  }
  if (errEl) errEl.hidden = true;

  const el = document.getElementById('termsModal');
  if (el) el.hidden = false;
}

function closeTermsModal() {
  const el = document.getElementById('termsModal');
  if (el) el.hidden = true;
}

function renderCheckoutPreview() {
  const el = document.getElementById('checkoutCartPreview');
  if (!el) return;
  el.innerHTML = '';
  if (cart.length === 0) return;

  const wrap = document.createElement('div');
  wrap.className = 'checkout-preview';

  const title = document.createElement('div');
  title.className = 'checkout-preview__title';
  title.textContent = '申込商品';
  wrap.appendChild(title);

  for (const item of cart) {
    const row = document.createElement('div');
    row.className = 'checkout-preview__item';
    const subtotal = item.price * item.quantity;
    row.textContent = `${item.name}${item.model ? ` (${item.model})` : ''} ${item.shrinkLabel} × ${item.quantity}点  ¥${subtotal.toLocaleString()}`;
    wrap.appendChild(row);
  }

  const { count, amount } = getCartSummary();
  const total = document.createElement('div');
  total.className = 'checkout-preview__total';
  total.textContent = `合計 ${count}点 / ¥${amount.toLocaleString()}`;
  wrap.appendChild(total);

  el.appendChild(wrap);
}

function sendReceiptEmail({ email, name, receptionId, snapshot }) {
  if (!email) return;
  const totalBoxes = snapshot.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = snapshot.reduce((s, c) => s + c.price * c.quantity, 0);
  fetch('/api/send-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, receptionId, items: snapshot, totalBoxes, totalAmount }),
  }).catch(() => { /* メール送信失敗は無視 */ });
}

async function submitCheckout() {
  const errEl = document.getElementById('checkoutError');
  const submitBtn = document.getElementById('checkoutSubmit');

  const isTestMode = new URLSearchParams(location.search).get('testMode') === '1';

  // テストモード：未入力項目をダミーデータで補完してからバリデーションへ
  if (isTestMode) {
    const elLast = document.getElementById('co_last_name');
    const elFirst = document.getElementById('co_first_name');
    const elTel = document.getElementById('co_tel');
    if (elLast && !elLast.value.trim()) elLast.value = 'テスト';
    if (elFirst && !elFirst.value.trim()) elFirst.value = '太郎';
    if (elTel && !elTel.value.trim()) elTel.value = '09000000000';
  }

  let lastName = (document.getElementById('co_last_name')?.value || '').trim();
  let firstName = (document.getElementById('co_first_name')?.value || '').trim();
  let tel = (document.getElementById('co_tel')?.value || '').trim();
  const email = (document.getElementById('co_email')?.value || '').trim();
  const extraComment = (document.getElementById('co_comment')?.value || '').trim();

  // バリデーション（テストモードはスキップ）
  if (!isTestMode) {
    const errors = [];
    if (!lastName) errors.push('氏名（姓）を入力してください');
    if (!firstName) errors.push('氏名（名）を入力してください');
    if (!tel) {
      errors.push('電話番号を入力してください');
    } else if (!/(?:^0[0-9]{9,10}$)|(?:^0[0-9]{1,3}-[0-9]{2,4}-[0-9]{3,4}$)/.test(tel)) {
      errors.push('電話番号の形式が正しくありません');
    }

    if (errors.length > 0) {
      if (errEl) { errEl.textContent = errors.join('\n'); errEl.hidden = false; }
      document.getElementById('checkoutModal')?.querySelector('.checkout-modal__body')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  }

  if (errEl) errEl.hidden = true;
  if (submitBtn) submitBtn.disabled = true;

  // LINE SDK から JWT 取得（設定済みかつ組み込みの場合）
  try {
    if (MEMBER_APP_URL && !MEMBER_APP_URL.startsWith('<') && typeof recore !== 'undefined' && recore.member.embedded()) {
      _memberJwt = await recore.member.message('jwt');
    }
  } catch { /* ignore */ }

  // ペイロード構築
  const comment = buildCommentText(extraComment);
  const payload = {
    is_pickup: false,
    last_name: lastName,
    first_name: firstName,
    tel,
    message_channel: 'LINE',
    comment,
  };
  if (email) payload.email = email;
  if (_memberJwt) payload.member_jwt = _memberJwt;

  // テストモード（?testMode=1）：APIをスキップして完了画面を表示
  if (isTestMode) {
    const snapshot = cart.map(c => ({ ...c }));
    clearCart();
    renderReceipt(snapshot, { reception_id: 'TEST01' });
    sendReceiptEmail({ email, name: `${lastName} ${firstName}`, receptionId: 'TEST01', snapshot });
    const form = document.getElementById('checkoutForm');
    const done = document.getElementById('checkoutDone');
    if (form) form.hidden = true;
    if (done) done.hidden = false;
    return;
  }

  // Recore API 送信
  try {
    const res = await fetch('https://co-api.recore-pos.com/bad/offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Identification': RECORE_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (res.ok) {
      const snapshot = cart.map(c => ({ ...c }));
      clearCart();
      renderReceipt(snapshot, data);
      sendReceiptEmail({ email, name: `${lastName} ${firstName}`, receptionId: data?.reception_id || data?.offer_id || data?.id || null, snapshot });
      const form = document.getElementById('checkoutForm');
      const done = document.getElementById('checkoutDone');
      if (form) form.hidden = true;
      if (done) done.hidden = false;
    } else {
      const msg = data?.error?.message || `エラーが発生しました (${res.status})`;
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      if (submitBtn) submitBtn.disabled = false;
    }
  } catch {
    if (errEl) {
      errEl.textContent = 'ネットワークエラーが発生しました。しばらく経ってから再度お試しください。';
      errEl.hidden = false;
    }
    if (submitBtn) submitBtn.disabled = false;
  }
}

function renderReceipt(snapshot, apiData) {
  // 受付ID（Recore接続後はapiDataから取得、それまでは非表示）
  const receptionId = apiData?.reception_id || apiData?.offer_id || apiData?.id || null;
  document.querySelectorAll('#receiptId, .receipt__id-inline').forEach(el => {
    el.textContent = receptionId || '（LINEにてお送りします）';
  });

  // 商品行
  const tbody = document.getElementById('receiptTbody');
  if (tbody) {
    tbody.innerHTML = '';
    for (const item of snapshot) {
      const sub = item.price * item.quantity;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.name}${item.model ? `<span class="receipt__model">（${item.model}）</span>` : ''}<br><small>${item.shrinkLabel}</small></td>
        <td class="receipt__td-num">${item.quantity}箱</td>
        <td class="receipt__td-num">¥${item.price.toLocaleString()}</td>
        <td class="receipt__td-num">¥${sub.toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // 合計
  const totalBoxes = snapshot.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = snapshot.reduce((s, c) => s + c.price * c.quantity, 0);
  const totalsEl = document.getElementById('receiptTotals');
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="receipt__total-row">合計箱数：<strong>${totalBoxes}箱</strong></div>
      <div class="receipt__total-row">合計金額：<strong>¥${totalAmount.toLocaleString()}</strong></div>
      <div class="receipt__total-row">減額合計：<strong>¥0</strong></div>
      <div class="receipt__total-row receipt__total-row--final">最終買取金額：<strong>¥${totalAmount.toLocaleString()}</strong></div>
    `;
  }
}

// -- カートイベントの登録 --

function wireCart() {
  // ヘッダーカートボタン
  document.getElementById('cartHeaderBtn')?.addEventListener('click', openCartModal);

  // カートモーダル
  document.getElementById('cartModalBd')?.addEventListener('click', closeCartModal);
  document.getElementById('cartModalClose')?.addEventListener('click', closeCartModal);

  // シュリンク選択
  document.getElementById('shrinkSelectorBd')?.addEventListener('click', closeShrinkSelector);
  document.getElementById('shrinkSelectorCancel')?.addEventListener('click', closeShrinkSelector);

  document.getElementById('shrinkShrinkBtn')?.addEventListener('click', () => {
    if (_pendingItem && _pendingCategory) addToCart(_pendingItem, _pendingCategory, 'shrink');
    closeShrinkSelector();
  });

  document.getElementById('shrinkNoshrinkBtn')?.addEventListener('click', () => {
    if (_pendingItem && _pendingCategory) addToCart(_pendingItem, _pendingCategory, 'noshrink');
    closeShrinkSelector();
  });

  // チェックアウトモーダル
  document.getElementById('checkoutModalBd')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutModalClose')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutSubmit')?.addEventListener('click', openTermsModal);
  document.getElementById('termsModalBd')?.addEventListener('click', closeTermsModal);
  document.getElementById('termsModalClose')?.addEventListener('click', closeTermsModal);
  document.getElementById('termsDeclineBtn')?.addEventListener('click', closeTermsModal);
  document.getElementById('termsAgreeBtn')?.addEventListener('click', () => {
    closeTermsModal();
    submitCheckout();
  });
  document.getElementById('checkoutDoneClose')?.addEventListener('click', closeCheckoutModal);

  // バッジ初期化
  updateCartBadge();

  // LINE SDK 初期化
  initLineSDK();
}

wire();
wireCart();
loadAllData();

// ===== AIチャットウィジェット =====

const CHAT_QUICK_REPLIES = [
  '申込の流れを教えて',
  '価格はどこで見られる？',
  'シュリンクなしでも買取できる？',
  '箱とカートンの違いは？',
  '複数まとめて申し込める？',
];

let chatHistory = []; // { role: 'user'|'assistant', content: string }
let chatOpen = false;
let chatWelcomed = false;

function openChat() {
  chatOpen = true;
  const panel = document.getElementById('chatPanel');
  const toggle = document.getElementById('chatToggle');
  if (panel) panel.hidden = false;
  toggle?.querySelector('.chat-toggle__icon--open')?.setAttribute('hidden', '');
  toggle?.querySelector('.chat-toggle__icon--close')?.removeAttribute('hidden');

  if (!chatWelcomed) {
    chatWelcomed = true;
    appendChatMessage('assistant', 'こんにちは！にこにこ買取のAIアシスタントです😊\n申込方法・価格・商品の探し方など、お気軽にご質問ください。');
    renderQuickReplies();
  }

  document.getElementById('chatMessages')?.scrollTo({ top: 9999, behavior: 'smooth' });
  setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
}

function closeChat() {
  chatOpen = false;
  const panel = document.getElementById('chatPanel');
  const toggle = document.getElementById('chatToggle');
  if (panel) panel.hidden = true;
  toggle?.querySelector('.chat-toggle__icon--open')?.removeAttribute('hidden');
  toggle?.querySelector('.chat-toggle__icon--close')?.setAttribute('hidden', '');
}

function appendChatMessage(role, text) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble--${role}`;

  // 改行をそのまま表示
  const p = document.createElement('div');
  p.className = 'chat-bubble__text';
  p.textContent = text;

  bubble.appendChild(p);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function appendTypingIndicator() {
  const messages = document.getElementById('chatMessages');
  if (!messages) return null;
  const el = document.createElement('div');
  el.className = 'chat-bubble chat-bubble--assistant chat-bubble--typing';
  el.id = 'chatTyping';
  el.innerHTML = '<span></span><span></span><span></span>';
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function renderQuickReplies() {
  const el = document.getElementById('chatQuickReplies');
  if (!el) return;
  el.innerHTML = '';
  for (const q of CHAT_QUICK_REPLIES) {
    const btn = document.createElement('button');
    btn.className = 'chat-quick-btn';
    btn.type = 'button';
    btn.textContent = q;
    btn.addEventListener('click', () => {
      el.innerHTML = '';
      sendChatMessage(q);
    });
    el.appendChild(btn);
  }
}

async function sendChatMessage(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;

  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  if (input) input.value = '';
  if (sendBtn) sendBtn.disabled = true;

  appendChatMessage('user', trimmed);
  chatHistory.push({ role: 'user', content: trimmed });

  const typing = appendTypingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    typing?.remove();
    const reply = data.message || data.error || 'うまく回答できませんでした。';
    appendChatMessage('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch {
    typing?.remove();
    appendChatMessage('assistant', 'ネットワークエラーが発生しました。もう一度お試しください。');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (input) { input.style.height = 'auto'; input.focus(); }
  }
}

function wireChat() {
  document.getElementById('chatToggle')?.addEventListener('click', () => {
    chatOpen ? closeChat() : openChat();
  });
  document.getElementById('chatClose')?.addEventListener('click', closeChat);

  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');

  sendBtn?.addEventListener('click', () => sendChatMessage(input?.value));

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(input.value);
    }
  });

  // テキストエリアの高さ自動調整
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

wireChat();

// テストモードバナー
if (new URLSearchParams(location.search).get('testMode') === '1') {
  const banner = document.getElementById('testModeBanner');
  if (banner) banner.hidden = false;
}
