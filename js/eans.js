// js/eans.js
import { openSheet, closeSheet, toast } from './ui.js';

let _serverEans   = {};
let _pendingCache = null;

export async function loadEansExtra() {
  try {
    const res = await fetch('eans-extra.json?_=' + Date.now());
    _serverEans = await res.json();
  } catch { _serverEans = {}; }
}

function getPending() {
  if (!_pendingCache) _pendingCache = JSON.parse(localStorage.getItem('ix') || '{}');
  return _pendingCache;
}

function savePending(p) {
  _pendingCache = p;
  localStorage.setItem('ix', JSON.stringify(p));
}

export function getExtraEans(ref) {
  const s = _serverEans[ref] || [];
  const l = getPending()[ref]  || [];
  return [...new Set([...s, ...l])];
}

export function matchesEan(p, ean) {
  if (!ean) return false;
  return p.ean === ean || getExtraEans(p.ref).includes(ean);
}

export function isLocalEan(ref, ean) {
  return (getPending()[ref] || []).includes(ean);
}

export function assignEan(ref, ean) {
  const p = { ...getPending() };
  if (!p[ref]) p[ref] = [];
  if (!p[ref].includes(ean)) {
    p[ref] = [...p[ref], ean];
    savePending(p);
  }
}

export function removeLocalEan(ref, ean) {
  const p = { ...getPending() };
  if (!p[ref]) return;
  p[ref] = p[ref].filter(e => e !== ean);
  if (!p[ref].length) delete p[ref];
  savePending(p);
}

export function countPending() {
  return Object.values(getPending()).reduce((s, a) => s + a.length, 0);
}

export function clearPendingEans() {
  savePending({});
}

export function exportEansJSON() {
  const merged = JSON.parse(JSON.stringify(_serverEans));
  for (const [ref, eans] of Object.entries(getPending())) {
    merged[ref] = [...new Set([...(merged[ref] || []), ...eans])];
  }
  for (const ref of Object.keys(merged)) {
    if (!merged[ref].length) delete merged[ref];
  }
  return JSON.stringify(merged, null, 2);
}

export function openAssignEanSheet(ean, products, onAssigned) {
  let query = '';

  const renderResults = () => {
    const resultsEl = document.getElementById('assign-results');
    if (!resultsEl) return;
    const q       = query.toLowerCase();
    const matches = q.length > 1
      ? products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.ref.toLowerCase().includes(q)  ||
          (p.family || '').toLowerCase().includes(q))
      : [];

    if (matches.length === 0 && q.length > 1) {
      resultsEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:0.82rem">Sin resultados</div>`;
    } else if (matches.length > 0) {
      resultsEl.innerHTML = `<div class="prod-list">
        ${matches.slice(0, 12).map(p => `
          <div class="prod-item assign-pick" data-ref="${p.ref}" style="cursor:pointer">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px">
                <span class="prod-tag tag-ref">${p.ref}</span>
                <div class="prod-name">${p.name}</div>
              </div>
              ${p.family ? `<span class="prod-tag tag-family">${p.family}</span>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
      resultsEl.querySelectorAll('.assign-pick').forEach(el => {
        el.addEventListener('click', () => {
          const product = products.find(p => p.ref === el.dataset.ref);
          if (!product) return;
          assignEan(product.ref, ean);
          toast(`EAN asignado a ${product.name}`, 'green');
          onAssigned(product);
        });
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:0.82rem">Escribe para buscar</div>`;
    }
  };

  openSheet(`
    <div style="font-size:0.9rem;font-weight:700;color:var(--text);margin-bottom:2px">EAN no encontrado</div>
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:12px;font-family:monospace;letter-spacing:0.05em">${ean}</div>
    <div class="qty-label" style="margin-bottom:6px">¿A qué artículo pertenece?</div>
    <input id="assign-q" type="text" autocomplete="off" inputmode="text"
           placeholder="Buscar nombre, REF o familia…"
           style="width:100%;background:var(--surface2);border-radius:10px;
                  padding:10px 12px;color:var(--text);font-size:0.85rem;margin-bottom:10px">
    <div id="assign-results">
      <div style="text-align:center;padding:24px;color:var(--text3);font-size:0.82rem">Escribe para buscar</div>
    </div>
  `);

  const inp = document.getElementById('assign-q');
  inp.addEventListener('input', e => {
    query = e.target.value;
    renderResults();
  });
  inp.focus();
}
