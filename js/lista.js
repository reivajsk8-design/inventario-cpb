// js/lista.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openSheet, closeSheet, toast }  from './ui.js';
import { getExtraEans, isLocalEan, assignEan, removeLocalEan,
         countPending, clearPendingEans, exportEansJSON } from './eans.js';

const PAGE = 50;
const EDIT_FIELDS = [
  { key: 'name',    label: 'Nombre',                type: 'text'   },
  { key: 'ean',     label: 'EAN',                   type: 'text'   },
  { key: 'family',  label: 'Familia',               type: 'text'   },
  { key: 'proxium', label: 'Ref. Proveedor',           type: 'text' },
  { key: 'pvp',     label: 'PVP (€)',               type: 'number' },
  { key: 'cost',    label: 'Coste (€)',             type: 'number' },
  { key: 'iva',     label: 'IVA (%)',               type: 'number' },
];

const QUICK_C    = [1, 5, 10, 20];
const QUICK_P    = [6, 12, 24, 48];

function getNewArticles() {
  return Object.values(JSON.parse(localStorage.getItem('ia') || '{}'));
}

let _all = [], _filtered = [], _page = 0, _filterBar = null;
let _rawAll = [];

function getCounts() { return JSON.parse(localStorage.getItem('ic') || '{}'); }
function saveCounts(c) { localStorage.setItem('ic', JSON.stringify(c)); }
function getOrders()  { return JSON.parse(localStorage.getItem('io') || '{}'); }
function saveOrders(o){ localStorage.setItem('io', JSON.stringify(o)); }
function getZona()    { return localStorage.getItem('ic_zona') || 'almacen'; }
function setZona(z)   { localStorage.setItem('ic_zona', z); }
function totalQty(c) {
  if (!c) return 0;
  if ('almacen' in c || 'tienda' in c) return (c.almacen || 0) + (c.tienda || 0);
  return c.qty || 0;
}

export async function mount() {
  _rawAll = await getAllProducts();
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const newArts = getNewArticles();
  _all = [..._rawAll, ...newArts].map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);

  const families = await getFamilies();
  _filterBar = mountFilterBar(families, ({ query, filterType, families: fams }) => {
    _filtered = filterProducts(_all, query, filterType, fams);
    _page = 0;
    renderList();
  });

  _filtered = [..._all];
  renderList();
}

export function unmount() {
  if (_filterBar) _filterBar.hide();
}

const _FAB = `<button id="fab-new-art" style="
  position:fixed;bottom:calc(72px + env(safe-area-inset-bottom));right:20px;
  width:56px;height:56px;border-radius:50%;
  background:var(--accent);color:#fff;font-size:1.8rem;font-weight:300;
  box-shadow:0 4px 20px rgba(10,132,255,0.4);
  display:flex;align-items:center;justify-content:center;z-index:20">+</button>`;

