// js/lista.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openSheet, toast }              from './ui.js';

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

let _all = [], _filtered = [], _page = 0, _filterBar = null;
let _rawAll = []; // productos originales de la BD sin editOvr

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
  const counts  = JSON.parse(localStorage.getItem('ic') || '{}');
  const counted = counts[p.ref]?.qty;
  const edited  = editOvr[p.ref] && Object.keys(editOvr[p.ref]).length > 0;
  return `
    <div class="prod-item" data-ref="${p.ref}">
      <div class="prod-avatar" style="${edited ? 'background:linear-gradient(135deg,var(--amber),#FF9F0A)' : ''}">
        ${(p.family || '?').slice(0, 2).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div class="prod-name">${p.name}</div>
        <div class="prod-meta">${p.ref} · ${p.proxium || ''}</div>
      </div>
      ${counted != null
        ? `<div class="prod-qty-badge">${counted}<small>contado</small></div>`
        : `<div class="prod-price">${p.pvp ? p.pvp.toFixed(2) + '€' : '—'}</div>`}
    </div>`;
}

function openProductSheet(ref) {
  const p = _all.find(x => x.ref === ref);
  if (!p) return;
  const counts  = JSON.parse(localStorage.getItem('ic') || '{}');
  const orders  = JSON.parse(localStorage.getItem('io') || '{}');
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const hasEdits = editOvr[ref] && Object.keys(editOvr[ref]).length > 0;

  openSheet(`
    <div class="qty-sheet-product">
      <div class="prod-avatar" style="${hasEdits ? 'background:linear-gradient(135deg,var(--amber),#FF9F0A)' : ''}">
        ${(p.family || '?').slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div class="qty-sheet-name">${p.name}</div>
        <div class="qty-sheet-meta">${p.ref} · ${p.family}</div>
        <div class="qty-sheet-ean">EAN ${p.ean || '—'} · PROXIUM ${p.proxium || '—'}</div>
      </div>
    </div>
    <div style="background:var(--surface2);border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text3);font-size:0.72rem">PVP</span>
        <span style="font-weight:700;color:var(--green)">${p.pvp != null ? p.pvp.toFixed(2) + '€' : '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text3);font-size:0.72rem">Coste</span>
        <span style="font-weight:700">${p.cost != null ? p.cost.toFixed(2) + '€' : '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text3);font-size:0.72rem">IVA</span>
        <span style="font-weight:700">${p.iva != null ? p.iva + '%' : '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text3);font-size:0.72rem">Contado</span>
        <span style="font-weight:700">${counts[ref]?.qty ?? '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:var(--text3);font-size:0.72rem">En pedido</span>
        <span style="font-weight:700">${orders[ref] ?? '—'}</span>
      </div>
    </div>
    ${hasEdits ? `<div style="background:rgba(255,159,10,0.1);border:1px solid rgba(255,159,10,0.3);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:0.7rem;color:var(--amber)">✏️ Este artículo tiene modificaciones locales</div>` : ''}
    <button id="btn-edit-prod" style="width:100%;background:var(--surface2);border-radius:12px;padding:12px;color:var(--text2);font-size:0.82rem;font-weight:600">
      ✏️ Editar artículo
    </button>
  `);

  document.getElementById('btn-edit-prod').onclick = () => openEditSheet(ref);
}

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
