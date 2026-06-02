// js/pedidos.js
import { getAllProducts, getFamilies }    from './db.js';
import { filterProducts, mountFilterBar } from './filters.js';
import { openSheet, closeSheet, openQtySheet, toast } from './ui.js';
import { startScanner }                  from './scanner.js';
import { matchesEan, openAssignEanSheet } from './eans.js';
import { cameraSupported, openCamera, closeCamera, resumeCamera, beepError } from './camera-scanner.js';

const QUICK_QTYS = [6, 12, 24, 48];
const TERMINALS  = ['D', 'MSC', 'E'];
const PAGE = 50;

const TERM_COLORS = {
  D:   { bg: '#FF6B00', bgOff: 'rgba(255,107,0,0.12)',   color: '#fff',    colorOff: 'rgba(255,107,0,0.8)'   },
  MSC: { bg: '#FFD60A', bgOff: 'rgba(255,214,10,0.12)',  color: '#1a1a1a', colorOff: 'rgba(255,214,10,0.85)' },
  E:   { bg: '#0A84FF', bgOff: 'rgba(10,132,255,0.12)',  color: '#fff',    colorOff: 'rgba(10,132,255,0.8)'  },
};

let _all = [], _page = 0, _filterBar = null;
let _query = '', _filterType = 'all', _activeFamilies = [];
let _onCam = null;

function getOrders()    { return JSON.parse(localStorage.getItem('io') || '{}'); }
function saveOrders(o)  { localStorage.setItem('io', JSON.stringify(o)); }
function getTerminal()  { return localStorage.getItem('itp') || TERMINALS[0]; }
function setTerminal(t) { localStorage.setItem('itp', t); }

export async function mount() {
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const raw     = await getAllProducts();
  const newArts = Object.values(JSON.parse(localStorage.getItem('ia') || '{}'));
  _all = [...raw, ...newArts].map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);

  const families = await getFamilies();
  _filterBar = mountFilterBar(families, ({ query, filterType, families: fams }) => {
    _query = query; _filterType = filterType; _activeFamilies = fams;
    _page = 0;
    renderList();
  });

  const navBtn = document.getElementById('btn-nav-right');
  if (cameraSupported()) {
    navBtn.textContent = '📷';
    navBtn.onclick = () => _onCam && _onCam();
  }

  const onCamScan = ean => {
    const p = _all.find(x => matchesEan(x, ean));
    if (!p) { beepError(); openAssignEanSheet(ean, _all, product => addOrder(product, () => resumeCamera())); return; }
    addOrder(p, () => resumeCamera());
  };

  const openCam = () => openCamera(onCamScan, toast);
  _onCam = openCam;

  document.getElementById('btn-cam-close').addEventListener('click', () => closeCamera());

  renderList();

  startScanner(ean => {
    const p = _all.find(x => matchesEan(x, ean));
    if (!p) { beepError(); openAssignEanSheet(ean, _all, product => addOrder(product)); return; }
    addOrder(p);
  });
}

export function unmount() {
  closeCamera();
  _onCam = null;
  if (_filterBar) _filterBar.hide();
  const navBtn = document.getElementById('btn-nav-right');
  navBtn.textContent = '?';
  navBtn.onclick = navBtn._tutorialHandler || null;
}

function addOrder(p, onDone = null) {
  openQtySheet(p, QUICK_QTYS, 'Pedir ×{n} unidades', qty => {
    const orders = getOrders();
    orders[p.ref] = (orders[p.ref] || 0) + qty;
    saveOrders(orders);
    toast(`${p.name} — ${orders[p.ref]} ud. en pedido`, 'green');
    renderList();
    if (onDone) onDone();
  });
}