function renderList() {
  const main  = document.getElementById('main');
  const items = _filtered.slice(0, (_page + 1) * PAGE);
  const more  = _filtered.length > items.length;

  const pending = countPending();
  const pendingBanner = pending > 0 ? `
    <div style="margin:8px 12px 4px;padding:10px 14px;border-radius:12px;
      background:rgba(255,159,10,0.12);border:1px solid rgba(255,159,10,0.3);
      display:flex;align-items:center;gap:10px">
      <span style="font-size:0.78rem;color:var(--amber);flex:1">
        📋 ${pending} EAN${pending > 1 ? 's' : ''} asignado${pending > 1 ? 's' : ''} sin publicar
      </span>
      <button id="btn-export-eans" style="padding:6px 12px;border-radius:8px;
        background:var(--amber);color:#000;font-size:0.72rem;font-weight:700">
        ⬇ Exportar
      </button>
      <button id="btn-clear-eans" style="padding:6px 10px;border-radius:8px;
        background:rgba(255,69,58,0.15);color:var(--red);font-size:0.72rem;font-weight:700"
        title="Limpiar asignaciones locales">🗑</button>
    </div>` : '';

  if (items.length === 0) {
    main.innerHTML = `${pendingBanner}<div class="empty-state"><div class="icon">🔍</div><p>Sin resultados</p></div>${_FAB}`;
    document.getElementById('fab-new-art').addEventListener('click', openNewArticleSheet);
    bindPendingBanner();
    return;
  }

  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  main.innerHTML = `${pendingBanner}<div class="prod-list">${items.map(p => prodHTML(p, editOvr)).join('')}${
    more
      ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">
           Ver más (${_filtered.length - items.length})
         </button>`
      : ''
  }</div>${_FAB}`;

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click',       () => openProductSheet(el.dataset.ref));
    el.addEventListener('contextmenu', e => { e.preventDefault(); openEditSheet(el.dataset.ref); });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
  document.getElementById('fab-new-art').addEventListener('click', openNewArticleSheet);
  bindPendingBanner();
}

function bindPendingBanner() {
  document.getElementById('btn-export-eans')?.addEventListener('click', () => {
    const json = exportEansJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'eans-extra.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('eans-extra.json descargado — súbelo al repo y haz deploy', 'green');
  });
  document.getElementById('btn-clear-eans')?.addEventListener('click', () => {
    clearPendingEans();
    renderList();
    toast('Asignaciones locales eliminadas', 'amber');
  });
}

const PERF_TYPE = {
  EDP: { bg: 'rgba(191,90,242,0.18)',  color: '#BF5AF2', emoji: '🌸' },
  EDT: { bg: 'rgba(100,210,255,0.18)', color: '#64D2FF', emoji: '💨' },
  EDC: { bg: 'rgba(90,200,250,0.18)',  color: '#5AC8FA', emoji: '💦' },
  ECS: { bg: 'rgba(90,200,250,0.18)',  color: '#5AC8FA', emoji: '💦' },
  SET: { bg: 'rgba(255,214,10,0.18)',  color: '#FFD60A', emoji: '🎁' },
};

function parsePerfume(name) {
  if (!name) return null;
  const ml   = name.match(/\b(\d+)\s*ML\b/i);
  const tipo = name.match(/\b(EDP|EDT|EDC|ECS|SET)\b/i);
  if (!ml && !tipo) return null;
  return { ml: ml ? +ml[1] : null, tipo: tipo ? tipo[1].toUpperCase() : null };
}

function perfumeBadges(perf) {
  if (!perf) return '';
  const parts = [];
  if (perf.tipo) {
    const c = PERF_TYPE[perf.tipo] || { bg: 'rgba(191,90,242,0.18)', color: '#BF5AF2', emoji: '✨' };
    parts.push(`<span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:6px;
      background:${c.bg};color:${c.color};white-space:nowrap">${c.emoji} ${perf.tipo}</span>`);
  }
  if (perf.ml) {
    parts.push(`<span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:6px;
      background:rgba(191,90,242,0.12);color:#BF5AF2;white-space:nowrap">💧 ${perf.ml}ml</span>`);
  }
  return parts.length
    ? `<div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">${parts.join('')}</div>`
    : '';
}

function parseGramos(name) {
  if (!name) return null;
  const m = name.match(/\b(\d+(?:[.,]\d+)?)\s*(KGS?|GRS?|G)\b/i);
  if (!m) return null;
  return { val: parseFloat(m[1].replace(',', '.')), unit: m[2].toUpperCase().startsWith('K') ? 'kg' : 'gr' };
}

function gramosBadge(g) {
  if (!g) return '';
  return `
    <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">
      <span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:6px;
        background:rgba(162,132,94,0.18);color:#A2845E;white-space:nowrap">
        ⚖️ ${g.val}${g.unit}
      </span>
    </div>`;
}

function parseAlcohol(name) {
  const m = name?.match(/\b(\d+)\/(\d+)\/(\d+(?:[.,]\d+)?)\b/);
  if (!m) return null;
  return { btls: +m[1], cl: +m[2], deg: parseFloat(m[3].replace(',', '.')) };
}

function alcoholBadges(alc) {
  if (!alc) return '';
  return `
    <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">
      <span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:6px;
        background:rgba(52,199,89,0.15);color:#30D158;white-space:nowrap">
        📦 ${alc.btls} bt/caja
      </span>
      <span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:6px;
        background:rgba(255,159,10,0.15);color:#FF9F0A;white-space:nowrap">
        🥃 ${alc.cl}cl
      </span>
      <span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:6px;
        background:rgba(255,69,58,0.15);color:#FF453A;white-space:nowrap">
        🌡 ${alc.deg}°
      </span>
    </div>`;
}

