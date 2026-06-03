// js/resumen.js
import { getAllProducts }      from './db.js';
import { openSheet, closeSheet, toast } from './ui.js';

function totalQtyResumen(v) {
  if (!v) return 0;
  if ('almacen' in v || 'tienda' in v) return (v.almacen || 0) + (v.tienda || 0);
  return v.qty || 0;
}

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

  const countRefs  = Object.keys(counts).filter(r => totalQtyResumen(counts[r]) > 0);
  const almTotal   = countRefs.reduce((a, r) => a + (counts[r]?.almacen ?? counts[r]?.qty ?? 0), 0);
  const tieTotal   = countRefs.reduce((a, r) => a + (counts[r]?.tienda  ?? 0), 0);
  const countUnits = almTotal + tieTotal;
  const orderRefs  = Object.keys(orders).filter(r => orders[r] > 0);
  const orderUnits = orderRefs.reduce((a, r) => a + (orders[r] || 0), 0);
  const editCount  = Object.keys(editOvr).length;
  const newCount   = newArts.length;

  const userName = localStorage.getItem('ic_user') || '';

  document.getElementById('main').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:14px 4px 2px">
      <span style="font-size:1rem">👤</span>
      <span style="font-size:0.88rem;font-weight:700;color:var(--text);flex:1">${userName || '<span style="color:var(--text3)">Sin nombre</span>'}</span>
      <button id="btn-change-name" style="font-size:0.72rem;color:var(--accent);font-weight:700;padding:4px 10px;
        background:rgba(10,132,255,0.1);border-radius:8px">Cambiar</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Artículos contados</div>
        <div class="stat-value">${countRefs.length}</div>
        <div class="stat-sub">${countUnits} uds · A:${almTotal} T:${tieTotal}</div>
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
    <a class="export-btn" href="./precio-scan.html"
      style="background:linear-gradient(135deg,#BF5AF2,#0A84FF);color:#fff;margin-top:20px;display:block;text-decoration:none;text-align:center">
      🌐 PrecioScan — Consultar precios de mercado
    </a>
    <button class="export-btn" id="btn-manage-data"
      style="background:var(--surface2);color:var(--text2);margin-top:8px">
      🗑 Gestionar datos locales
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

  document.getElementById('btn-change-name').addEventListener('click', () => {
    const current = localStorage.getItem('ic_user') || '';
    openSheet(`
      <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:6px">👤 Cambiar nombre</div>
      <div style="font-size:0.72rem;color:var(--text3);margin-bottom:16px">El nuevo nombre se usará en los próximos exports.</div>
      <input id="inp-new-name" type="text" autocomplete="name" autocapitalize="words"
        placeholder="Tu nombre…"
        style="width:100%;background:var(--surface2);border-radius:12px;padding:12px 14px;
               color:var(--text);font-size:1rem;font-weight:600;margin-bottom:16px"
        value="${current}">
      <button id="btn-save-name" class="add-btn">Guardar</button>
    `);
    document.getElementById('inp-new-name').select();
    document.getElementById('btn-save-name').addEventListener('click', () => {
      const name = document.getElementById('inp-new-name').value.trim();
      if (!name) { toast('Introduce un nombre', 'red'); return; }
      localStorage.setItem('ic_user', name);
      closeSheet();
      toast('Nombre guardado', 'green');
      render();
    });
  });

  document.getElementById('btn-manage-data').addEventListener('click', openManageSheet);
}

