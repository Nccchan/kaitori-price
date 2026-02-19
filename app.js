// にこにこ買取 価格表サイト

const SHEET_ID = '1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw';

const CATEGORIES = {
  pokemon: { label: 'ポケモンカード', sheetName: 'ポケモン', imageDir: 'pokemon' },
  onepiece: { label: 'ONE PIECE', sheetName: 'ワンピース', imageDir: 'onepiece' },
  dragonball: { label: 'ドラゴンボール', sheetName: 'ドラゴンボール', imageDir: 'dragonball' },
};

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

let allData = { pokemon: [], onepiece: [], dragonball: [] };
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

  for (const r of rows) {
    // このシートはA列に日付が入るため、実データはB〜E列を読む
    const name = pickCellText(r?.c?.[1]);
    const model = pickCellText(r?.c?.[2]);
    const shrink = pickCellText(r?.c?.[3]);
    const noshrink = pickCellText(r?.c?.[4]);

    const n = String(name || '').trim();
    const m = String(model || '').trim();

    if (!n || n === '商品名') continue;
    if (n.startsWith('買取価格')) continue;

    items.push({
      name: n,
      model: m,
      shrink: shrink,
      noshrink: noshrink,
    });
  }

  return items;
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

function setModalOpen(isOpen) {
  document.documentElement.classList.toggle('is-modal-open', isOpen);
  document.body.classList.toggle('is-modal-open', isOpen);
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
  const data = allData[activeCategory] || [];

  const filtered = q
    ? data.filter((it) => normalizeText(`${it.name} ${it.model}`).includes(q))
    : data;

  els.count.textContent = `${filtered.length} 件`;

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

    const a = document.createElement('div');
    a.className = 'pricebox';
    a.innerHTML = `<div class="pricebox__label">シュリンクあり</div>`;
    const av = document.createElement('div');
    av.className = 'pricebox__value' + (it.shrink ? '' : ' is-empty');
    av.textContent = it.shrink || '—';
    a.appendChild(av);

    const b = document.createElement('div');
    b.className = 'pricebox';
    b.innerHTML = `<div class="pricebox__label">シュリンクなし</div>`;
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
    postBtn.textContent = 'ポスト用';
    postBtn.addEventListener('click', () => openShare(it));
    actions.appendChild(postBtn);

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

    tr.appendChild(tdImg);
    tr.appendChild(tdName);
    tr.appendChild(tdModel);
    tr.appendChild(tdShrink);
    tr.appendChild(tdNo);

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
  return { gviz, items: toItems(gviz) };
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

    allData.pokemon = p.items;
    allData.onepiece = o.items;
    allData.dragonball = d.items;

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
    if (e.key === 'Escape' && els.shareModal && !els.shareModal.hidden) closeShare();
  });
}

wire();
loadAllData();