function prodHTML(p, editOvr) {
  const counts  = getCounts();
  const orders  = getOrders();
  const counted = counts[p.ref] ? (totalQty(counts[p.ref]) || null) : null;
  const ordered = (orders[p.ref] || 0) > 0 ? orders[p.ref] : null;
  const edited  = editOvr[p.ref] && Object.keys(editOvr[p.ref]).length > 0;
  const alc     = parseAlcohol(p.name);
  const perf    = parsePerfume(p.name);
  const gramos  = parseGramos(p.name);
  const isNew   = !!p.isNew;

  let badge;
  if (counted != null) {
    badge = `<div class="prod-qty-badge" style="color:var(--green)">${counted}<small>cto${ordered != null ? ' · ' + ordered + 'p' : ''}</small></div>`;
  } else if (ordered != null) {
    badge = `<div class="prod-qty-badge">${ordered}<small>pedido</small></div>`;
  } else {
    badge = `<div class="prod-price">${p.pvp ? Number(p.pvp).toFixed(2) + '€' : '—'}</div>`;
  }

  return `
    <div class="prod-item" data-ref="${p.ref}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px">
          ${isNew
            ? `<span class="prod-tag" style="background:rgba(255,159,10,0.2);color:#FF9F0A">✦ ${p.ref}</span>`
            : `<span class="prod-tag ${edited ? 'tag-edited' : 'tag-ref'}">${p.ref}</span>`}
          ${p.proxium && p.proxium !== p.ref ? `<span class="prod-tag tag-proxium">${p.proxium}</span>` : ''}
          <div class="prod-name" style="flex:1;min-width:80px">${p.name}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${p.family ? `<span class="prod-tag tag-family">${p.family}</span>` : ''}
          ${[p.ean, ...getExtraEans(p.ref)].filter(Boolean).map(e =>
            `<span style="font-size:0.6rem;color:var(--text3)">▪ ${e}</span>`
          ).join('')}
        </div>
        ${alcoholBadges(alc)}
        ${perfumeBadges(perf)}
        ${gramosBadge(gramos)}
      </div>
      ${badge}
    </div>`;
}

