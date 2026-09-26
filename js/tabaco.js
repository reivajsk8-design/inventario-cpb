// js/tabaco.js — pestaña «Tabaco almacén»: setup, inicio, PIN, buscador, salida, entrada y recepción
import { getAllProducts } from './db.js';
import { openSheet, closeSheet, openQtySheet, toast, esc } from './ui.js';
import { startScanner } from './scanner.js';
import { matchesEan, openAssignEanSheet } from './eans.js';
import { cameraSupported, openCamera, closeCamera, resumeCamera, beepError, beepMatch } from './camera-scanner.js';
import { esTabaco, infoRefs, valesPendientes, descuadres, anulados, totalLineas, fmtFecha, fmtHora, siguienteVale, pinValido } from './tabaco-core.js';
import { cargar, guardar, crear, registrar, verificarIntegridad, buscarPersonaPorPin, esAdminPin } from './tabaco-store.js';
import { abrirInventario } from './tabaco-inventario.js';
import { abrirStock, abrirDescuadres, abrirHistorico, abrirAjustes } from './tabaco-historico.js';

const TERMINALS = ['D', 'MSC', 'E'];
let _estado = null, _all = [], _integridad = { ok: true, problemas: [], n: 0 }, _onEan = null, _onCam = null, _pinFallos = 0, _pinBloqueoHasta = 0;

const cont = () => document.getElementById('main');

export const ctx = {
  get estado() { return _estado; },
  catalogo,
  info: () => infoRefs(_estado.movs),
  pedirPin,
  refrescar,
  buscarArticulo,
  setOnEan: fn => { _onEan = fn; },
  toast, esc,
};

export async function mount() {
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const raw = await getAllProducts();
  const newArts = Object.values(JSON.parse(localStorage.getItem('ia') || '{}'));
  _all = [...raw, ...newArts].map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);
  _estado = cargar();
  if (_estado) _integridad = await verificarIntegridad(_estado);

  const navBtn = document.getElementById('btn-nav-right');
  if (cameraSupported()) {
    navBtn.textContent = '📷';
    navBtn.onclick = () => { if (_onEan) _onCam(); else toast('Abre una salida, entrada o inventario para escanear'); };
  }
  _onCam = () => openCamera(ean => manejarEan(ean, () => resumeCamera()), toast);
  document.getElementById('btn-cam-close').addEventListener('click', () => closeCamera());
  startScanner(ean => manejarEan(ean));
  renderInicio();
}

export function unmount() {
  closeCamera(); _onEan = null;
  startScanner(null);   // suelta la pistola: si no, seguiría leyendo en Lista, Resumen…
  const navBtn = document.getElementById('btn-nav-right');
  navBtn.textContent = '?'; navBtn.onclick = navBtn._tutorialHandler || null;
}

function manejarEan(ean, onDone) {
  if (!_onEan) { beepError(); toast('Abre una salida, entrada o inventario para escanear'); return; }
  const p = _all.find(x => matchesEan(x, ean));
  if (!p) {
    beepError();
    // Siga como siga la hoja (asignar el EAN o cerrarla), hay que reanudar la cámara una sola vez.
    let hecho = false;
    const seguir = () => { if (hecho) return; hecho = true; onDone && onDone(); };
    openAssignEanSheet(ean, _all, prod => { _onEan(prod); seguir(); }, seguir);
    return;
  }
  beepMatch(); _onEan(p); onDone && onDone();
}

function catalogo() {
  const info = infoRefs(_estado.movs), enStock = Object.keys(_estado.stock || {});
  const tab = _all.filter(esTabaco);
  const refs = new Set(tab.map(p => p.ref));
  for (const ref of enStock) if (!refs.has(ref)) { const p = _all.find(x => x.ref === ref); tab.push(p || { ref, name: (info[ref] && info[ref].name) || ref, ean: (info[ref] && info[ref].ean) || '', family: 'TABACO', proxium: '' }); }
  return tab.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function refrescar() {
  if (!_estado) { renderInicio(); return; }   // sin control creado todavía: el inicio enseña el setup
  _integridad = await verificarIntegridad(_estado); renderInicio();
}

// ---------- setup ----------
function renderSetup() {
  _onEan = null;
  cont().innerHTML = `
    <div class="tb-wrap">
      <div class="tb-head"><h2>🚬 Control de tabaco del almacén</h2></div>
      <div class="tb-card"><div class="tb-k">Primera vez en este móvil</div>
        <div class="tb-s" style="margin-top:6px">Crea el PIN de administrador (de 4 a 6 dígitos). Con él darás de alta a las personas que sacan tabaco, regularizarás descuadres y verás los ajustes. Guárdalo bien: no se puede recuperar.</div></div>
      <label class="tb-k" style="font-size:0.75rem">Terminal</label>
      <div class="chip-row" id="tb-term">${TERMINALS.map(t => `<button class="chip ${t === 'E' ? 'on' : 'off'}" data-t="${t}">Term. ${t}</button>`).join('')}</div>
      <input class="tb-input" id="tb-pin1" type="password" inputmode="numeric" maxlength="6" placeholder="PIN de administrador">
      <input class="tb-input" id="tb-pin2" type="password" inputmode="numeric" maxlength="6" placeholder="Repite el PIN">
      <button class="add-btn" id="tb-crear">Crear el control de tabaco</button>
    </div>`;
  let term = 'E';
  document.getElementById('tb-term').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; term = b.dataset.t; document.querySelectorAll('#tb-term .chip').forEach(c => { c.classList.toggle('on', c === b); c.classList.toggle('off', c !== b); }); });
  document.getElementById('tb-crear').addEventListener('click', async () => {
    const a = document.getElementById('tb-pin1').value, b = document.getElementById('tb-pin2').value;
    if (!pinValido(a)) return toast('El PIN debe tener de 4 a 6 dígitos', 'red');
    if (a !== b) return toast('Los dos PIN no coinciden', 'red');
    _estado = await crear(term, a);
    toast('Control de tabaco creado. Ahora da de alta a las personas en ⚙ Ajustes.', 'green', 3500);
    await refrescar();
  });
}

