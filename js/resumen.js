// js/resumen.js
import { getAllProducts }      from './db.js';
import { openSheet, closeSheet } from './ui.js';

let _all = [], _rawAll = [];

export async function mount() {
  _rawAll = await getAllProducts();
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  _all = _rawAll.map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);
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
        <div class="stat-value" style="${editCount > 0 ? 'color:var(--amber)' : ''}">${editCount}</div>
        <div class="stat-sub">artículos modificados</div>
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
    ${editCount > 0 ? `
    <button class="export-btn" id="btn-exp-edits"
      style="background:rgba(255,159,10,0.15);color:var(--amber);border:1px solid rgba(255,159,10,0.3)">
      ✏️ Exportar modificaciones (${editCount} artículos)
    </button>` : ''}
    <button class="export-btn" id="btn-reset"
      style="background:rgba(255,69,58,0.12);color:var(--red);margin-top:20px">
      🗑 Borrar todos los conteos y pedidos
    </button>
  `;

  document.getElementById('inp-username').addEventListener('change', e => {
    localStorage.setItem('ic_user', e.target.value.trim());
  });

  document.getElementById('btn-exp-counts').addEventListener('click', () =>
    ensureUserAndTerminal('itr', () => exportExcel('conteos', buildCountsRows(counts))));

  document.getElementById('btn-exp-orders').addEventListener('click', () =>
    ensureUserAndTerminal('itp', () => exportExcel('pedidos', buildOrdersRows(orders))));

  document.getElementById('btn-exp-edits')?.addEventListener('click', () => {
    const user = localStorage.getItem('ic_user') || '';
    if (!user.trim()) {
      ensureUserAndTerminal('itr', () => exportExcel('modificaciones', buildEditsRows(editOvr)));
    } else {
      exportExcel('modificaciones', buildEditsRows(editOvr));
    }
  });

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

function ensureUserAndTerminal(terminalKey, onConfirmed) {
  const savedUser = localStorage.getItem('ic_user') || '';
  const savedTerm = localStorage.getItem(terminalKey) || '';

  if (savedUser.trim() && savedTerm) {
    onConfirmed();
    return;
  }

  let _name = savedUser, _term = savedTerm;

  openSheet(`
    <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:6px">¿Quién hace este export?</div>
    <div style="font-size:0.7rem;color:var(--text3);margin-bottom:16px">Necesito tu nombre y terminal para incluirlos en el fichero.</div>

    <div style="margin-bottom:12px">
      <div class="qty-label" style="margin-bottom:6px">Nombre y apellido</div>
      <input id="exp-name" type="text" autocomplete="name"
             style="width:100%;background:var(--surface2);border-radius:10px;padding:11px 13px;color:var(--text);font-size:0.88rem"
             placeholder="Ej: Juan García" value="${savedUser}">
    </div>

    <div style="margin-bottom:18px">
      <div class="qty-label" style="margin-bottom:8px">Terminal</div>
      <div style="display:flex;gap:8px">
        ${TERMINALS.map(t => `
          <button data-term="${t}" style="
            flex:1;padding:12px;border-radius:10px;font-size:0.9rem;font-weight:800;
            background:${t === savedTerm ? 'var(--accent)' : 'var(--surface2)'};
            color:${t === savedTerm ? '#fff' : 'var(--text3)'}">
            ${t}
          </button>`).join('')}
      </div>
    </div>

    <button id="exp-confirm" class="add-btn"
            style="opacity:${savedUser.trim() && savedTerm ? '1' : '0.4'}"
            ${savedUser.trim() && savedTerm ? '' : 'disabled'}>
      Continuar con el export →
    </button>
  `);

  const updateBtn = () => {
    const ok  = _name.trim() && _term;
    const btn = document.getElementById('exp-confirm');
    if (!btn) return;
    btn.disabled      = !ok;
    btn.style.opacity = ok ? '1' : '0.4';
  };

  document.getElementById('exp-name').addEventListener('input', e => {
    _name = e.target.value;
    updateBtn();
  });

  document.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => {
      _term = btn.dataset.term;
      document.querySelectorAll('[data-term]').forEach(b => {
        b.style.background = b.dataset.term === _term ? 'var(--accent)' : 'var(--surface2)';
        b.style.color      = b.dataset.term === _term ? '#fff' : 'var(--text3)';
      });
      updateBtn();
    });
  });

  document.getElementById('exp-confirm').addEventListener('click', () => {
    if (!_name.trim() || !_term) return;
    localStorage.setItem('ic_user', _name.trim());
    localStorage.setItem(terminalKey, _term);
    closeSheet();
    // Actualizar el input visible en Resumen si sigue montado
    const inp = document.getElementById('inp-username');
    if (inp) inp.value = _name.trim();
    onConfirmed();
  });
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
