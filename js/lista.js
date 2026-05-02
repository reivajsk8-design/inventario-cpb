// js/lista.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openSheet, toast }              from './ui.js';

const PAGE = 50;
let _all = [], _filtered = [], _page = 0, _filterBar = null;

export async function mount() {
  _all = await getAllProducts();
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  _all = _all.map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);

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

  main.innerHTML = `<div class="prod-list">${items.map(prodHTML).join('')}${
    more
      ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">
           Ver más (${_filtered.length - items.length})
         </button>`
      : ''
  }</div>`;

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click',      () => openProductSheet(el.dataset.ref));
    el.addEventListener('contextmenu', e => { e.preventDefault(); openEditSheet(el.dataset.ref); });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
}

function prodHTML(p) {
  const counts  = JSON.parse(localStorage.getItem('ic') || '{}');
  const counted = counts[p.ref]?.qty;
  return `
    <div class="prod-item" data-ref="${p.ref}">
      <div class="prod-avatar">${(p.family || '?').slice(0, 2).toUpperCase()}</div>
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
  const counts = JSON.parse(localStorage.getItem('ic') || '{}');
  const orders = JSON.parse(localStorage.getItem('io') || '{}');

  openSheet(`
    <div class="qty-sheet-product">
      <div class="prod-avatar">${(p.family || '?').slice(0, 2).toUpperCase()}</div>
      <div>
        <div class="qty-sheet-name">${p.name}</div>
        <div class="qty-sheet-meta">${p.ref} · ${p.family}</div>
        <div class="qty-sheet-ean">EAN ${p.ean || '—'} · PROXIUM ${p.proxium || '—'}</div>
      </div>
    </div>
    <div style="background:var(--surface2);border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text3);font-size:0.72rem">PVP</span>
        <span style="font-weight:700;color:var(--green)">${p.pvp?.toFixed(2) ?? '—'}€</span>
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
    <button id="btn-edit-prod" style="width:100%;background:var(--surface2);border-radius:12px;padding:12px;color:var(--text2);font-size:0.82rem;font-weight:600">
      ✏️ Editar producto
    </button>
  `);

  document.getElementById('btn-edit-prod').onclick = () => openEditSheet(ref);
}

function openEditSheet(ref) {
  const p = _all.find(x => x.ref === ref);
  if (!p) return;
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const cur = { ...p, ...(editOvr[ref] || {}) };

  openSheet(`
    <div style="font-size:0.9rem;font-weight:700;color:var(--text);margin-bottom:14px">Editar: ${cur.name}</div>
    ${['name', 'ean', 'proxium'].map(f => `
      <div style="margin-bottom:10px">
        <div class="qty-label">${f.toUpperCase()}</div>
        <input id="edit-${f}" style="width:100%;background:var(--surface2);border-radius:10px;padding:10px 12px;color:var(--text);font-size:0.85rem"
               value="${cur[f] || ''}">
      </div>`).join('')}
    <button id="btn-save-edit" class="add-btn">Guardar cambios</button>
  `);

  document.getElementById('btn-save-edit').onclick = () => {
    const ovr = { ...(editOvr[ref] || {}) };
    ['name', 'ean', 'proxium'].forEach(f => {
      const v = document.getElementById('edit-' + f).value.trim();
      if (v !== p[f]) ovr[f] = v;
    });
    editOvr[ref] = ovr;
    localStorage.setItem('ie', JSON.stringify(editOvr));
    const idx = _all.findIndex(x => x.ref === ref);
    if (idx >= 0) _all[idx] = { ..._all[idx], ...ovr };
    toast('Cambios guardados', 'green');
    renderList();
  };
}