// ---------- inicio ----------
export function renderInicio() {
  if (!_estado) return renderSetup();
  _onEan = null;
  const e = _estado, stock = e.stock || {}, total = Object.values(stock).reduce((a, b) => a + b, 0);
  const an = anulados(e.movs), salidas = e.movs.filter(m => m.tipo === 'salida' && !an.has(m.id)), ult = salidas[salidas.length - 1];
  const pend = valesPendientes(e.movs, Date.now(), e.ajustes.horasAvisoVale), desc = descuadres(e.movs).filter(d => d.estado === 'pendiente');
  const borradorS = e.salidaEnCurso && e.salidaEnCurso.lineas.length, borradorI = e.inventarioEnCurso && Object.keys(e.inventarioEnCurso.contado).length;
  cont().innerHTML = `
    <div class="tb-wrap">
      <div class="tb-banner ${_integridad.ok ? 'ok' : 'bad'}" id="tb-integ">${_integridad.ok ? `✔ Registro íntegro · ${e.movs.length} movimientos · Terminal ${esc(e.terminal)}` : `⚠ Registro alterado: ${esc(_integridad.problemas.join(' · '))}`}</div>
      <div class="tb-cards">
        <div class="tb-card"><div class="tb-k">Stock almacén</div><div class="tb-v">${total}</div><div class="tb-s">uds en ${Object.keys(stock).length} artículos</div></div>
        <div class="tb-card"><div class="tb-k">Última salida</div><div class="tb-v" style="font-size:1rem">${ult ? esc(ult.persona.nombre) : '—'}</div><div class="tb-s">${ult ? `${fmtFecha(ult.ts)} ${fmtHora(ult.ts)} · ${totalLineas(ult.lineas)} uds · ${esc(ult.extra.vale)}` : 'todavía ninguna'}</div></div>
      </div>
      ${desc.length ? `<div class="tb-alert">⚠ ${desc.length} descuadre${desc.length === 1 ? '' : 's'} pendiente${desc.length === 1 ? '' : 's'} de regularizar</div>` : ''}
      ${pend.filter(v => v.tarde).length ? `<div class="tb-alert">⏳ ${pend.filter(v => v.tarde).map(v => `${esc(v.extra.vale)} (${esc(v.persona.nombre)}, hace ${Math.floor(v.horas)} h)`).join(', ')} sin confirmar en tienda</div>` : ''}
      <div class="tb-actions">
        <button class="tb-btn primary" id="tb-salida">➜ ${borradorS ? `Continuar salida (${e.salidaEnCurso.lineas.length} líneas)` : 'Salida a tienda'}<small>Pistolea los cartones que te llevas. Queda un vale con tu nombre.</small></button>
        <button class="tb-btn" id="tb-recibir">✔ Recibir en tienda<small>${pend.length} vale${pend.length === 1 ? '' : 's'} en camino</small></button>
        <button class="tb-btn" id="tb-entrada">⬅ Entrada al almacén<small>Llega tabaco o vuelve de tienda</small></button>
        <button class="tb-btn" id="tb-inventario">📋 ${borradorI ? 'Continuar inventario' : 'Inventario del almacén'}<small>Contar todo y ajustar el stock</small></button>
        <button class="tb-btn" id="tb-stock">📦 Stock<small>Qué hay ahora mismo</small></button>
        <button class="tb-btn" id="tb-descuadres">⚠ Descuadres<small>${desc.length} pendiente${desc.length === 1 ? '' : 's'}</small></button>
        <button class="tb-btn" id="tb-historico">📜 Histórico<small>Quién sacó qué y cuándo</small></button>
        <button class="tb-btn" id="tb-ajustes">⚙ Ajustes<small>Personas, PIN, copia</small></button>
      </div>
    </div>`;
  document.getElementById('tb-salida').onclick = () => abrirSalida();
  document.getElementById('tb-recibir').onclick = () => abrirRecepcion();
  document.getElementById('tb-entrada').onclick = () => abrirEntrada();
  document.getElementById('tb-inventario').onclick = () => abrirInventario(ctx);
  document.getElementById('tb-stock').onclick = () => abrirStock(ctx);
  document.getElementById('tb-descuadres').onclick = () => abrirDescuadres(ctx);
  document.getElementById('tb-historico').onclick = () => abrirHistorico(ctx);
  document.getElementById('tb-ajustes').onclick = () => abrirAjustes(ctx);
}

