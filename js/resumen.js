// js/resumen.js
import { getAllProducts }      from './db.js';
import { openSheet, closeSheet } from './ui.js';

let _all = [], _rawAll = [];

export async function mount() {
  _rawAll = await getAllProducts();
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const newArts = Object.values(JSON.parse(localStorage.getItem('ia') || '{}'));
  _all = [..._rawAll, ...newArts].map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);
  render();
}

export function unmount() {}

function render() {
  const counts  = JSON.parse(localStorage.getItem('ic') || '{}');
  const orders  = JSON.parse(localStorage.getItem('io') || '{}');
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const newArts = Object.values(JSON.parse(localStorage.getItem('ia') || '{}'));

  const countRefs  = Object.keys(counts).filter(r => counts[r]?.qty > 0);
  const countUnits = countRefs.reduce((a, r) => a + (counts[r]?.qty || 0), 0);
  const orderRefs  = Object.keys(orders).filter(r => orders[r] > 0);
  const orderUnits = orderRefs.reduce((a, r) => a + (orders[r] || 0), 0);
  const editCount  = Object.keys(editOvr).length;
  const newCount   = newArts.length;

  document.getElementById('main').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Artículos contados</div>
        <div class="stat-value">${countRefs.length}</div>
        <div class="stat-sub">${countUnits} unidades totales</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">En pedido</div>
        <div class="stat-value">${orderRefs.length}</div>
        <div class="stat-sub">${orderUnits} unidades</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ediciones locales</div>
        <div class="stat-value" style="${editCount > 0 ? 'color:var(--amber)' : ''}">${editCount}</div>
        <div class="stat-sub">artículos modificados</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total catálogo</div>
        <div class="stat-value">${_all.length.toLocaleString('es')}</div>
        <div class="stat-sub">productos en BD</div>
      </div>
      ${newCount > 0 ? `
      <div class="stat-card" style="grid-column:1/-1">
        <div class="stat-label">Artículos nuevos creados</div>
        <div class="stat-value" style="color:var(--accent)">${newCount}</div>
        <div class="stat-sub">solo en este dispositivo — pendiente de subir a BD</div>
      </div>` : ''}
    </div>

    <button class="export-btn" id="btn-exp-counts">⬇ Exportar inventario (Excel)</button>
    <button class="export-btn" id="btn-exp-orders"
      style="background:var(--surface2);color:var(--text)">⬇ Exportar pedidos (Excel)</button>
    ${editCount > 0 ? `
    <button class="export-btn" id="btn-exp-edits"
      style="background:rgba(255,159,10,0.15);color:var(--amber);border:1px solid rgba(255,159,10,0.3)">
      ✏️ Exportar modificaciones (${editCount} artículos)
    </button>` : ''}
    ${newCount > 0 ? `
    <button class="export-btn" id="btn-exp-new"
      style="background:rgba(10,132,255,0.08);color:var(--accent);border:1px solid rgba(10,132,255,0.2)">
      ✦ Exportar artículos nuevos (${newCount})
    </button>` : ''}
    <button class="export-btn" id="btn-reset"
      style="background:rgba(255,69,58,0.12);color:var(--red);margin-top:20px">
      🗑 Borrar todos los conteos y pedidos
    </button>
  `;

  document.getElementById('btn-exp-counts').addEventListener('click', () =>
    ensureTerminal('itr', () => exportExcel('conteos', buildCountsRows(counts), localStorage.getItem('itr') || '')));

  document.getElementById('btn-exp-orders').addEventListener('click', () =>
    ensureTerminal('itp', () => exportExcel('pedidos', buildOrdersRows(orders), localStorage.getItem('itp') || '')));

  document.getElementById('btn-exp-edits')?.addEventListener('click', () =>
    ensureTerminal('itr', () => exportExcel('modificaciones', buildEditsRows(editOvr), localStorage.getItem('itr') || '')));

  document.getElementById('btn-exp-new')?.addEventListener('click', () =>
    ensureTerminal('itr', () => exportExcel('articulos_nuevos', buildNewArtsRows(newArts), localStorage.getItem('itr') || '')));

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('¿Borrar todos los conteos y pedidos? Esta acción no se puede deshacer.')) return;
    localStorage.removeItem('ic');
    localStorage.removeItem('io');
    render();
    window.dispatchEvent(new Event('data-reset'));
  });
}

function buildCountsRows(counts) {
  const user     = localStorage.getItem('ic_user') || '';
  const terminal = localStorage.getItem('itr') || '';
  return [
    ['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'Ref. Proveedor', 'Familia', 'Cantidad', 'Notas'],
    ...Object.entries(counts)
      .filter(([, v]) => v?.qty > 0)
      .map(([ref, v]) => {
        const p = _all.find(x => x.ref === ref) || {};
        return [user, terminal, ref, p.name || '', p.ean || '', p.proxium || '', p.family || '', v.qty, v.notes || ''];
      }),
  ];
}

function buildOrdersRows(orders) {
  const user     = localStorage.getItem('ic_user') || '';
  const terminal = localStorage.getItem('itp') || '';
  return [
    ['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'Ref. Proveedor', 'Familia', 'Cantidad pedida', 'Coste'],
    ...Object.entries(orders)
      .filter(([, qty]) => qty > 0)
      .map(([ref, qty]) => {
        const p = _all.find(x => x.ref === ref) || {};
        return [user, terminal, ref, p.name || '', p.ean || '', p.proxium || '', p.family || '', qty, p.cost || 0];
      }),
  ];
}

function buildNewArtsRows(newArts) {
  const user     = localStorage.getItem('ic_user') || '';
  const terminal = localStorage.getItem('itr') || '';
  return [
    ['Usuario', 'Terminal', 'PROXIUM', 'Nombre', 'EAN', 'Familia', 'Ref. Proveedor', 'PVP', 'Coste', 'IVA (%)'],
    ...newArts.map(p => [user, terminal, p.ref, p.name, p.ean || '', p.family || '', p.proxium || '', p.pvp || 0, p.cost || 0, p.iva ?? 21]),
  ];
}

function buildEditsRows(editOvr) {
  // Exporta los artículos modificados con todos sus campos actuales (post-edición)
  // para que el admin pueda actualizar PROXIUM con los datos corregidos
  const user = localStorage.getItem('ic_user') || '';
  return [
    ['Usuario', 'REF', 'Nombre', 'EAN', 'Familia', 'PROXIUM', 'PVP', 'Coste', 'IVA', 'Campos modificados'],
    ...Object.entries(editOvr)
      .map(([ref, ovr]) => {
        const p = _all.find(x => x.ref === ref) || {};
        const camposModificados = Object.keys(ovr).join(', ');
        return [user, ref, p.name || '', p.ean || '', p.family || '', p.proxium || '',
                p.pvp || 0, p.cost || 0, p.iva || 0, camposModificados];
      }),
  ];
}

const TERMINALS = ['D', 'MSC', 'E'];

function ensureTerminal(terminalKey, onConfirmed) {
  const savedTerm = localStorage.getItem(terminalKey) || '';

  if (savedTerm) { onConfirmed(); return; }

  let _term = '';

  openSheet(`
    <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:6px">Selecciona terminal</div>
    <div style="font-size:0.7rem;color:var(--text3);margin-bottom:16px">Se guardará para los próximos exports.</div>

    <div style="display:flex;gap:8px;margin-bottom:18px">
      ${TERMINALS.map(t => `
        <button data-term="${t}" style="
          flex:1;padding:16px;border-radius:10px;font-size:1rem;font-weight:800;
          background:var(--surface2);color:var(--text3)">
          ${t}
        </button>`).join('')}
    </div>

    <button id="exp-confirm" class="add-btn" style="opacity:0.4" disabled>
      Exportar →
    </button>
  `);

  document.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => {
      _term = btn.dataset.term;
      document.querySelectorAll('[data-term]').forEach(b => {
        b.style.background = b.dataset.term === _term ? 'var(--accent)' : 'var(--surface2)';
        b.style.color      = b.dataset.term === _term ? '#fff' : 'var(--text3)';
      });
      const confirmBtn = document.getElementById('exp-confirm');
      confirmBtn.disabled      = false;
      confirmBtn.style.opacity = '1';
    });
  });

  document.getElementById('exp-confirm').addEventListener('click', () => {
    if (!_term) return;
    localStorage.setItem(terminalKey, _term);
    closeSheet();
    onConfirmed();
  });
}

function detectFamilia(rows) {
  const header = rows[0] || [];
  const idx    = header.indexOf('Familia');
  if (idx < 0) return '';
  const fams = new Set(rows.slice(1).map(r => r[idx]).filter(Boolean));
  if (fams.size === 1) return [...fams][0];
  if (fams.size  > 1) return 'VARIOS';
  return '';
}

function exportExcel(name, rows, terminal = '') {
  if (!window.XLSX) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => doExport(name, rows, terminal);
    document.head.appendChild(s);
  } else {
    doExport(name, rows, terminal);
  }
}

function doExport(name, rows, terminal = '') {
  const wb   = XLSX.utils.book_new();
  const ws   = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
  const now     = new Date();
  const date    = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
  const user    = (localStorage.getItem('ic_user') || 'export').replace(/\s+/g, '_');
  const familia = detectFamilia(rows).replace(/\s+/g, '_');
  const term    = terminal ? `_${terminal}` : '';
  const fam     = familia  ? `_${familia}`  : '';
  XLSX.writeFile(wb, `${name}${term}${fam}_${user}_${date}.xlsx`);
}