// ── Hoja de acción principal (añadir a conteo o pedido) ──────────────
function openProductSheet(ref) {
  const p = _all.find(x => x.ref === ref);
  if (!p) return;

  let _mode = localStorage.getItem('il_mode') || 'conteo';

  function render(mode) {
    const counts   = getCounts();
    const orders   = getOrders();
    const editOvr  = JSON.parse(localStorage.getItem('ie') || '{}');
    const hasEdits = editOvr[ref] && Object.keys(editOvr[ref]).length > 0;
    const curCount = totalQty(counts[ref]) || null;
    const curOrder = (orders[ref] || 0) > 0 ? orders[ref] : null;

    openSheet(`
      <div class="qty-sheet-product">
        <div class="prod-avatar"${hasEdits ? ' style="background:linear-gradient(135deg,var(--amber),#FF9F0A)"' : ''}>
          ${(p.family || '?').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div class="qty-sheet-name">${p.name}</div>
          <div class="qty-sheet-meta">${p.ref}${p.family ? ' · ' + p.family : ''}</div>
          ${p.ean ? `<div class="qty-sheet-ean">EAN ${p.ean}${p.proxium ? ' · Ref.Prov. ' + p.proxium : ''}</div>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <button id="mode-c" style="padding:11px;border-radius:12px;font-size:0.8rem;font-weight:700;
          background:${mode === 'conteo' ? 'rgba(48,209,88,0.15)' : 'var(--surface2)'};
          color:${mode === 'conteo' ? 'var(--green)' : 'var(--text3)'};
          border:2px solid ${mode === 'conteo' ? 'var(--green)' : 'transparent'}">
          🔢 Conteo${curCount != null ? ' (' + curCount + ')' : ''}
        </button>
        <button id="mode-p" style="padding:11px;border-radius:12px;font-size:0.8rem;font-weight:700;
          background:${mode === 'pedido' ? 'rgba(10,132,255,0.15)' : 'var(--surface2)'};
          color:${mode === 'pedido' ? 'var(--accent)' : 'var(--text3)'};
          border:2px solid ${mode === 'pedido' ? 'var(--accent)' : 'transparent'}">
          🛒 Pedido${curOrder != null ? ' (' + curOrder + ')' : ''}
        </button>
      </div>

      ${mode === 'conteo' ? `
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button id="zona-alm" style="flex:1;padding:8px;border-radius:20px;font-size:0.78rem;font-weight:700;
          background:${getZona()==='almacen' ? 'var(--accent)' : 'var(--surface2)'};
          color:${getZona()==='almacen' ? '#fff' : 'var(--text3)'}">🏪 Almacén</button>
        <button id="zona-tie" style="flex:1;padding:8px;border-radius:20px;font-size:0.78rem;font-weight:700;
          background:${getZona()==='tienda' ? 'var(--accent)' : 'var(--surface2)'};
          color:${getZona()==='tienda' ? '#fff' : 'var(--text3)'}">🏬 Tienda</button>
      </div>` : ''}
      <div class="qty-label" style="margin-bottom:8px">
        ${mode === 'conteo' ? 'Añadir al conteo' : 'Añadir al pedido'}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
        ${(mode === 'conteo' ? QUICK_C : QUICK_P).map(n => `
          <button class="quick-qty" data-n="${n}"
            style="padding:10px 0;border-radius:10px;font-size:0.82rem;font-weight:700;
                   background:var(--surface2);color:var(--text2)">×${n}</button>`).join('')}
      </div>
      <input id="inp-qty" type="number" min="1" placeholder="Otra cantidad…"
        style="width:100%;background:var(--surface2);border-radius:12px;padding:11px 14px;
               color:var(--text);font-size:1rem;text-align:center;margin-bottom:16px">

      <button id="btn-add" style="width:100%;padding:14px;border-radius:14px;
        background:${mode === 'conteo' ? 'var(--green)' : 'var(--accent)'};
        color:#fff;font-size:0.9rem;font-weight:800;margin-bottom:10px">
        ${mode === 'conteo' ? '➕ Añadir al conteo' : '🛒 Añadir al pedido'}
      </button>
      <button id="btn-edit-link" style="width:100%;padding:10px;border-radius:12px;
        background:var(--surface2);color:var(--text3);font-size:0.78rem;font-weight:600">
        ✏️ Editar artículo
      </button>
    `);

    document.getElementById('mode-c').addEventListener('click', () => {
      _mode = 'conteo'; localStorage.setItem('il_mode', _mode); render(_mode);
    });
    document.getElementById('mode-p').addEventListener('click', () => {
      _mode = 'pedido'; localStorage.setItem('il_mode', _mode); render(_mode);
    });

    if (mode === 'conteo') {
      const zonaAlm = document.getElementById('zona-alm');
      const zonaTie = document.getElementById('zona-tie');
      const updateZonaBtns = (zona) => {
        zonaAlm.style.background = zona === 'almacen' ? 'var(--accent)' : 'var(--surface2)';
        zonaAlm.style.color      = zona === 'almacen' ? '#fff' : 'var(--text3)';
        zonaTie.style.background = zona === 'tienda'  ? 'var(--accent)' : 'var(--surface2)';
        zonaTie.style.color      = zona === 'tienda'  ? '#fff' : 'var(--text3)';
      };
      zonaAlm.addEventListener('click', () => { setZona('almacen'); updateZonaBtns('almacen'); });
      zonaTie.addEventListener('click', () => { setZona('tienda');  updateZonaBtns('tienda');  });
    }

    document.querySelectorAll('.quick-qty').forEach(btn => {
      btn.addEventListener('click', () => doAdd(parseInt(btn.dataset.n)));
    });

    document.getElementById('btn-add').addEventListener('click', () => {
      const v = parseInt(document.getElementById('inp-qty').value);
      if (!v || v <= 0) { toast('Introduce una cantidad', 'red'); return; }
      doAdd(v);
    });

    document.getElementById('btn-edit-link').addEventListener('click', () => openEditSheet(ref));
  }

  function doAdd(qty) {
    if (_mode === 'conteo') {
      const counts = getCounts();
      const zona   = getZona();
      const c      = counts[ref] || { almacen: 0, tienda: 0, notes: '' };
      if ('qty' in c && !('almacen' in c)) {
        c.almacen = c.qty || 0; c.tienda = 0; delete c.qty;
      }
      c[zona] = (c[zona] || 0) + qty;
      counts[ref] = c;
      saveCounts(counts);
      toast(`${p.name} — ${totalQty(counts[ref])} ud. en conteo`, 'green');
    } else {
      const orders = getOrders();
      orders[ref] = (orders[ref] || 0) + qty;
      saveOrders(orders);
      toast(`${p.name} — ${orders[ref]} ud. en pedido`, 'green');
    }
    closeSheet();
    renderList();
  }

  render(_mode);
}

// ── Edición de artículo ───────────────────────────────────────────────
function openEditSheet(ref) {
  const p = _rawAll.find(x => x.ref === ref) || _all.find(x => x.ref === ref);
  if (!p) return;
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const cur = { ...p, ...(editOvr[ref] || {}) };
  const hasEdits = editOvr[ref] && Object.keys(editOvr[ref]).length > 0;

  openSheet(`
    <div style="font-size:0.9rem;font-weight:700;color:var(--text);margin-bottom:4px">✏️ Editar artículo</div>
    <div style="font-size:0.65rem;color:var(--text3);margin-bottom:14px">${cur.ref}</div>
    ${EDIT_FIELDS.map(({ key, label, type }) => `
      <div style="margin-bottom:10px">
        <div class="qty-label">${label}</div>
        <input id="edit-${key}"
               type="${type}"
               step="${type === 'number' ? '0.01' : undefined}"
               style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;color:var(--text);font-size:0.85rem"
               value="${cur[key] ?? ''}">
      </div>`).join('')}
    <div style="margin-bottom:14px;padding:12px;background:var(--surface2);border-radius:12px">
      <div class="qty-label" style="margin-bottom:8px">EANs adicionales</div>
      <div id="ean-extras-list"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="inp-ean-extra" type="text" inputmode="numeric" placeholder="Nuevo EAN…"
          style="flex:1;background:var(--surface);border-radius:8px;padding:8px 10px;
                 color:var(--text);font-size:0.85rem">
        <button id="btn-add-ean-extra" style="padding:8px 16px;border-radius:8px;
          background:var(--accent);color:#fff;font-size:0.9rem;font-weight:700">+</button>
      </div>
    </div>
    <button id="btn-save-edit" class="add-btn" style="margin-bottom:10px">Guardar cambios</button>
    ${hasEdits ? `<button id="btn-reset-edit" style="width:100%;background:rgba(255,69,58,0.1);border-radius:12px;padding:11px;color:var(--red);font-size:0.78rem;font-weight:600">🗑 Deshacer todas las modificaciones</button>` : ''}
  `);

  const renderEanExtras = () => {
    const extras  = getExtraEans(ref);
    const section = document.getElementById('ean-extras-list');
    if (!section) return;
    if (extras.length === 0) {
      section.innerHTML = '<div style="font-size:0.75rem;color:var(--text3)">Sin EANs adicionales</div>';
      return;
    }
    section.innerHTML = extras.map(e => {
      const local = isLocalEan(ref, e);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="flex:1;font-size:0.78rem;font-family:monospace;color:var(--text)">${e}</span>
        <span style="font-size:0.6rem;padding:2px 6px;border-radius:4px;
          background:${local ? 'rgba(255,159,10,0.2)' : 'rgba(48,209,88,0.15)'};
          color:${local ? 'var(--amber)' : 'var(--green)'}">
          ${local ? 'local' : 'publicado'}
        </span>
        ${local ? `<button class="btn-rm-ean" data-ean="${e}" style="
          padding:3px 8px;border-radius:6px;background:rgba(255,69,58,0.12);
          color:var(--red);font-size:0.72rem;font-weight:700">✕</button>` : ''}
      </div>`;
    }).join('');
    section.querySelectorAll('.btn-rm-ean').forEach(btn => {
      btn.addEventListener('click', () => {
        removeLocalEan(ref, btn.dataset.ean);
        renderEanExtras();
        renderList();
      });
    });
  };
  renderEanExtras();

  document.getElementById('btn-add-ean-extra').addEventListener('click', () => {
    const ean = document.getElementById('inp-ean-extra').value.trim();
    if (!ean || !/^\d{8,}$/.test(ean)) { toast('EAN no válido (mínimo 8 dígitos)', 'red'); return; }
    if (cur.ean === ean || getExtraEans(ref).includes(ean)) { toast('EAN ya asignado', 'amber'); return; }
    assignEan(ref, ean);
    document.getElementById('inp-ean-extra').value = '';
    renderEanExtras();
    renderList();
    toast('EAN añadido', 'green');
  });

  document.getElementById('btn-save-edit').onclick = () => {
    const ovr = { ...(editOvr[ref] || {}) };
    EDIT_FIELDS.forEach(({ key, type }) => {
      const raw = document.getElementById('edit-' + key).value.trim();
      const v   = type === 'number' ? (parseFloat(raw) || 0) : raw;
      if (v !== p[key]) ovr[key] = v;
      else delete ovr[key];
    });
    if (Object.keys(ovr).length === 0) {
      delete editOvr[ref];
    } else {
      editOvr[ref] = ovr;
    }
    localStorage.setItem('ie', JSON.stringify(editOvr));
    const idx = _all.findIndex(x => x.ref === ref);
    if (idx >= 0) _all[idx] = { ..._rawAll.find(x => x.ref === ref), ...ovr };
    _filtered = [..._all];
    toast('Cambios guardados', 'green');
    renderList();
  };

  const btnReset = document.getElementById('btn-reset-edit');
  if (btnReset) btnReset.onclick = () => {
    delete editOvr[ref];
    localStorage.setItem('ie', JSON.stringify(editOvr));
    const orig = _rawAll.find(x => x.ref === ref);
    const idx  = _all.findIndex(x => x.ref === ref);
    if (idx >= 0 && orig) _all[idx] = { ...orig };
    _filtered = [..._all];
    toast('Modificaciones eliminadas', 'amber');
    renderList();
  };
}

// ── Crear artículo nuevo ──────────────────────────────────────────────
function openNewArticleSheet() {
  const reProx = /^([A-Za-z]+)-(\d+)$/;
  const prefixMap = new Map();
  for (const p of _all) {
    const m = (p.proxium || '').match(reProx);
    if (m) prefixMap.set(m[1], Math.max(prefixMap.get(m[1]) || 0, +m[2]));
  }
  const prefixes = [...prefixMap.keys()].sort();
  if (prefixes.length === 0) { toast('No hay prefijos PROXIUM en la BD', 'red'); return; }

  let _prefix = prefixes[0];
  const nextProxium = () => `${_prefix}-${(prefixMap.get(_prefix) || 0) + 1}`;

  openSheet(`
    <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:4px">Nuevo artículo</div>
    <div style="font-size:0.68rem;color:var(--text3);margin-bottom:14px">El código PROXIUM se asigna automáticamente según el prefijo</div>

    <div class="qty-label" style="margin-bottom:6px">PREFIJO PROXIUM</div>
    <div style="overflow-x:auto;margin-bottom:8px;margin-left:-4px;padding-left:4px">
      <div style="display:flex;gap:6px;width:max-content;padding-bottom:6px">
        ${prefixes.map(pf => `
          <button data-pf="${pf}" style="
            padding:6px 13px;border-radius:20px;font-size:0.72rem;font-weight:700;white-space:nowrap;
            background:${pf === _prefix ? 'var(--accent)' : 'var(--surface2)'};
            color:${pf === _prefix ? '#fff' : 'var(--text3)'}">
            ${pf}
          </button>`).join('')}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:0.68rem;color:var(--text3);white-space:nowrap">o escribe:</span>
      <input id="na-prefix-input" type="text" placeholder="ej. MAQ" maxlength="10"
        style="flex:1;background:var(--surface2);border-radius:8px;padding:7px 10px;
               color:var(--text);font-size:0.82rem;font-weight:700;text-transform:uppercase"
        value="${_prefix}">
    </div>
    <div id="na-proxium-preview" style="font-size:0.75rem;color:var(--accent);font-weight:800;margin-bottom:16px;padding-left:2px">
      → ${nextProxium()}
    </div>

    <div class="qty-label" style="margin-bottom:6px">NOMBRE *</div>
    <input id="na-name" type="text" placeholder="Nombre del artículo"
      style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;
             color:var(--text);font-size:0.85rem;margin-bottom:14px">

    <div class="qty-label" style="margin-bottom:6px">EAN (opcional)</div>
    <input id="na-ean" type="text" inputmode="numeric" placeholder="Código de barras"
      style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;
             color:var(--text);font-size:0.85rem;margin-bottom:14px">

    <div class="qty-label" style="margin-bottom:6px">REF. PROVEEDOR (opcional)</div>
    <input id="na-proxium-prov" type="text" placeholder="Referencia del proveedor"
      style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;
             color:var(--text);font-size:0.85rem;margin-bottom:14px">

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
      <div>
        <div class="qty-label" style="margin-bottom:6px">PVP (€)</div>
        <input id="na-pvp" type="number" inputmode="decimal" step="0.01" placeholder="0.00"
          style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;
                 color:var(--text);font-size:0.85rem">
      </div>
      <div>
        <div class="qty-label" style="margin-bottom:6px">Coste (€)</div>
        <input id="na-cost" type="number" inputmode="decimal" step="0.01" placeholder="0.00"
          style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;
                 color:var(--text);font-size:0.85rem">
      </div>
      <div>
        <div class="qty-label" style="margin-bottom:6px">IVA</div>
        <select id="na-iva"
          style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;
                 color:var(--text);font-size:0.85rem">
          <option value="21">21%</option>
          <option value="10">10%</option>
          <option value="4">4%</option>
          <option value="0">0%</option>
        </select>
      </div>
    </div>

    <button id="na-save" class="add-btn">✦ Crear artículo</button>
  `);

  const refreshChips = () => {
    document.querySelectorAll('[data-pf]').forEach(b => {
      const on = b.dataset.pf === _prefix;
      b.style.background = on ? 'var(--accent)' : 'var(--surface2)';
      b.style.color      = on ? '#fff' : 'var(--text3)';
    });
    document.getElementById('na-proxium-preview').textContent =
      _prefix ? `→ ${nextProxium()}` : '→ —';
  };

  document.querySelectorAll('[data-pf]').forEach(btn => {
    btn.addEventListener('click', () => {
      _prefix = btn.dataset.pf;
      document.getElementById('na-prefix-input').value = _prefix;
      refreshChips();
    });
  });

  document.getElementById('na-prefix-input').addEventListener('input', e => {
    _prefix = e.target.value.trim().toUpperCase();
    e.target.value = _prefix;
    // Deselect chips if text doesn't match any
    refreshChips();
  });

  document.getElementById('na-save').addEventListener('click', () => {
    const name      = document.getElementById('na-name').value.trim();
    const ean       = document.getElementById('na-ean').value.trim();
    const supplRef  = document.getElementById('na-proxium-prov').value.trim();
    const pvp       = parseFloat(document.getElementById('na-pvp').value) || 0;
    const cost      = parseFloat(document.getElementById('na-cost').value) || 0;
    const iva       = parseInt(document.getElementById('na-iva').value) || 21;

    if (!name) { toast('El nombre es obligatorio', 'red'); return; }

    const proxiumCode = nextProxium();

    if (_all.find(p => p.ref === proxiumCode)) {
      toast('Ya existe un artículo con ese código PROXIUM', 'red');
      document.getElementById('na-proxium-preview').textContent = `→ ${nextProxium()}`;
      return;
    }

    const newArt = { ref: proxiumCode, proxium: supplRef, name, family: _prefix, ean, pvp, cost, iva, isNew: true };

    const stored = JSON.parse(localStorage.getItem('ia') || '{}');
    stored[proxiumCode] = newArt;
    localStorage.setItem('ia', JSON.stringify(stored));

    prefixMap.set(_prefix, (prefixMap.get(_prefix) || 0) + 1);
    _all.push(newArt);
    _filtered = [..._all];
    closeSheet();
    toast(`${proxiumCode} creado ✓`, 'green');
    renderList();
  });
}
