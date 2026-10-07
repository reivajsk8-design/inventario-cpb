// js/tienda.js — tienda de esta PDA (Barcelona / Tenerife): se pregunta una vez al arrancar y se cambia en Resumen.
import { openSheet, closeSheet, toast } from './ui.js';
import { TIENDAS, normTienda } from './tienda-core.js';

import { esc as escH } from './ui.js';
import { cargar as cargarTabaco, esAdminPin } from './tabaco-store.js';
import { pinValido } from './tabaco-core.js';
import { PIN_SUP_KEY, creaPinSupervisor, compruebaPinSupervisor } from './tienda-core.js';

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

// ── Candado de «Cambiar tienda» (07-10-2026, Jose: «que solo yo pueda cambiarla») ──
// Vale el PIN de administrador del módulo Tabaco si esta PDA lo tiene; si no, un PIN de supervisor propio de la PDA
// que se crea la primera vez que alguien pulsa Cambiar (y se repite para evitar errores de tecleo). 5 fallos → 30 s.
let _supFallos = 0, _supBloqueo = 0;
function leePinSup() { try { return JSON.parse(localStorage.getItem(PIN_SUP_KEY) || 'null'); } catch (e) { return null; } }
function guardaPinSup(v) { try { localStorage.setItem(PIN_SUP_KEY, JSON.stringify(v)); } catch (e) {} }

function pedirPinNumpad({ titulo, sub, verifica }) {
  return new Promise(resolve => {
    let pin = '', resuelto = false;
    const close = openSheet(`
      <div class="tb-pin-title">${escH(titulo)}</div>
      <div class="tb-pin-sub" id="sup-pin-sub">${escH(sub)}</div>
      <div class="tb-pin-dots" id="sup-dots">${'<i></i>'.repeat(6)}</div>
      <div class="numpad" id="sup-np">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="np-btn" data-n="${n}">${n}</button>`).join('')}
        <button class="np-btn" data-n="del">⌫</button><button class="np-btn" data-n="0">0</button><button class="np-btn confirm" data-n="ok">✓</button>
      </div>`, () => { if (!resuelto) { resuelto = true; resolve(null); } });
    const pinta = () => document.querySelectorAll('#sup-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const msg = t => { const el = document.getElementById('sup-pin-sub'); if (el) el.textContent = t; };
    document.getElementById('sup-np').addEventListener('click', async e => {
      const n = e.target.dataset.n; if (!n) return;
      if (Date.now() < _supBloqueo) { msg(`Demasiados intentos: espera ${Math.ceil((_supBloqueo - Date.now()) / 1000)} s`); return; }
      if (n === 'del') { pin = pin.slice(0, -1); pinta(); return; }
      if (n !== 'ok') { if (pin.length < 6) pin += n; pinta(); return; }
      if (!pinValido(pin)) { msg('El PIN tiene de 4 a 6 dígitos'); return; }
      if (verifica && !(await verifica(pin))) {
        _supFallos++; pin = ''; pinta();
        if (_supFallos >= 5) { _supBloqueo = Date.now() + 30000; _supFallos = 0; msg('Demasiados intentos: espera 30 s'); return; }
        msg('PIN no reconocido'); return;
      }
      _supFallos = 0; resuelto = true; close(); resolve(pin);
    });
  });
}

async function candadoSupervisor() {
  const tab = cargarTabaco();
  const admin = (tab && tab.admin && tab.admin.hash) ? tab : null;
  const sup = leePinSup();
  if (!admin && !sup) {
    const p1 = await pedirPinNumpad({ titulo: 'Crea el PIN de supervisor', sub: 'Solo quien lo sepa podrá cambiar la tienda de esta PDA (4 a 6 dígitos)' });
    if (!p1) return false;
    const p2 = await pedirPinNumpad({ titulo: 'Repite el PIN', sub: 'Para comprobar que no hay un error de tecleo', verifica: async p => p === p1 });
    if (!p2) return false;
    guardaPinSup(await creaPinSupervisor(p1)); toast('PIN de supervisor guardado en esta PDA', 'green');
    return true;
  }
  const pin = await pedirPinNumpad({
    titulo: 'PIN de supervisor',
    sub: admin ? 'El PIN de administrador del Tabaco (o el de supervisor)' : 'Solo quien tenga el PIN de supervisor de esta PDA',
    verifica: async p => (admin ? await esAdminPin(admin, p) : false) || (sup ? await compruebaPinSupervisor(p, sup) : false),
  });
  return !!pin;
}

// Hoja para cambiar la tienda desde Resumen (protegida por el candado de arriba).
export async function openCambiarTienda(onDone) {
  if (!(await candadoSupervisor())) return;
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
