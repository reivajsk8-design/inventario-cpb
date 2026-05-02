// js/resumen.js
import { getAllProducts } from './db.js';

let _all = [];

export async function mount() {
  _all = await getAllProducts();
  render();
}

export function unmount() {}

function render() {
  const counts  = JSON.parse(localStorage.getItem('ic') || '{}');
  const orders  = JSON.parse(localStorage.getItem('io') || '{}');
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');

  const countRefs  = Object.keys(counts).filter(r => counts[r]?.qty > 0);
  const countUnits = countRefs.reduce((a, r) => a + (counts[r]?.qty || 0), 0);
  const orderRefs  = Object.keys(orders).filter(r => orders[r] > 0);
  const orderUnits = orderRefs.reduce((a, r) => a + (orders[r] || 0), 0);
  const editCount  = Object.keys(editOvr).length;
  const userName   = localStorage.getItem('ic_user') || '';

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
        <div class="stat-value">${editCount}</div>
        <div class="stat-sub">productos modificados</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total catálogo</div>
        <div class="stat-value">${_all.length.toLocaleString('es')}</div>
        <div class="stat-sub">productos en BD</div>
      </div>
    </div>

    <div style="padding:0 12px">
      <div class="qty-label" style="margin-bottom:8px">Tu nombre (aparece en los exports)</div>
      <div style="background:var(--surface);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
        <input id="inp-username" style="flex:1;background:none;font-size:0.88rem;color:var(--text)"
               placeholder="Nombre y apellido…" value="${userName}">
      </div>
    </div>

    <button class="export-btn" id="btn-exp-counts">⬇ Exportar inventario (Excel)</button>
    <button class="export-btn" id="btn-exp-orders"
      style="background:var(--surface2);color:var(--text)">⬇ Exportar pedidos (Excel)</button>
    <button class="export-btn" id="btn-reset"
      style="background:rgba(255,69,58,0.12);color:var(--red);margin-top:20px">
      🗑 Borrar todos los conteos y pedidos
    </button>
  `;

  document.getElementById('inp-username').addEventListener('change', e => {
    localStorage.setItem('ic_user', e.target.value.trim());
  });

  document.getElementById('btn-exp-counts').addEventListener('click', () =>
    exportExcel('conteos', buildCountsRows(counts)));

  document.getElementById('btn-exp-orders').addEventListener('click', () =>
    exportExcel('pedidos', buildOrdersRows(orders)));

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
    ['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'PROXIUM', 'Familia', 'Cantidad', 'Notas'],
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
    ['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'PROXIUM', 'Familia', 'Cantidad pedida', 'PVP'],
    ...Object.entries(orders)
      .filter(([, qty]) => qty > 0)
      .map(([ref, qty]) => {
        const p = _all.find(x => x.ref === ref) || {};
        return [user, terminal, ref, p.name || '', p.ean || '', p.proxium || '', p.family || '', qty, p.pvp || 0];
      }),
  ];
}

function exportExcel(name, rows) {
  if (!window.XLSX) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => doExport(name, rows);
    document.head.appendChild(s);
  } else {
    doExport(name, rows);
  }
}

function doExport(name, rows) {
  const wb   = XLSX.utils.book_new();
  const ws   = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
  const date = new Date().toISOString().slice(0, 10);
  const user = (localStorage.getItem('ic_user') || 'export').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `${name}_${user}_${date}.xlsx`);
}
