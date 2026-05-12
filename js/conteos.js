// js/conteos.js
import { getAllProducts, getFamilies }                      from './db.js';
import { filterProducts, mountFilterBar }                   from './filters.js';
import { openSheet, closeSheet, openQtySheet, toast }       from './ui.js';
import { startScanner }                                     from './scanner.js';
import { getStock, saveStock, clearStock, parseStockXLSX } from './stock.js';
import { matchesEan, openAssignEanSheet }                   from './eans.js';

const QUICK_QTYS = [1, 5, 10, 20];
const TERMINALS  = ['D', 'MSC', 'E'];
const PAGE = 50;

const TERM_COLORS = {
  D:   { bg: '#FF6B00', bgOff: 'rgba(255,107,0,0.12)',   color: '#fff',    colorOff: 'rgba(255,107,0,0.8)'   },
  MSC: { bg: '#FFD60A', bgOff: 'rgba(255,214,10,0.12)',  color: '#1a1a1a', colorOff: 'rgba(255,214,10,0.85)' },
  E:   { bg: '#0A84FF', bgOff: 'rgba(10,132,255,0.12)',  color: '#fff',    colorOff: 'rgba(10,132,255,0.8)'  },
};

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

  const navBtn = document.getElementById('btn-nav-right');
  navBtn.textContent = '📊';
  navBtn.onclick = openStockPanel;

  renderList();

  startScanner(ean => {
    const p = _all.find(x => matchesEan(x, ean));
    if (!p) { openAssignEanSheet(ean, _all, product => openEditSheet(product)); return; }
    openEditSheet(p);
  });
}

