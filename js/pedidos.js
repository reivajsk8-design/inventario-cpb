// js/pedidos.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openQtySheet, toast }           from './ui.js';
import { startScanner }                  from './scanner.js';

const QUICK_QTYS = [6, 12, 24, 48];
const TERMINALS  = ['D', 'MSC', 'E'];

let _all = [], _filtered = [], _filterBar = null;

function getOrders()   { return JSON.parse(localStorage.getItem('io') || '{}'); }
function saveOrders(o) { localStorage.setItem('io', JSON.stringify(o)); }
function getTerminal() { return localStorage.getItem('itp') || TERMINALS[0]; }
function setTerminal(t){ localStorage.setItem('itp', t); }

export async function mount() {
  _all = await getAllProducts();
  const families = await getFamilies();

  _filterBar = mountFilterBar(families, ({ query, filterType, families: fams }) => {
    const orders  = getOrders();
    const ordered = _all.filter(p => orders[p.ref] > 0);
    _filtered     = filterProducts(ordered, query, filterType, fams);
    renderList();
  });

  renderList();

  startScanner(async ean => {
    const p = _all.find(x => x.ean === ean);
    if (!p) { toast('EAN no encontrado', 'red'); return; }
    openQtySheet(p, QUICK_QTYS, 'Pedir ×{n} unidades', qty => {
      const orders = getOrders();
      orders[p.ref] = (orders[p.ref] || 0) + qty;
      saveOrders(orders);
      toast(`${p.name} — ${orders[p.ref]} ud. en pedido`, 'green');
      renderList();
    });
  });
}

export function unmount() {
  if (_filterBar) _filterBar.hide();
}

function renderList() {
  const main     = document.getElementById('main');
  const orders   = getOrders();
  const terminal = getTerminal();
  const items    = _filtered.length > 0 ? _filtered : _all.filter(p => orders[p.ref] > 0);

  const totalItems = Object.keys(orders).filter(r => orders[r] > 0).length;
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
        ${totalItems} refs · ${totalUnits} uds
      </div>
    </div>`;

  if (items.length === 0) {
    main.innerHTML = header + `<div class="empty-state"><div class="icon">🛒</div>
      <p>No hay pedidos.<br>Escanea un artículo para añadir.</p></div>`;
  } else {
    main.innerHTML = header + `<div class="prod-list">${items.map(p => `
      <div class="prod-item" data-ref="${p.ref}">
        <div class="prod-avatar">${(p.family || '?').slice(0, 2).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="prod-name">${p.name}</div>
          <div class="prod-meta">${p.ref} · EAN ${p.ean || '—'}</div>
        </div>
        <div class="prod-qty-badge">${orders[p.ref]}<small>uds</small></div>
      </div>`).join('')}</div>`;
  }

  main.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => { setTerminal(btn.dataset.term); renderList(); });
  });

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click', () => {
      const p = _all.find(x => x.ref === el.dataset.ref);
      if (!p) return;
      openQtySheet(p, QUICK_QTYS, 'Pedir ×{n} unidades', qty => {
        const orders = getOrders();
        orders[p.ref] = (orders[p.ref] || 0) + qty;
        saveOrders(orders);
        toast(`${p.name} — ${orders[p.ref]} ud.`, 'green');
        renderList();
      });
    });
  });
}