function openEditSheet(p) {
  const orders = getOrders();
  let qty   = orders[p.ref] || 0;
  let fresh = true; // primer dígito reemplaza en vez de añadir

  openSheet(`
    <div class="qty-sheet-product">
      <div class="prod-avatar">${(p.family || '?').slice(0, 2).toUpperCase()}</div>
      <div>
        <div class="qty-sheet-name">${p.name}</div>
        <div class="qty-sheet-meta">${p.ref}${p.family ? ' · ' + p.family : ''}</div>
        <div class="qty-sheet-ean">EAN ${p.ean || '—'}${p.proxium ? ' · Ref.Prov. ' + p.proxium : ''}</div>
      </div>
    </div>
    <div class="qty-label" style="margin-bottom:6px">Cantidad total en pedido</div>
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
    <button id="btn-save-qty" class="add-btn" style="margin-bottom:10px">
      Guardar (${qty} uds)
    </button>
    <button id="btn-del-item" style="width:100%;padding:12px;border-radius:12px;
      background:rgba(255,69,58,0.12);color:var(--red);font-size:0.82rem;font-weight:700">
      🗑 Eliminar del pedido
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
    const orders = getOrders();
    delete orders[p.ref];
    saveOrders(orders);
    toast(`${p.name} eliminado del pedido`, 'amber');
    closeSheet();
    renderList();
  });

  function doSave() {
    const orders = getOrders();
    if (qty <= 0) {
      delete orders[p.ref];
      toast(`${p.name} eliminado del pedido`, 'amber');
    } else {
      orders[p.ref] = qty;
      toast(`${p.name} — ${qty} uds guardado`, 'green');
    }
    saveOrders(orders);
    closeSheet();
    renderList();
  }
}

function renderList() {
  const main     = document.getElementById('main');
  const orders   = getOrders();
  const terminal = getTerminal();
  const hasFilter = _query.trim() || _activeFamilies.length > 0;

  const pedidos   = _all.filter(p => (orders[p.ref] || 0) > 0);
  const items = hasFilter
    ? filterProducts(pedidos, _query, _filterType, _activeFamilies)
    : [...pedidos].sort((a, b) => (orders[b.ref] || 0) - (orders[a.ref] || 0));

  const page       = items.slice(0, (_page + 1) * PAGE);
  const more       = items.length > page.length;
  const totalUnits = pedidos.reduce((s, p) => s + (orders[p.ref] || 0), 0);

  main.innerHTML = `
    <div style="padding:12px 12px 6px;display:flex;gap:8px">
      ${TERMINALS.map(t => {
        const c = TERM_COLORS[t]; const on = t === terminal;
        return `<button data-term="${t}" style="
          flex:1;padding:11px 4px;border-radius:12px;font-size:0.82rem;font-weight:800;
          background:${on ? c.bg : c.bgOff};color:${on ? c.color : c.colorOff}">
          Term. ${t}
        </button>`;
      }).join('')}
    </div>
    <div style="padding:0 12px 4px;text-align:right;font-size:0.72rem;color:var(--text3)">
      <strong style="color:var(--accent)">${pedidos.length} refs</strong> · ${totalUnits} uds
    </div>
    <div style="padding:0 12px 4px;font-size:0.65rem;color:var(--text3)">
      📡${cameraSupported() ? ' · 📷' : ''} Escanea para añadir · toca para editar cantidad
    </div>
    ${items.length === 0
      ? (!hasFilter
          ? `<div class="empty-state">
               <div class="icon">🛒</div>
               <p style="font-weight:700;color:var(--text)">Sin pedidos todavía</p>
               <p style="color:var(--text3);font-size:0.82rem">Ve a <strong>Lista</strong> y toca un artículo<br>para añadirlo al pedido.</p>
             </div>`
          : `<div class="empty-state"><div class="icon">🔍</div><p>Sin resultados en el pedido</p></div>`)
      : `<div class="prod-list">
           ${page.map(p => {
             const qty = orders[p.ref];
             return `<div class="prod-item" data-ref="${p.ref}">
               <div style="flex:1;min-width:0">
                 <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px">
                   <span class="prod-tag tag-ordered">${p.ref}</span>
                   ${p.proxium ? `<span class="prod-tag tag-proxium">${p.proxium}</span>` : ''}
                   <div class="prod-name" style="flex:1;min-width:80px">${p.name}</div>
                 </div>
                 <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                   ${p.family ? `<span class="prod-tag tag-family">${p.family}</span>` : ''}
                   ${p.ean ? `<span style="font-size:0.6rem;color:var(--text3)">▪ ${p.ean}</span>` : ''}
                 </div>
               </div>
               <div class="prod-qty-badge">${qty}<small>uds</small></div>
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
