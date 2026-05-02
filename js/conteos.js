// js/conteos.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openQtySheet, toast }           from './ui.js';
import { startScanner }                  from './scanner.js';

const QUICK_QTYS = [1, 5, 10, 20];
const PAGE = 50;
let _all = [], _page = 0, _filterBar = null;
let _query = '', _filterType = 'all', _activeFamilies = [];

function getCounts() { return JSON.parse(localStorage.getItem('ic') || '{}'); }
function saveCounts(c) { localStorage.setItem('ic', JSON.stringify(c)); }

export async function mount() {
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const raw = await getAllProducts();
  _all = raw.map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);

  const families = await getFamilies();
  _filterBar = mountFilterBar(families, ({ query, filterType, families: fams }) => {
    _query = query; _filterType = filterType; _activeFamilies = fams;
    _page = 0;
    renderList();
  });

  renderList();

  startScanner(ean => {
    const p = _all.find(x => x.ean === ean);
    if (!p) { toast('EAN no encontrado', 'red'); return; }
    addQty(p);
  });
}

export function unmount() {
  if (_filterBar) _filterBar.hide();
}

function addQty(p) {
  openQtySheet(p, QUICK_QTYS, 'Añadir ×{n} al conteo', qty => {
    const counts = getCounts();
    counts[p.ref] = { qty: (counts[p.ref]?.qty || 0) + qty, notes: counts[p.ref]?.notes || '' };
    saveCounts(counts);
    toast(`${p.name} — ${counts[p.ref].qty} ud. total`, 'green');
    renderList();
  });
}

function renderList() {
  const main   = document.getElementById('main');
  const counts = getCounts();
  const hasFilter = _query.trim() || _activeFamilies.length > 0;

  // Sin filtro: ordenar por cantidad descendente (contados primero)
  const items = hasFilter
    ? filterProducts(_all, _query, _filterType, _activeFamilies)
    : [..._all].sort((a, b) => (counts[b.ref]?.qty || 0) - (counts[a.ref]?.qty || 0));

  const page = items.slice(0, (_page + 1) * PAGE);
  const more = items.length > page.length;
  const totalContados = Object.keys(counts).filter(r => counts[r]?.qty > 0).length;

  if (items.length === 0) {
    main.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Sin resultados</p></div>`;
    return;
  }

  main.innerHTML = `
    <div style="padding:10px 12px 4px;font-size:0.65rem;color:var(--text3)">
      📡 Escanea con la pistola o toca un artículo · <strong style="color:var(--green)">${totalContados} contados</strong>
    </div>
    <div class="prod-list">
      ${page.map(p => {
        const c = counts[p.ref];
        const counted = c?.qty > 0;
        return `<div class="prod-item" data-ref="${p.ref}">
          <div class="prod-avatar" style="${counted ? 'background:linear-gradient(135deg,var(--green),#34C759)' : ''}">
            ${(p.family || '?').slice(0, 2).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0">
            <div class="prod-name">${p.name}</div>
            <div class="prod-meta">${p.ref} · EAN ${p.ean || '—'}</div>
          </div>
          ${counted
            ? `<div class="prod-qty-badge" style="color:var(--green)">${c.qty}<small>uds</small></div>`
            : `<div style="font-size:1rem;color:var(--text3);flex-shrink:0;padding-right:2px">+</div>`}
        </div>`;
      }).join('')}
      ${more ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">Ver más (${items.length - page.length})</button>` : ''}
    </div>`;

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click', () => {
      const p = _all.find(x => x.ref === el.dataset.ref);
      if (p) addQty(p);
    });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
}
