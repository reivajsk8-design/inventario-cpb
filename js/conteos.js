// js/conteos.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openSheet, closeSheet, openQtySheet, toast } from './ui.js';
import { startScanner }                  from './scanner.js';

const QUICK_QTYS = [1, 5, 10, 20];
const TERMINALS  = ['D', 'MSC', 'E'];
const PAGE = 50;

let _all = [], _page = 0, _filterBar = null;
let _query = '', _filterType = 'all', _activeFamilies = [];

function getCounts()    { return JSON.parse(localStorage.getItem('ic') || '{}'); }
function saveCounts(c)  { localStorage.setItem('ic', JSON.stringify(c)); }
function getTerminal()  { return localStorage.getItem('itc') || TERMINALS[0]; }
function setTerminal(t) { localStorage.setItem('itc', t); }

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

function openEditSheet(p) {
  const counts = getCounts();
  let qty      = counts[p.ref]?.qty || 0;
  let fresh    = true; // primer dígito reemplaza en vez de añadir

  openSheet(`
    <div class="qty-sheet-product">
      <div class="prod-avatar" style="background:rgba(48,209,88,0.2);color:var(--green)">
        ${(p.family || '?').slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div class="qty-sheet-name">${p.name}</div>
        <div class="qty-sheet-meta">${p.ref}${p.family ? ' · ' + p.family : ''}</div>
        <div class="qty-sheet-ean">EAN ${p.ean || '—'}</div>
      </div>
    </div>
    <div class="qty-label" style="margin-bottom:6px">Cantidad total en conteo</div>
    <div class="numpad-display-row">
      <div class="numpad-display" id="np-display">${qty}</div>
      <button class="numpad-del" id="np-del">⌫</button>
    </div>
    <div class="numpad" id="np-grid">
      ${[1,2,3,4,5,6,7,8,9].map(n =>
        `<button class="np-btn" data-n="${n}">${n}</button>`).join('')}
      <button class="np-btn zero" data-n="0">0</button>
      <button class="np-btn confirm" data-n="ok">✓</button>
    </div>
    <button id="btn-save-qty" class="add-btn" style="background:var(--green);margin-bottom:10px">
      Guardar (${qty} uds)
    </button>
    <button id="btn-del-item" style="width:100%;padding:12px;border-radius:12px;
      background:rgba(255,69,58,0.12);color:var(--red);font-size:0.82rem;font-weight:700">
      🗑 Eliminar del conteo
    </button>
  `);

  const display = () => document.getElementById('np-display');
  const saveBtn = () => document.getElementById('btn-save-qty');
  const syncUI  = () => {
    display().textContent = qty;
    saveBtn().textContent = `Guardar (${qty} uds)`;
  };

  document.getElementById('np-grid').addEventListener('click', e => {
    const n = e.target.dataset.n;
    if (!n) return;
    if (n === 'ok') { doSave(); return; }
    qty   = Math.min(parseInt((fresh ? '' : String(qty)) + n) || 0, 9999);
    fresh = false;
    syncUI();
  });

  document.getElementById('np-del').addEventListener('click', () => {
    qty   = parseInt(String(qty).slice(0, -1)) || 0;
    fresh = false;
    syncUI();
  });

  document.getElementById('btn-save-qty').addEventListener('click', doSave);

  document.getElementById('btn-del-item').addEventListener('click', () => {
    const counts = getCounts();
    delete counts[p.ref];
    saveCounts(counts);
    toast(`${p.name} eliminado del conteo`, 'amber');
    closeSheet();
    renderList();
  });

  function doSave() {
    const counts = getCounts();
    if (qty <= 0) {
      delete counts[p.ref];
      toast(`${p.name} eliminado del conteo`, 'amber');
    } else {
      counts[p.ref] = { qty, notes: counts[p.ref]?.notes || '' };
      toast(`${p.name} — ${qty} uds guardado`, 'green');
    }
    saveCounts(counts);
    closeSheet();
    renderList();
  }
}

function renderList() {
  const main     = document.getElementById('main');
  const counts   = getCounts();
  const terminal = getTerminal();
  const hasFilter = _query.trim() || _activeFamilies.length > 0;

  const contados = _all.filter(p => (counts[p.ref]?.qty || 0) > 0);
  const items = hasFilter
    ? filterProducts(contados, _query, _filterType, _activeFamilies)
    : [...contados].sort((a, b) => (counts[b.ref]?.qty || 0) - (counts[a.ref]?.qty || 0));

  const page         = items.slice(0, (_page + 1) * PAGE);
  const more         = items.length > page.length;
  const totalUnidades = contados.reduce((s, p) => s + (counts[p.ref]?.qty || 0), 0);

  main.innerHTML = `
    <div style="padding:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="display:flex;gap:4px">
        ${TERMINALS.map(t => `
          <button data-term="${t}" style="
            padding:6px 14px;border-radius:20px;font-size:0.72rem;font-weight:700;
            background:${t === terminal ? 'var(--green)' : 'var(--surface2)'};
            color:${t === terminal ? '#fff' : 'var(--text3)'}">
            ${t}
          </button>`).join('')}
      </div>
      <div style="margin-left:auto;font-size:0.72rem;color:var(--text3)">
        <strong style="color:var(--green)">${contados.length} refs</strong> · ${totalUnidades} uds
      </div>
    </div>
    <div style="padding:0 12px 4px;font-size:0.65rem;color:var(--text3)">
      📡 Escanea para añadir · toca para editar cantidad
    </div>
    ${items.length === 0
      ? (!hasFilter
          ? `<div class="empty-state">
               <div class="icon">🔢</div>
               <p style="font-weight:700;color:var(--text)">Sin conteos todavía</p>
               <p style="color:var(--text3);font-size:0.82rem">Ve a <strong>Lista</strong> y toca un artículo<br>para empezar a contar.</p>
             </div>`
          : `<div class="empty-state"><div class="icon">🔍</div><p>Sin resultados en el conteo</p></div>`)
      : `<div class="prod-list">
           ${page.map(p => {
             const c = counts[p.ref];
             return `<div class="prod-item" data-ref="${p.ref}">
               <div style="flex:1;min-width:0">
                 <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px">
                   <span class="prod-tag tag-counted">${p.ref}</span>
                   ${p.proxium ? `<span class="prod-tag tag-proxium">${p.proxium}</span>` : ''}
                   <div class="prod-name" style="flex:1;min-width:80px">${p.name}</div>
                 </div>
                 <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                   ${p.family ? `<span class="prod-tag tag-family">${p.family}</span>` : ''}
                   ${p.ean ? `<span style="font-size:0.6rem;color:var(--text3)">▪ ${p.ean}</span>` : ''}
                 </div>
               </div>
               <div class="prod-qty-badge" style="color:var(--green)">${c.qty}<small>uds</small></div>
             </div>`;
           }).join('')}
           ${more ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">Ver más (${items.length - page.length})</button>` : ''}
         </div>`}
  `;

  main.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => { setTerminal(btn.dataset.term); renderList(); });
  });

  main.querySelectorAll('.prod-item').forEach(el => {
    el.addEventListener('click', () => {
      const p = _all.find(x => x.ref === el.dataset.ref);
      if (p) openEditSheet(p);
    });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
}
