// js/pedidos.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openQtySheet, toast }           from './ui.js';
import { startScanner }                  from './scanner.js';

const QUICK_QTYS = [6, 12, 24, 48];
const TERMINALS  = ['D', 'MSC', 'E'];
const PAGE = 50;

let _all = [], _page = 0, _filterBar = null;
let _query = '', _filterType = 'all', _activeFamilies = [];

function getOrders()   { return JSON.parse(localStorage.getItem('io') || '{}'); }
function saveOrders(o) { localStorage.setItem('io', JSON.stringify(o)); }
function getTerminal() { return localStorage.getItem('itp') || TERMINALS[0]; }
function setTerminal(t){ localStorage.setItem('itp', t); }

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
    addOrder(p);
  });
}

export function unmount() {
  if (_filterBar) _filterBar.hide();
}

function addOrder(p) {
  openQtySheet(p, QUICK_QTYS, 'Pedir ×{n} unidades', qty => {
    const orders = getOrders();
    orders[p.ref] = (orders[p.ref] || 0) + qty;
    saveOrders(orders);
    toast(`${p.name} — ${orders[p.ref]} ud. en pedido`, 'green');
    renderList();
  });
}

function renderList() {
  const main     = document.getElementById('main');
  const orders   = getOrders();
  const terminal = getTerminal();
  const hasFilter = _query.trim() || _activeFamilies.length > 0;

  // Sin filtro: ordenar por cantidad pedida descendente (pedidos primero)
  const items = hasFilter
    ? filterProducts(_all, _query, _filterType, _activeFamilies)
    : [..._all].sort((a, b) => (orders[b.ref] || 0) - (orders[a.ref] || 0));

  const page = items.slice(0, (_page + 1) * PAGE);
  const more = items.length > page.length;
  const totalRefs  = Object.keys(orders).filter(r => orders[r] > 0).length;
  const totalUnits = Object.values(orders).reduce((a, b) => a + b, 0);

  const header = `
    <div style="padding:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="display:flex;gap:4px">
        ${TERMINALS.map(t => `
          <button data-term="${t}" style="
            padding:6px 14px;border-radius:20px;font-size:0.72rem;font-weight:700;
            background:${t === terminal ? 'var(--accent)' : 'var(--surface2)'};
            color:${t === terminal ? '#fff' : 'var(--text3)'}">
            ${t}
          </button>`).join('')}
      </div>
      <div style="margin-left:auto;font-size:0.72rem;color:var(--text3)">
        <strong style="color:var(--accent)">${totalRefs} refs</strong> · ${totalUnits} uds
      </div>
    </div>
    <div style="padding:0 12px 4px;font-size:0.65rem;color:var(--text3)">
      📡 Escanea con la pistola o toca un artículo para pedir
    </div>`;

  main.innerHTML = header + `
    <div class="prod-list">
      ${page.map(p => {
        const qty = orders[p.ref];
        const ordered = qty > 0;
        return `<div class="prod-item" data-ref="${p.ref}">
          <div class="prod-avatar" style="${ordered ? 'background:linear-gradient(135deg,var(--accent),#5AC8FA)' : ''}">
            ${(p.family || '?').slice(0, 2).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0">
            <div class="prod-name">${p.name}</div>
            <div class="prod-meta">${p.ref} · EAN ${p.ean || '—'}</div>
          </div>
          ${ordered
            ? `<div class="prod-qty-badge">${qty}<small>uds</small></div>`
            : `<div style="font-size:1rem;color:var(--text3);flex-shrink:0;padding-right:2px">+</div>`}
        </div>`;
      }).join('')}
      ${more ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">Ver más (${items.length - page.length})</button>` : ''}
    </div>`;

  main.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => { setTerminal(btn.dataset.term); renderList(); });
  });

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click', () => {
      const p = _all.find(x => x.ref === el.dataset.ref);
      if (p) addOrder(p);
    });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
}
