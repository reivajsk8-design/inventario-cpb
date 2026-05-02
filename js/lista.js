// js/lista.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openSheet, closeSheet, toast }  from './ui.js';

const PAGE = 50;
const EDIT_FIELDS = [
  { key: 'name',    label: 'Nombre',                type: 'text'   },
  { key: 'ean',     label: 'EAN',                   type: 'text'   },
  { key: 'family',  label: 'Familia',               type: 'text'   },
  { key: 'proxium', label: 'PROXIUM (Ref. Proveedor)', type: 'text' },
  { key: 'pvp',     label: 'PVP (€)',               type: 'number' },
  { key: 'cost',    label: 'Coste (€)',             type: 'number' },
  { key: 'iva',     label: 'IVA (%)',               type: 'number' },
];

const QUICK_C    = [1, 5, 10, 20];
const QUICK_P    = [6, 12, 24, 48];

let _all = [], _filtered = [], _page = 0, _filterBar = null;
let _rawAll = [];

function getCounts() { return JSON.parse(localStorage.getItem('ic') || '{}'); }
function saveCounts(c) { localStorage.setItem('ic', JSON.stringify(c)); }
function getOrders()  { return JSON.parse(localStorage.getItem('io') || '{}'); }
function saveOrders(o){ localStorage.setItem('io', JSON.stringify(o)); }

export async function mount() {
  _rawAll = await getAllProducts();
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  _all = _rawAll.map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);

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

function renderList() {
  const main  = document.getElementById('main');
  const items = _filtered.slice(0, (_page + 1) * PAGE);
  const more  = _filtered.length > items.length;

  if (items.length === 0) {
    main.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Sin resultados</p></div>`;
    return;
  }

  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  main.innerHTML = `<div class="prod-list">${items.map(p => prodHTML(p, editOvr)).join('')}${
    more
      ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">
           Ver más (${_filtered.length - items.length})
         </button>`
      : ''
  }</div>`;

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click',       () => openProductSheet(el.dataset.ref));
    el.addEventListener('contextmenu', e => { e.preventDefault(); openEditSheet(el.dataset.ref); });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
}

function prodHTML(p, editOvr) {
  const counts  = getCounts();
  const orders  = getOrders();
  const counted = counts[p.ref]?.qty;
  const ordered = (orders[p.ref] || 0) > 0 ? orders[p.ref] : null;
  const edited  = editOvr[p.ref] && Object.keys(editOvr[p.ref]).length > 0;

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
          <span class="prod-tag ${edited ? 'tag-edited' : 'tag-ref'}">${p.ref}</span>
          ${p.proxium ? `<span class="prod-tag tag-proxium">${p.proxium}</span>` : ''}
          <div class="prod-name" style="flex:1;min-width:80px">${p.name}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${p.family ? `<span class="prod-tag tag-family">${p.family}</span>` : ''}
          ${p.ean ? `<span style="font-size:0.6rem;color:var(--text3)">▪ ${p.ean}</span>` : ''}
        </div>
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
    const curCount = counts[ref]?.qty;
    const curOrder = (orders[ref] || 0) > 0 ? orders[ref] : null;

    openSheet(`
      <div class="qty-sheet-product">
        <div class="prod-avatar"${hasEdits ? ' style="background:linear-gradient(135deg,var(--amber),#FF9F0A)"' : ''}>
          ${(p.family || '?').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div class="qty-sheet-name">${p.name}</div>
          <div class="qty-sheet-meta">${p.ref}${p.family ? ' · ' + p.family : ''}</div>
          ${p.ean ? `<div class="qty-sheet-ean">EAN ${p.ean}${p.proxium ? ' · PROXIUM ' + p.proxium : ''}</div>` : ''}
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
      counts[ref] = { qty: (counts[ref]?.qty || 0) + qty, notes: counts[ref]?.notes || '' };
      saveCounts(counts);
      toast(`${p.name} — ${counts[ref].qty} ud. en conteo`, 'green');
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
    <button id="btn-save-edit" class="add-btn" style="margin-bottom:10px">Guardar cambios</button>
    ${hasEdits ? `<button id="btn-reset-edit" style="width:100%;background:rgba(255,69,58,0.1);border-radius:12px;padding:11px;color:var(--red);font-size:0.78rem;font-weight:600">🗑 Deshacer todas las modificaciones</button>` : ''}
  `);

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