function buildCountsRows(counts) {
  const user     = localStorage.getItem('ic_user') || '';
  const terminal = localStorage.getItem('itr') || '';
  return [
    ['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'Ref. Proveedor', 'Familia', 'Almacén', 'Tienda', 'Total', 'Notas'],
    ...Object.entries(counts)
      .filter(([, v]) => totalQtyResumen(v) > 0)
      .map(([ref, v]) => {
        const p   = _all.find(x => x.ref === ref) || {};
        const alm = v.almacen ?? (v.qty || 0);
        const tie = v.tienda  ?? 0;
        return [user, terminal, ref, p.name || '', p.ean || '', p.proxium || '', p.family || '',
                alm, tie, alm + tie, v.notes || ''];
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

function confirmInline(areaId, onConfirm) {
  const area = document.getElementById(areaId);
  if (!area) return;
  const original = area.innerHTML;
  area.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="font-size:0.75rem;color:var(--text2);flex:1">¿Seguro?</span>
      <button id="${areaId}-cancel" style="padding:8px 14px;border-radius:8px;
        background:var(--surface);color:var(--text2);font-size:0.75rem;font-weight:600">
        Cancelar
      </button>
      <button id="${areaId}-confirm" style="padding:8px 14px;border-radius:8px;
        background:var(--red);color:#fff;font-size:0.75rem;font-weight:600">
        Sí, borrar →
      </button>
    </div>`;
  document.getElementById(`${areaId}-confirm`).addEventListener('click', onConfirm);
  document.getElementById(`${areaId}-cancel`).addEventListener('click', () => { area.innerHTML = original; });
}

function wireManageSheet(confirmed) {
  document.getElementById('gd-del-counts')?.addEventListener('click', () =>
    confirmInline('gd-del-counts-area', () => {
      localStorage.removeItem('ic');
      window.dispatchEvent(new Event('data-reset'));
      closeSheet(); toast('Conteos borrados', 'green'); mount();
    }));

  document.getElementById('gd-del-orders')?.addEventListener('click', () =>
    confirmInline('gd-del-orders-area', () => {
      localStorage.removeItem('io');
      window.dispatchEvent(new Event('data-reset'));
      closeSheet(); toast('Pedidos borrados', 'green'); mount();
    }));

  document.getElementById('gd-del-edits')?.addEventListener('click', () =>
    confirmInline('gd-del-edits-area', () => {
      localStorage.removeItem('ie');
      closeSheet(); toast('Ediciones borradas', 'green'); mount();
    }));

  document.getElementById('gd-new-confirmed')?.addEventListener('click', () =>
    confirmInline('gd-new-confirmed-area', () => {
      const ia = JSON.parse(localStorage.getItem('ia') || '{}');
      confirmed.forEach(p => delete ia[p.ref]);
      localStorage.setItem('ia', JSON.stringify(ia));
      closeSheet(); toast(`${confirmed.length} artículo(s) borrados`, 'green'); mount();
    }));

  document.getElementById('gd-new-all')?.addEventListener('click', () =>
    confirmInline('gd-new-all-area', () => {
      localStorage.removeItem('ia');
      closeSheet(); toast('Artículos nuevos borrados', 'green'); mount();
    }));
}

function openManageSheet() {
  const counts  = JSON.parse(localStorage.getItem('ic') || '{}');
  const orders  = JSON.parse(localStorage.getItem('io') || '{}');
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const iaObj   = JSON.parse(localStorage.getItem('ia') || '{}');
  const iaList  = Object.values(iaObj);
  const dbRefs  = new Set(_rawAll.map(p => p.ref));
  const confirmed = iaList.filter(p => dbRefs.has(p.ref));

  const countRefs = Object.keys(counts).filter(r => totalQtyResumen(counts[r]) > 0);
  const orderRefs = Object.keys(orders).filter(r => orders[r] > 0);
  const editCount = Object.keys(editOvr).length;

  function section(id, label, summary, btnId, btnLabel, empty) {
    return `
      <div id="${id}" style="background:var(--surface2);border-radius:12px;
           padding:12px 14px;margin-bottom:10px">
        <div style="font-size:0.65rem;font-weight:700;color:var(--text3);
                    text-transform:uppercase;letter-spacing:0.05em">${label}</div>
        <div style="font-size:0.82rem;color:var(--text2);margin:4px 0 ${empty ? '0' : '10px'}">${summary}</div>
        ${empty ? '' : `
        <div id="${btnId}-area">
          <button id="${btnId}" style="width:100%;background:rgba(255,69,58,0.1);
            border-radius:10px;padding:10px;color:var(--red);font-size:0.78rem;font-weight:600">
            ${btnLabel}
          </button>
        </div>`}
      </div>`;
  }

  const iaSection = `
    <div id="gd-new" style="background:var(--surface2);border-radius:12px;
         padding:12px 14px;margin-bottom:10px">
      <div style="font-size:0.65rem;font-weight:700;color:var(--text3);
                  text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">
        Artículos nuevos creados
      </div>
      ${iaList.length === 0
        ? `<div style="font-size:0.78rem;color:var(--text3)">Ningún artículo nuevo.</div>`
        : iaList.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:5px 0;border-bottom:1px solid var(--separator)">
            <div style="min-width:0">
              <span style="font-size:0.75rem;font-weight:700;color:var(--text)">${p.ref}</span>
              <span style="font-size:0.68rem;color:var(--text3);margin-left:6px">${(p.name || '').slice(0, 30)}</span>
            </div>
            <span style="font-size:0.7rem;font-weight:700;white-space:nowrap;margin-left:8px;
              color:${dbRefs.has(p.ref) ? 'var(--green)' : 'var(--amber)'}">
              ${dbRefs.has(p.ref) ? '✅ ya en BD' : '⏳ pendiente'}
            </span>
          </div>`).join('')}
      ${confirmed.length > 0 ? `
      <div id="gd-new-confirmed-area" style="margin-top:10px">
        <button id="gd-new-confirmed" style="width:100%;background:rgba(48,209,88,0.1);
          border-radius:10px;padding:10px;color:var(--green);font-size:0.78rem;font-weight:600;margin-bottom:6px">
          ✅ Borrar los ${confirmed.length} confirmados
        </button>
      </div>` : ''}
      ${iaList.length > 0 ? `
      <div id="gd-new-all-area" style="margin-top:${confirmed.length > 0 ? '0' : '10px'}">
        <button id="gd-new-all" style="width:100%;background:rgba(255,69,58,0.1);
          border-radius:10px;padding:10px;color:var(--red);font-size:0.78rem;font-weight:600">
          🗑 Borrar todos (${iaList.length})
        </button>
      </div>` : ''}
    </div>`;

  openSheet(`
    <div style="font-size:0.9rem;font-weight:700;color:var(--text);margin-bottom:14px">
      🗑 Gestionar datos locales
    </div>
    ${section('gd-counts', 'Conteos', `${countRefs.length} artículos contados`, 'gd-del-counts', '🗑 Borrar conteos', countRefs.length === 0)}
    ${section('gd-orders', 'Pedidos', `${orderRefs.length} artículos en pedido`, 'gd-del-orders', '🗑 Borrar pedidos', orderRefs.length === 0)}
    ${section('gd-edits', 'Ediciones locales', `${editCount} artículos modificados`, 'gd-del-edits', '🗑 Borrar ediciones', editCount === 0)}
    ${iaSection}
  `);

  wireManageSheet(confirmed, iaList);
}