export function unmount() {
  if (_filterBar) _filterBar.hide();
  // Restaurar el botón de tutorial que app.js registró al arrancar
  const navBtn = document.getElementById('btn-nav-right');
  navBtn.textContent = '?';
  navBtn.onclick = navBtn._tutorialHandler || null;
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
  const main        = document.getElementById('main');
  const counts      = getCounts();
  const stock       = getStock();
  const stockLoaded = Object.keys(stock).length > 0;
  const terminal    = getTerminal();
  const hasFilter   = _query.trim() || _activeFamilies.length > 0;

  const contados = _all.filter(p => (counts[p.ref]?.qty || 0) > 0);
  const items = hasFilter
    ? filterProducts(contados, _query, _filterType, _activeFamilies)
    : [...contados].sort((a, b) => {
        if (stockLoaded) {
          // Diferencias primero, luego cuadrados, luego sin stock del sistema
          const priA = stockPriority(a.ref, counts, stock);
          const priB = stockPriority(b.ref, counts, stock);
          if (priA !== priB) return priA - priB;
        }
        return (counts[b.ref]?.qty || 0) - (counts[a.ref]?.qty || 0);
      });

  const page          = items.slice(0, (_page + 1) * PAGE);
  const more          = items.length > page.length;
  const totalUnidades = contados.reduce((s, p) => s + (counts[p.ref]?.qty || 0), 0);

  // Stock stats y sección "sin contar"
  let stockBannerHTML = '';
  let sinContarHTML   = '';
  if (stockLoaded) {
    let cuadrados = 0, diffs = 0, pending = 0;
    const sinContarItems = [];

    Object.entries(stock).forEach(([ref, sysQty]) => {
      const c = counts[ref];
      if (!c?.qty) {
        pending++;
        const prod = _all.find(x => x.ref === ref);
        sinContarItems.push({ ref, sysQty, name: prod?.name || ref, family: prod?.family || '' });
      } else if (c.qty === sysQty) {
        cuadrados++;
      } else {
        diffs++;
      }
    });

    stockBannerHTML = `
      <div class="stock-banner">
        <span class="stock-banner-item match">✓ ${cuadrados} cuadrados</span>
        <span class="stock-banner-sep">·</span>
        <span class="stock-banner-item diff">⚠ ${diffs} diferencias</span>
        <span class="stock-banner-sep">·</span>
        <span class="stock-banner-item pend">◯ ${pending} sin contar</span>
      </div>`;

    if (sinContarItems.length > 0 && !hasFilter) {
      const shown = sinContarItems.slice(0, 20);
      sinContarHTML = `
        <div style="padding:12px 12px 4px;font-size:0.65rem;color:var(--text3)">
          ◯ Sin contar del sistema (${sinContarItems.length})
        </div>
        <div class="prod-list" style="margin-bottom:12px">
          ${shown.map(item => `
            <div class="prod-item sin-contar-item" data-ref="${item.ref}" style="opacity:0.7">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px">
                  <span class="prod-tag tag-ref">${item.ref}</span>
                  <div class="prod-name" style="flex:1;min-width:80px">${item.name}</div>
                </div>
                ${item.family ? `<div><span class="prod-tag tag-family">${item.family}</span></div>` : ''}
              </div>
              <div class="stock-cmp stock-pending">${item.sysQty}<small>en sistema</small></div>
            </div>`).join('')}
          ${sinContarItems.length > 20
            ? `<div style="padding:10px 14px;font-size:0.68rem;color:var(--text3);text-align:center">
                 + ${sinContarItems.length - 20} artículos más sin contar
               </div>`
            : ''}
        </div>`;
    }
  }

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
      <strong style="color:var(--green)">${contados.length} refs</strong> · ${totalUnidades} uds
    </div>
    <div style="padding:0 12px 4px;font-size:0.65rem;color:var(--text3)">
      📡 Escanea para añadir · toca para editar cantidad
    </div>
    ${stockBannerHTML}
    ${items.length === 0
      ? (!hasFilter && !stockLoaded
          ? `<div class="empty-state">
               <div class="icon">🔢</div>
               <p style="font-weight:700;color:var(--text)">Sin conteos todavía</p>
               <p style="color:var(--text3);font-size:0.82rem">Ve a <strong>Lista</strong> y toca un artículo<br>para empezar a contar.</p>
             </div>`
          : hasFilter
            ? `<div class="empty-state"><div class="icon">🔍</div><p>Sin resultados en el conteo</p></div>`
            : '')
      : `<div class="prod-list">
           ${page.map(p => {
             const c      = counts[p.ref];
             const sysQty = stock[p.ref];
             const isDiff = stockLoaded && sysQty !== undefined && c?.qty !== sysQty;
             const rowStyle = isDiff ? 'border-left:3px solid var(--amber);' : '';

             let badge;
             if (!stockLoaded || sysQty === undefined) {
               badge = `<div class="prod-qty-badge" style="color:var(--green)">${c.qty}<small>uds</small></div>`;
             } else if (c.qty === sysQty) {
               badge = `<div class="stock-cmp stock-match">${c.qty}<small>✓ cuadra</small></div>`;
             } else {
               const diff = c.qty - sysQty;
               const sign = diff > 0 ? '+' : '';
               badge = `<div class="stock-cmp stock-diff">${c.qty}<small>${sign}${diff} vs ${sysQty} sis.</small></div>`;
             }

             return `<div class="prod-item" data-ref="${p.ref}" style="${rowStyle}">
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
               ${badge}
             </div>`;
           }).join('')}
           ${more ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">Ver más (${items.length - page.length})</button>` : ''}
         </div>`}
    ${sinContarHTML}
  `;

  main.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => { setTerminal(btn.dataset.term); renderList(); });
  });

  main.querySelectorAll('.prod-item[data-ref]').forEach(el => {
    el.addEventListener('click', () => {
      const p = _all.find(x => x.ref === el.dataset.ref);
      if (p) openEditSheet(p);
    });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
}

// Orden de prioridad cuando hay stock: diferencias primero, luego cuadrados, luego sin dato
function stockPriority(ref, counts, stock) {
  const sysQty  = stock[ref];
  const c       = counts[ref];
  if (sysQty === undefined) return 2;
  if (c?.qty && c.qty !== sysQty) return 0; // diferencia
  return 1; // cuadra
}

function openStockPanel() {
  const stock      = getStock();
  const stockCount = Object.keys(stock).length;

  if (stockCount === 0) {
    openSheet(`
      <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:6px">Cargar stock del sistema</div>
      <div style="font-size:0.7rem;color:var(--text3);margin-bottom:20px">
        Selecciona el Excel exportado de PROXIUM.<br>
        Se usarán las columnas <strong style="color:var(--text2)">Artículo</strong>
        y <strong style="color:var(--text2)">Cantidad</strong>.
      </div>
      <label for="stock-file-input" id="stock-file-label" style="
        display:block;border:1.5px dashed var(--text3);border-radius:var(--radius-md);
        padding:24px 16px;text-align:center;cursor:pointer;margin-bottom:8px
      ">
        <div style="font-size:1.6rem;margin-bottom:8px">📂</div>
        <div style="font-size:0.82rem;color:var(--text3)">Toca para elegir archivo</div>
        <div style="font-size:0.68rem;color:var(--text3);margin-top:4px">.xlsx · .xls</div>
      </label>
      <input type="file" id="stock-file-input" accept=".xlsx,.xls" style="display:none">
      <div id="stock-file-name" style="font-size:0.75rem;color:var(--accent);text-align:center;margin-bottom:16px;min-height:16px"></div>
      <button id="btn-load-stock" class="add-btn" style="opacity:0.4" disabled>
        Cargar stock →
      </button>
    `);

    let _file = null;

    document.getElementById('stock-file-input').addEventListener('change', e => {
      _file = e.target.files[0];
      if (!_file) return;
      document.getElementById('stock-file-name').textContent = _file.name;
      document.getElementById('stock-file-label').style.borderColor = 'var(--accent)';
      const btn = document.getElementById('btn-load-stock');
      btn.disabled = false;
      btn.style.opacity = '1';
    });

    document.getElementById('btn-load-stock').addEventListener('click', async () => {
      if (!_file) return;
      const btn = document.getElementById('btn-load-stock');
      btn.textContent = 'Procesando…';
      btn.disabled = true;
      try {
        const data  = await parseStockXLSX(_file);
        const count = Object.keys(data).length;
        if (count === 0) { toast('No se encontraron artículos', 'red'); return; }
        saveStock(data);
        closeSheet();
        toast(`Stock cargado · ${count} artículos`, 'green');
        renderList();
      } catch (err) {
        console.error(err);
        toast('Error al leer el archivo', 'red');
        btn.textContent = 'Cargar stock →';
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });

  } else {
    const counts = getCounts();
    let cuadrados = 0, diffs = 0, pending = 0;
    Object.entries(stock).forEach(([ref, sysQty]) => {
      const c = counts[ref];
      if (!c?.qty)               pending++;
      else if (c.qty === sysQty) cuadrados++;
      else                       diffs++;
    });

    openSheet(`
      <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:4px">Stock del sistema</div>
      <div style="font-size:0.7rem;color:var(--text3);margin-bottom:20px">${stockCount} artículos cargados</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
        <div style="background:rgba(48,209,88,0.1);border-radius:12px;padding:14px 8px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--green)">${cuadrados}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:4px;line-height:1.3">Cuadrados</div>
        </div>
        <div style="background:rgba(255,159,10,0.1);border-radius:12px;padding:14px 8px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--amber)">${diffs}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:4px;line-height:1.3">Diferencias</div>
        </div>
        <div style="background:var(--surface2);border-radius:12px;padding:14px 8px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--text3)">${pending}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:4px;line-height:1.3">Sin contar</div>
        </div>
      </div>
      <button id="btn-export-comp" class="add-btn" style="margin-bottom:10px">
        ⬇ Exportar comparativa (Excel)
      </button>
      <button id="btn-clear-stock" style="
        display:block;width:100%;padding:14px;border-radius:var(--radius-md);
        background:rgba(255,69,58,0.1);color:var(--red);
        font-size:0.82rem;font-weight:700;text-align:center
      ">Eliminar stock cargado</button>
    `);

    document.getElementById('btn-export-comp').addEventListener('click', () => {
      exportComparativa(stock, counts);
    });

    document.getElementById('btn-clear-stock').addEventListener('click', () => {
      clearStock();
      closeSheet();
      toast('Stock eliminado', 'amber');
      renderList();
    });
  }
}

function exportComparativa(stock, counts) {
  // Construye las filas ordenadas: diferencias primero (por magnitud), luego cuadrados, luego sin contar
  const rows = [];

  // Separar en grupos
  const diferencias = [], cuadrados = [], sinContar = [];

  Object.entries(stock).forEach(([ref, sysQty]) => {
    const prod    = _all.find(x => x.ref === ref) || {};
    const c       = counts[ref];
    const contado = c?.qty ?? null;

    if (contado === null) {
      sinContar.push({ ref, sysQty, contado: null, diff: null, prod });
    } else if (contado === sysQty) {
      cuadrados.push({ ref, sysQty, contado, diff: 0, prod });
    } else {
      diferencias.push({ ref, sysQty, contado, diff: contado - sysQty, prod });
    }
  });

  // Diferencias ordenadas por magnitud absoluta descendente
  diferencias.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const toRow = ({ ref, sysQty, contado, diff, prod }) => {
    let estado;
    if (contado === null)  estado = 'Sin contar';
    else if (diff === 0)   estado = 'Cuadra';
    else if (diff > 0)     estado = `Exceso +${diff}`;
    else                   estado = `Falta ${diff}`;

    return [
      ref,
      prod.name    || '',
      prod.family  || '',
      sysQty,
      contado ?? '',
      contado !== null ? diff : '',
      estado,
    ];
  };

  rows.push(['REF', 'Nombre', 'Familia', 'Stock sistema', 'Contado', 'Diferencia', 'Estado']);
  diferencias.forEach(r => rows.push(toRow(r)));
  cuadrados.forEach(r   => rows.push(toRow(r)));
  sinContar.forEach(r   => rows.push(toRow(r)));

  const doExport = () => {
    const wb  = XLSX.utils.book_new();
    const ws  = XLSX.utils.aoa_to_sheet(rows);

    // Ancho de columnas
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Comparativa');

    const user     = (localStorage.getItem('ic_user') || 'export').replace(/\s+/g, '_');
    const terminal = localStorage.getItem('itc') || '';
    const date     = new Date();
    const dd       = String(date.getDate()).padStart(2, '0');
    const mm       = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy     = date.getFullYear();
    const parts    = ['comparativa_stock', terminal, user, `${dd}-${mm}-${yyyy}`].filter(Boolean);

    XLSX.writeFile(wb, `${parts.join('_')}.xlsx`);
    toast('Excel exportado', 'green');
  };

  if (window.XLSX) {
    doExport();
  } else {
    const s   = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = doExport;
    s.onerror = () => toast('Error al cargar XLSX', 'red');
    document.head.appendChild(s);
  }
}
