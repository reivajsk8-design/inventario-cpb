// js/conteos.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openQtySheet, toast }           from './ui.js';
import { startScanner }                  from './scanner.js';

const QUICK_QTYS = [1, 5, 10, 20];
let _all = [], _filtered = [], _filterBar = null;

function getCounts() { return JSON.parse(localStorage.getItem('ic') || '{}'); }
function saveCounts(c) { localStorage.setItem('ic', JSON.stringify(c)); }

export async function mount() {
  _all = await getAllProducts();
  const families = await getFamilies();

  _filterBar = mountFilterBar(families, ({ query, filterType, families: fams }) => {
    const counts  = getCounts();
    const counted = _all.filter(p => counts[p.ref] != null);
    _filtered     = filterProducts(counted, query, filterType, fams);
    renderList();
  });

  renderList();

  startScanner(async ean => {
    const p = _all.find(x => x.ean === ean);
    if (!p) { toast('EAN no encontrado', 'red'); return; }
    openQtySheet(p, QUICK_QTYS, 'Añadir ×{n} al conteo', qty => {
      const counts = getCounts();
      counts[p.ref] = { qty: (counts[p.ref]?.qty || 0) + qty, notes: counts[p.ref]?.notes || '' };
      saveCounts(counts);
      toast(`${p.name} — ${counts[p.ref].qty} ud. total`, 'green');
      renderList();
    });
  });
}

export function unmount() {
  if (_filterBar) _filterBar.hide();
}

function renderList() {
  const main   = document.getElementById('main');
  const counts = getCounts();
  const items  = _filtered.length > 0 ? _filtered : _all.filter(p => counts[p.ref] != null);

  if (items.length === 0) {
    main.innerHTML = `<div class="empty-state"><div class="icon">🔢</div>
      <p>Aún no hay conteos.<br>Escanea un artículo para empezar.</p></div>`;
    return;
  }

  main.innerHTML = `<div class="prod-list">${items.map(p => {
    const c = counts[p.ref];
    return `<div class="prod-item" data-ref="${p.ref}">
      <div class="prod-avatar">${(p.family || '?').slice(0, 2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="prod-name">${p.name}</div>
        <div class="prod-meta">${p.ref} · EAN ${p.ean || '—'}</div>
        ${c?.notes ? `<div class="prod-meta" style="color:var(--amber)">${c.notes}</div>` : ''}
      </div>
      <div class="prod-qty-badge">${c?.qty ?? 0}<small>uds</small></div>
    </div>`;
  }).join('')}</div>`;

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click', () => {
      const p = _all.find(x => x.ref === el.dataset.ref);
      if (!p) return;
      openQtySheet(p, QUICK_QTYS, 'Añadir ×{n} al conteo', qty => {
        const counts = getCounts();
        counts[p.ref] = { qty: (counts[p.ref]?.qty || 0) + qty, notes: counts[p.ref]?.notes || '' };
        saveCounts(counts);
        toast(`${p.name} — ${counts[p.ref].qty} ud. total`, 'green');
        renderList();
      });
    });
  });
}
