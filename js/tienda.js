// js/tienda.js — tienda de esta PDA (Barcelona / Tenerife): se pregunta una vez al arrancar y se cambia en Resumen.
import { openSheet, closeSheet, toast } from './ui.js';
import { TIENDAS, normTienda } from './tienda-core.js';

export function getTienda() {
  try { return normTienda(localStorage.getItem('ic_tienda')); } catch (e) { return null; }
}
export function setTienda(t) {
  const v = normTienda(t); if (!v) return;
  try { localStorage.setItem('ic_tienda', v); } catch (e) {}
}
export function tiendaNombre() { return TIENDAS[getTienda() || 'bcn']; }

function botones() {
  return `<div style="display:flex;gap:10px;margin:14px 0 18px;width:100%">
    ${Object.keys(TIENDAS).map(k => `
      <button type="button" data-tienda="${k}" style="flex:1;padding:18px 8px;border-radius:14px;font-size:1rem;font-weight:800;
        background:var(--surface2);color:var(--text3)">${k === 'tf' ? '🏝' : '🏙'}<br>${TIENDAS[k]}</button>`).join('')}
  </div>`;
}
function marca(root, sel) {
  root.querySelectorAll('[data-tienda]').forEach(b => {
    const on = b.dataset.tienda === sel;
    b.style.background = on ? 'var(--accent)' : 'var(--surface2)';
    b.style.color      = on ? '#fff' : 'var(--text3)';
  });
}

// Overlay de bienvenida (mismo estilo que la pregunta del nombre). Resuelve cuando hay tienda guardada.
export function ensureTienda() {
  return new Promise(resolve => {
    if (getTienda()) { resolve(); return; }
    const el = document.createElement('div');
    el.id = 'welcome-tienda';
    el.style.setProperty('--tut-accent', '#0A84FF');
    el.innerHTML = `
      <div class="tut-slides"><div class="tut-slide">
        <div class="tut-icon-wrap"><span class="tut-icon">🏪</span></div>
        <div class="tut-title">¿De qué tienda es esta PDA?</div>
        <div class="tut-body">Los precios que verás serán los de esa tienda. Se puede cambiar en Resumen.</div>
        ${botones()}
      </div></div>
      <div class="tut-footer"><div></div>
        <button id="tienda-ok" class="tut-next tut-next--last" style="opacity:0.4" disabled>Continuar →</button>
      </div>`;
    document.body.appendChild(el);
    let sel = null;
    el.querySelectorAll('[data-tienda]').forEach(b => b.addEventListener('click', () => {
      sel = b.dataset.tienda; marca(el, sel);
      const ok = el.querySelector('#tienda-ok'); ok.disabled = false; ok.style.opacity = '1';
    }));
    el.querySelector('#tienda-ok').addEventListener('click', () => {
      if (!sel) return;
      setTienda(sel);
      el.classList.add('tut-exit');
      setTimeout(() => { el.remove(); resolve(); }, 300);
    });
  });
}

// Hoja para cambiar la tienda desde Resumen.
export function openCambiarTienda(onDone) {
  const actual = getTienda() || 'bcn';
  openSheet(`
    <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:6px">🏪 Tienda de esta PDA</div>
    <div style="font-size:0.72rem;color:var(--text3)">Cambia qué precios se enseñan (Barcelona o Tenerife).</div>
    <div id="sheet-tienda">${botones()}</div>
    <button id="btn-save-tienda" class="add-btn">Guardar</button>`);
  const root = document.getElementById('sheet-tienda');
  let sel = actual; marca(root, sel);
  root.querySelectorAll('[data-tienda]').forEach(b => b.addEventListener('click', () => { sel = b.dataset.tienda; marca(root, sel); }));
  document.getElementById('btn-save-tienda').addEventListener('click', () => {
    setTienda(sel); closeSheet(); toast('Tienda: ' + TIENDAS[sel], 'green');
    if (onDone) onDone();
  });
}