// ---------- PIN ----------
// Devuelve la persona identificada, 'admin' si admin:true y el PIN es el de administrador, o null si se cierra.
export function pedirPin({ admin = false, titulo = '¿Quién eres?', sub = 'Teclea tu PIN' } = {}) {
  return new Promise(resolve => {
    let pin = '', resuelto = false;
    const close = openSheet(`
      <div class="tb-pin-title">${esc(admin ? 'PIN de administrador' : titulo)}</div>
      <div class="tb-pin-sub" id="tb-pin-sub">${esc(admin ? 'Solo Jose (o quien tenga el PIN de administrador)' : sub)}</div>
      <div class="tb-pin-dots" id="tb-dots">${'<i></i>'.repeat(6)}</div>
      <div class="numpad" id="tb-np">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="np-btn" data-n="${n}">${n}</button>`).join('')}
        <button class="np-btn" data-n="del">⌫</button><button class="np-btn" data-n="0">0</button><button class="np-btn confirm" data-n="ok">✓</button>
      </div>`, () => { if (!resuelto) { resuelto = true; resolve(null); } });
    const pinta = () => document.querySelectorAll('#tb-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    document.getElementById('tb-np').addEventListener('click', async e => {
      const n = e.target.dataset.n; if (!n) return;
      if (Date.now() < _pinBloqueoHasta) { document.getElementById('tb-pin-sub').textContent = `Demasiados intentos: espera ${Math.ceil((_pinBloqueoHasta - Date.now()) / 1000)} s`; return; }
      if (n === 'del') { pin = pin.slice(0, -1); pinta(); return; }
      if (n !== 'ok') { if (pin.length < 6) pin += n; pinta(); return; }
      if (!pinValido(pin)) { document.getElementById('tb-pin-sub').textContent = 'El PIN tiene de 4 a 6 dígitos'; return; }
      const quien = admin ? (await esAdminPin(_estado, pin) ? 'admin' : null) : await buscarPersonaPorPin(_estado, pin);
      if (!quien) {
        _pinFallos++; pin = ''; pinta(); beepError();
        if (_pinFallos >= 5) { _pinBloqueoHasta = Date.now() + 30000; _pinFallos = 0; }
        document.getElementById('tb-pin-sub').textContent = _pinBloqueoHasta > Date.now() ? 'Demasiados intentos: espera 30 s' : 'PIN no reconocido'; return;
      }
      _pinFallos = 0; resuelto = true; close(); resolve(quien);
    });
  });
}

// ---------- buscador de artículos de tabaco ----------
function buscarArticulo(onElegido, { soloConStock = false } = {}) {
  let todo = false, q = '';
  const stock = _estado.stock || {};
  const lista = () => {
    const base = todo ? _all : catalogo();
    const ql = q.trim().toLowerCase();
    return base.filter(p => (!soloConStock || stock[p.ref] > 0) && (!ql || (p.name || '').toLowerCase().includes(ql) || (p.ref || '').toLowerCase().includes(ql) || (p.ean || '').includes(ql))).slice(0, 60);
  };
  const close = openSheet(`
    <div class="tb-search"><input class="tb-input" id="tb-q" placeholder="Buscar por nombre, código o EAN…" autofocus></div>
    <label class="tb-toggle"><span>Buscar en todo el catálogo (no solo tabaco)</span><input type="checkbox" id="tb-todo"></label>
    <div class="tb-lines" id="tb-res"></div>`);
  const pinta = () => {
    const items = lista();
    document.getElementById('tb-res').innerHTML = items.length ? items.map(p => `<button class="tb-line" data-ref="${esc(p.ref)}" style="width:100%;text-align:left"><div class="tb-n">${esc(p.name)}<div class="tb-m">${esc(p.ref)}${p.ean ? ' · ' + esc(p.ean) : ''}</div></div><div class="tb-q">${stock[p.ref] || 0}</div></button>`).join('') : '<div class="tb-empty">Nada que coincida</div>';
  };
  document.getElementById('tb-q').addEventListener('input', e => { q = e.target.value; pinta(); });
  document.getElementById('tb-todo').addEventListener('change', e => { todo = e.target.checked; pinta(); });
  document.getElementById('tb-res').addEventListener('click', e => { const b = e.target.closest('[data-ref]'); if (!b) return; const p = (todo ? _all : catalogo()).find(x => x.ref === b.dataset.ref); close(); onElegido(p); });
  pinta();
}

function abrirSalida() { toast('Pendiente'); }
function abrirEntrada() { toast('Pendiente'); }
function abrirRecepcion() { toast('Pendiente'); }
