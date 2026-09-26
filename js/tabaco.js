// js/tabaco.js — pestaña «Tabaco almacén»: setup, inicio, PIN, buscador, salida, entrada y recepción
import { getAllProducts } from './db.js';
import { openSheet, closeSheet, openQtySheet, toast, esc } from './ui.js';
import { startScanner } from './scanner.js';
import { matchesEan, openAssignEanSheet } from './eans.js';
import { cameraSupported, openCamera, closeCamera, resumeCamera, beepError, beepMatch } from './camera-scanner.js';
import { esTabaco, infoRefs, valesPendientes, descuadres, anulados, totalLineas, fmtFecha, fmtHora, siguienteVale, pinValido } from './tabaco-core.js';
import { cargar, guardar, crear, registrar, verificarIntegridad, buscarPersonaPorPin, esAdminPin, registroAnterior, KEY } from './tabaco-store.js';
import { abrirInventario } from './tabaco-inventario.js';
import { abrirStock, abrirDescuadres, abrirHistorico, abrirAjustes, compartirTexto } from './tabaco-historico.js';

const TERMINALS = ['D', 'MSC', 'E'];
let _estado = null, _all = [], _integridad = { ok: true, problemas: [], n: 0 }, _onEan = null, _onCam = null, _pinFallos = 0, _pinBloqueoHasta = 0;
let _anterior = null;   // rastro de un registro que hubo antes en este móvil (si lo hay)

// Frase del rastro del registro anterior, para el inicio y para Ajustes.
export function textoRegistroAnterior(ant) {
  if (!ant || !(ant.seq > 0)) return '';
  const cuando = ant.ts || ant.guardado;
  return `Este móvil tuvo un registro anterior de ${ant.seq} movimiento${ant.seq === 1 ? '' : 's'}`
    + (cuando ? ` (último ${fmtFecha(cuando)} ${fmtHora(cuando)})` : '');
}

const cont = () => document.getElementById('main');

// Guardar puede fallar (otra ventana se ha adelantado, o el móvil no tiene sitio): se avisa con
// un toast en vez de dejar la pantalla a medias. Devuelve si se pudo guardar.
export function guardaAviso(estado) {
  try { guardar(estado); return true; }
  catch (err) { toast((err && err.message) || 'No se pudo guardar', 'red', 4000); return false; }
}

export const ctx = {
  get estado() { return _estado; },
  catalogo,
  producto: ref => _all.find(p => p.ref === ref) || null,   // ¿conoce la app esta REF? (aunque no sea tabaco)
  info: () => infoRefs(_estado.movs),
  pedirPin,
  refrescar,
  buscarArticulo,
  setOnEan: fn => { _onEan = fn; },
  guardar: guardaAviso,   // guardar avisando si otra ventana se ha adelantado
  anterior: () => textoRegistroAnterior(_anterior),   // rastro de un registro anterior (o '')
  toast, esc,
};

// Otra ventana (o la app instalada) ha escrito en `itab`: se recarga el estado y se repinta,
// así las dos pantallas dicen lo mismo y nadie sigue trabajando sobre un registro viejo.
function onStorage(ev) {
  if (ev && ev.key && ev.key !== KEY) return;
  _estado = cargar();
  toast('El control de tabaco ha cambiado en otra ventana; pantalla actualizada.', '', 3500);
  refrescar();
}

export async function mount() {
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const raw = await getAllProducts();
  const newArts = Object.values(JSON.parse(localStorage.getItem('ia') || '{}'));
  _all = [...raw, ...newArts].map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);
  _estado = cargar();
  if (_estado) _integridad = await verificarIntegridad(_estado);
  _anterior = await registroAnterior();

  const navBtn = document.getElementById('btn-nav-right');
  if (cameraSupported()) {
    navBtn.textContent = '📷';
    navBtn.onclick = () => { if (_onEan) _onCam(); else toast('Abre una salida, entrada o inventario para escanear'); };
  }
  _onCam = () => openCamera(ean => manejarEan(ean, () => resumeCamera()), toast);
  document.getElementById('btn-cam-close').addEventListener('click', () => closeCamera());
  window.removeEventListener('storage', onStorage);   // una sola suscripción, aunque se entre y salga
  window.addEventListener('storage', onStorage);
  startScanner(ean => manejarEan(ean));
  renderInicio();
}

export function unmount() {
  closeCamera(); _onEan = null;
  window.removeEventListener('storage', onStorage);
  startScanner(null);   // suelta la pistola: si no, seguiría leyendo en Lista, Resumen…
  const navBtn = document.getElementById('btn-nav-right');
  navBtn.textContent = '?'; navBtn.onclick = navBtn._tutorialHandler || null;
}

// Una lectura (pistola o cámara). `onDone` reanuda la cámara: la pantalla que escucha
// (`_onEan`) recibe el artículo y decide cuándo ha terminado (al confirmar la cantidad).
function manejarEan(ean, onDone) {
  if (!_onEan) { beepError(); toast('Abre una salida, entrada o inventario para escanear'); return; }
  const p = _all.find(x => matchesEan(x, ean));
  // Siga como siga la lectura (cantidad confirmada, asignar el EAN o cerrar la hoja), hay que reanudar la cámara una sola vez.
  let hecho = false;
  const seguir = () => { if (hecho) return; hecho = true; onDone && onDone(); };
  if (!p) {
    beepError();
    openAssignEanSheet(ean, _all, prod => { _onEan(prod, seguir); }, seguir);
    return;
  }
  beepMatch(); _onEan(p, seguir);
}

function catalogo() {
  const info = infoRefs(_estado.movs), enStock = Object.keys(_estado.stock || {});
  const tab = _all.filter(esTabaco);
  const refs = new Set(tab.map(p => p.ref));
  for (const ref of enStock) if (!refs.has(ref)) { const p = _all.find(x => x.ref === ref); tab.push(p || { ref, name: (info[ref] && info[ref].name) || ref, ean: (info[ref] && info[ref].ean) || '', family: 'TABACO', proxium: '' }); }
  return tab.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function refrescar() {
  _anterior = await registroAnterior();
  if (!_estado) { renderInicio(); return; }   // sin control creado todavía: el inicio enseña el setup
  _integridad = await verificarIntegridad(_estado); renderInicio();
}

// ---------- setup ----------
function renderSetup() {
  _onEan = null;
  cont().innerHTML = `
    <div class="tb-wrap">
      <div class="tb-head"><h2>🚬 Control de tabaco del almacén</h2></div>
      ${textoRegistroAnterior(_anterior) ? `<div class="tb-alert">⚠ ${esc(textoRegistroAnterior(_anterior))}</div>` : ''}
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
  const e = _estado, stock = e.stock || {}, total = Object.values(stock).reduce((a, b) => a + b, 0), nRefs = Object.keys(stock).length;
  const an = anulados(e.movs), salidas = e.movs.filter(m => m.tipo === 'salida' && !an.has(m.id)), ult = salidas[salidas.length - 1];
  const pend = valesPendientes(e.movs, Date.now(), e.ajustes.horasAvisoVale), desc = descuadres(e.movs).filter(d => d.estado === 'pendiente');
  const borradorS = e.salidaEnCurso && e.salidaEnCurso.lineas.length, borradorE = e.entradaEnCurso && e.entradaEnCurso.lineas.length, borradorI = e.inventarioEnCurso && Object.keys(e.inventarioEnCurso.contado).length;
  cont().innerHTML = `
    <div class="tb-wrap">
      <div class="tb-banner ${_integridad.ok ? 'ok' : 'bad'}" id="tb-integ">${_integridad.ok ? `✔ Registro íntegro · ${e.movs.length} movimientos · Terminal ${esc(e.terminal)}` : `⚠ Registro alterado: ${esc(_integridad.problemas.join(' · '))}`}</div>
      <div class="tb-cards">
        <div class="tb-card"><div class="tb-k">Stock almacén</div><div class="tb-v">${total}</div><div class="tb-s">uds en ${nRefs} artículo${nRefs === 1 ? '' : 's'}</div></div>
        <div class="tb-card"><div class="tb-k">Última salida</div><div class="tb-v" style="font-size:1rem">${ult ? esc(ult.persona.nombre) : '—'}</div><div class="tb-s">${ult ? `${fmtFecha(ult.ts)} ${fmtHora(ult.ts)} · ${totalLineas(ult.lineas)} uds · ${esc(ult.extra.vale)}` : 'todavía ninguna'}</div></div>
      </div>
      ${textoRegistroAnterior(_anterior) ? `<div class="tb-alert">⚠ ${esc(textoRegistroAnterior(_anterior))}</div>` : ''}
      ${desc.length ? `<div class="tb-alert">⚠ ${desc.length} descuadre${desc.length === 1 ? '' : 's'} pendiente${desc.length === 1 ? '' : 's'} de regularizar</div>` : ''}
      ${pend.filter(v => v.tarde).length ? `<div class="tb-alert">⏳ ${pend.filter(v => v.tarde).map(v => `${esc(v.extra.vale)} (${esc(v.persona.nombre)}, hace ${Math.floor(v.horas)} h)`).join(', ')} sin confirmar en tienda</div>` : ''}
      <div class="tb-actions">
        <button class="tb-btn primary" id="tb-salida">➜ ${borradorS ? `Continuar salida (${e.salidaEnCurso.lineas.length} líneas)` : 'Salida a tienda'}<small>Pistolea los cartones que te llevas. Queda un vale con tu nombre.</small></button>
        <button class="tb-btn" id="tb-recibir">✔ Recibir en tienda<small>${pend.length} vale${pend.length === 1 ? '' : 's'} en camino</small></button>
        <button class="tb-btn" id="tb-entrada">⬅ ${borradorE ? `Continuar entrada (${e.entradaEnCurso.lineas.length} líneas)` : 'Entrada al almacén'}<small>Llega tabaco o vuelve de tienda</small></button>
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

// Las líneas de una salida se comprueban contra el stock al ponerlas, pero un borrador de ayer
// (o un inventario de por medio) puede dejarlas por encima de lo que hay AHORA. Devuelve las
// líneas que se pasan, sumando por artículo.
function lineasQueSePasan(lineas, stock) {
  const porRef = {};
  for (const l of lineas) porRef[l.ref] = (porRef[l.ref] || 0) + l.qty;
  return Object.keys(porRef).filter(ref => porRef[ref] > (stock[ref] || 0))
    .map(ref => ({ ref, pide: porRef[ref], hay: stock[ref] || 0, name: (lineas.find(l => l.ref === ref) || {}).name || ref }));
}

// ---------- salida a tienda / entrada al almacén ----------
// La misma pantalla sirve para las dos: una lista de líneas que se llena pistoleando.
// Cada línea se guarda en el borrador (`salidaEnCurso` / `entradaEnCurso`), así que si el
// móvil se apaga o se cambia de pestaña, la salida se retoma donde iba. Dos reglas:
//  · retomar un borrador SIEMPRE pide el PIN (si no, cualquiera registraría a nombre de otro);
//  · un borrador sin líneas no se guarda (teclear el PIN y arrepentirse no deja rastro).
// tipo: 'salida' | 'entrada'
async function abrirMovimiento(tipo) {
  const e = _estado, clave = tipo === 'salida' ? 'salidaEnCurso' : 'entradaEnCurso';
  // Mientras se teclea el PIN otra ventana puede haber cambiado el registro (y `mount()` habrá
  // cargado un estado nuevo): lo de antes ya no vale, se vuelve a empezar.
  const mismoEstado = () => {
    if (_estado === e) return true;
    toast('El control de tabaco ha cambiado en otra ventana: vuelve a empezar.', 'red', 4000);
    return false;
  };
  const nuevo = quien => ({ personaId: quien.id, personaNombre: quien.nombre, lineas: [], nota: '', motivo: tipo === 'entrada' ? 'Llegada CISA' : '', iniciada: new Date().toISOString() });
  let borr = e[clave];
  if (borr) {
    const quien = await pedirPin({ titulo: `Continuar ${tipo === 'salida' ? 'salida' : 'entrada'} de ${borr.personaNombre}`, sub: 'Teclea tu PIN' });
    if (!quien || !mismoEstado()) return;
    if (quien.id !== borr.personaId) {   // es otra persona: o descarta lo de su compañero, o no sigue
      if (!confirm(`Este borrador es de ${borr.personaNombre} (${borr.lineas.length} líneas). ¿Descartarlo y empezar el tuyo?`)) return;
      _estado[clave] = null; guardaAviso(_estado); borr = nuevo(quien);
    }
  } else {
    const quien = await pedirPin({ titulo: tipo === 'salida' ? '¿Quién saca el tabaco?' : '¿Quién registra la entrada?' });
    if (!quien || !mismoEstado()) return;
    borr = nuevo(quien);
  }
  // Retomar un borrador de salida de hace rato: si entre medias ha bajado el stock (o se ha
  // contado el almacén), se avisa una vez para que se ajusten las líneas antes de confirmar.
  if (tipo === 'salida' && borr.lineas.length) {
    const malas = lineasQueSePasan(borr.lineas, _estado.stock || {});
    if (malas.length) toast(`Ojo: el borrador pide más de lo que hay ahora en el almacén (${malas.map(m => `${m.name}: lleva ${m.pide}, hay ${m.hay}`).join(' · ')}). Ajusta las líneas.`, 'red', 5000);
  }
  // El borrador solo entra en el estado guardado cuando tiene líneas (y sale al quedarse sin ellas).
  const guardaBorrador = () => {
    if (borr.lineas.length) _estado[clave] = borr;
    else if (_estado[clave] === borr) _estado[clave] = null;
    guardaAviso(_estado);
  };
  const stock = () => _estado.stock || {};
  const enBorrador = ref => borr.lineas.filter(l => l.ref === ref).reduce((a, l) => a + l.qty, 0);
  // `onDone` (opcional) reanuda la cámara: se llama cuando la lectura queda resuelta.
  const añadir = (p, onDone) => {
    const done = () => { if (onDone) onDone(); };
    const disponible = (stock()[p.ref] || 0) - enBorrador(p.ref);
    if (tipo === 'salida' && disponible <= 0) {
      beepError();
      const ov = document.getElementById('sheet-overlay');   // si venía de la hoja «EAN no encontrado», ciérrala
      if (ov && !ov.classList.contains('hidden')) closeSheet();
      toast(`No consta stock de ${p.name} en el almacén (hay ${stock()[p.ref] || 0}). Si está mal, haz un inventario.`, 'red', 3500);
      return done();
    }
    openQtySheet(p, tipo === 'salida' ? [1, 2, 5, 10] : [1, 5, 10, 20], tipo === 'salida' ? 'Sacar ×{n}' : 'Entrar ×{n}', qty => {
      if (tipo === 'salida' && qty > disponible) { beepError(); toast(`Solo hay ${disponible} de ${p.name} en el almacén`, 'red', 3500); return done(); }
      const l = borr.lineas.find(x => x.ref === p.ref);
      if (l) l.qty += qty; else borr.lineas.push({ ref: p.ref, name: p.name || p.ref, ean: p.ean || '', qty });
      guardaBorrador(); pinta(); done();
    });
  };
  _onEan = añadir;
  let enviando = false;
  const pinta = () => {
    const total = totalLineas(borr.lineas);
    cont().innerHTML = `
      <div class="tb-wrap">
        <div class="tb-head"><h2>${tipo === 'salida' ? '➜ Salida a tienda' : '⬅ Entrada al almacén'}</h2><button class="tb-link" id="tb-cancel">Cancelar</button></div>
        <div class="tb-card"><div class="tb-k">${esc(borr.personaNombre)}</div><div class="tb-v">${total} <span style="font-size:0.85rem;font-weight:600">uds · ${borr.lineas.length} artículo${borr.lineas.length === 1 ? '' : 's'}</span></div><div class="tb-s">Pistolea o usa la cámara 📷 (arriba a la derecha). Cada lectura pide la cantidad.</div></div>
        ${tipo === 'entrada' ? `<div class="chip-row" id="tb-motivo">${['Llegada CISA', 'Vuelve de tienda', 'Otro'].map(m => `<button class="chip ${borr.motivo === m ? 'on' : 'off'}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : ''}
        <button class="tb-btn" id="tb-buscar">🔍 Buscar artículo<small>si no lee el código</small></button>
        <div class="tb-lines">${borr.lineas.length ? borr.lineas.map((l, i) => `<button class="tb-line" data-i="${i}" style="width:100%;text-align:left"><div class="tb-n">${esc(l.name)}<div class="tb-m">${esc(l.ref)} · en almacén ${stock()[l.ref] || 0}</div></div><div class="tb-q">${l.qty}</div></button>`).join('') : '<div class="tb-empty">Todavía no hay líneas</div>'}</div>
        <input class="tb-input" id="tb-nota" placeholder="Nota (precinto, caja, observación…)" value="${esc(borr.nota)}">
        <button class="add-btn" id="tb-confirmar" ${borr.lineas.length ? '' : 'disabled style="opacity:0.4"'}>${tipo === 'salida' ? `Confirmar salida (${total} uds)` : `Confirmar entrada (${total} uds)`}</button>
      </div>`;
    document.getElementById('tb-cancel').onclick = () => { if (!borr.lineas.length || confirm('¿Cancelar y borrar estas líneas? No queda registrado.')) { _estado[clave] = null; guardaAviso(_estado); refrescar(); } };
    document.getElementById('tb-buscar').onclick = () => buscarArticulo(añadir, { soloConStock: tipo === 'salida' });
    document.getElementById('tb-nota').oninput = ev => { borr.nota = ev.target.value; guardaBorrador(); };
    const mot = document.getElementById('tb-motivo'); if (mot) mot.onclick = ev => { const b = ev.target.closest('[data-m]'); if (!b) return; borr.motivo = b.dataset.m; guardaBorrador(); pinta(); };
    document.querySelectorAll('.tb-lines [data-i]').forEach(b => b.onclick = () => editarLinea(borr, +b.dataset.i, tipo, pinta, guardaBorrador));
    document.getElementById('tb-confirmar').onclick = () => confirmar();
  };
  const confirmar = async () => {
    if (!borr.lineas.length || enviando) return;
    if (tipo === 'salida') {   // último control: del almacén no puede salir lo que no hay
      const malas = lineasQueSePasan(borr.lineas, stock());
      if (malas.length) {
        const m = malas[0];
        beepError();
        toast(`No se puede confirmar: de ${m.name} solo hay ${m.hay} en el almacén (la salida lleva ${m.pide}). Ajusta la línea.`, 'red', 5000);
        pinta();
        return;
      }
    }
    enviando = true;
    try {
      const persona = { id: borr.personaId, nombre: borr.personaNombre };
      const extra = tipo === 'salida' ? { vale: siguienteVale(_estado.movs), destino: 'tienda' } : { motivo: borr.motivo || 'Otro' };
      const mov = await registrar(_estado, { tipo, persona, lineas: borr.lineas, nota: borr.nota, extra });
      _estado[clave] = null; guardaAviso(_estado); _onEan = null;
      mostrarVale(mov);
    } catch (err) {
      toast('No se pudo registrar: ' + ((err && err.message) || err), 'red', 4000);
    } finally { enviando = false; }
  };
  pinta();
}

// Tocar una línea: cambiar la cantidad o quitarla.
function editarLinea(borr, i, tipo, repinta, guarda) {
  const l = borr.lineas[i], disponible = ((_estado.stock || {})[l.ref] || 0);
  openQtySheet({ ...l, family: 'TABACO' }, [...new Set([l.qty, 1, 2, 5, 10])], 'Dejar en ×{n}', qty => {
    if (tipo === 'salida' && qty > disponible) { beepError(); return toast(`Solo hay ${disponible} en el almacén`, 'red'); }
    l.qty = qty; guarda(); repinta();
  });
  const add = document.getElementById('np-add');   // botón «Quitar» al pie de la hoja de cantidad
  if (add) {
    const del = document.createElement('button'); del.className = 'tb-danger'; del.style.marginTop = '8px'; del.textContent = '🗑 Quitar esta línea';
    del.onclick = () => { borr.lineas.splice(i, 1); guarda(); closeSheet(); repinta(); };
    add.insertAdjacentElement('afterend', del);
  }
}

// ---------- vale (resguardo) de lo registrado ----------
function textoVale(m) {
  const x = m.extra || {};
  const cab = m.tipo === 'salida' ? `Vale ${x.vale} · salida a tienda` : m.tipo === 'entrada' ? `Entrada al almacén (${x.motivo})` : `Recepción ${x.vale}`;
  const lineas = m.lineas.length ? m.lineas.map(l => `• ${l.qty} × ${l.name} (${l.ref})`) : (m.tipo === 'recepcion' ? ['Nada recibido'] : []);
  const difs = m.tipo === 'recepcion' ? (x.diferencias || []).map(d => `⚠ ${d.name}: enviado ${d.enviado}, recibido ${d.recibido} (${d.dif})`) : [];
  return [`🚬 ${cab}`, `Terminal ${m.terminal} · ${fmtFecha(m.ts)} ${fmtHora(m.ts)} · ${m.persona.nombre}`, ...lineas, ...difs, `Total: ${totalLineas(m.lineas)} uds`, m.nota ? `Nota: ${m.nota}` : '', `Registro #${m.seq} · ${m.hash.slice(0, 10)}`].filter(Boolean).join('\n');
}

function mostrarVale(m) {
  const t = textoVale(m);
  openSheet(`<div class="tb-pin-title">${m.tipo === 'salida' ? '✅ Salida registrada' : m.tipo === 'entrada' ? '✅ Entrada registrada' : '✅ Recepción registrada'}</div>
    <pre style="white-space:pre-wrap;font:inherit;font-size:0.82rem;background:var(--surface2);border-radius:12px;padding:12px;margin:10px 0">${esc(t)}</pre>
    <button class="add-btn" id="tb-share">📤 Compartir</button>
    <button class="tb-link" id="tb-ok" style="width:100%;margin-top:6px">Cerrar</button>`, () => refrescar());
  document.getElementById('tb-share').onclick = () => compartirTexto(t, 'Tabaco almacén');
  document.getElementById('tb-ok').onclick = () => closeSheet();
}

// ---------- recepción en tienda ----------
// El que recibe confirma el vale que salió del almacén. Si la cantidad no cuadra,
// la diferencia queda como descuadre de tránsito (nadie puede taparla).
async function abrirRecepcion() {
  const estadoVale = _estado;   // si otra ventana cambia el registro mientras se teclea el PIN, no se sigue
  const pend = valesPendientes(_estado.movs, Date.now(), _estado.ajustes.horasAvisoVale);
  if (!pend.length) return toast('No hay vales en camino');
  const close = openSheet(`<div class="tb-pin-title">Vales en camino</div><div class="tb-lines" style="margin-top:10px">${pend.map(v => `<button class="tb-line" data-id="${esc(v.id)}" style="width:100%;text-align:left"><div class="tb-n">${esc(v.extra.vale)} · ${esc(v.persona.nombre)}<div class="tb-m">${fmtFecha(v.ts)} ${fmtHora(v.ts)} · ${v.lineas.length} artículo${v.lineas.length === 1 ? '' : 's'}${v.tarde ? ' · ⏳ hace ' + Math.floor(v.horas) + ' h' : ''}</div></div><div class="tb-q">${totalLineas(v.lineas)}</div></button>`).join('')}</div>`);
  document.querySelector('#sheet-content .tb-lines').onclick = async ev => {
    const b = ev.target.closest('[data-id]'); if (!b) return;
    const vale = pend.find(v => v.id === b.dataset.id); close();
    const quien = await pedirPin({ titulo: '¿Quién recibe en tienda?' }); if (!quien) return;
    if (_estado !== estadoVale) return toast('El control de tabaco ha cambiado en otra ventana: vuelve a abrir el vale.', 'red', 4000);
    const recibido = Object.fromEntries(vale.lineas.map(l => [l.ref, l.qty]));
    let nota = '', enviando = false;
    const pinta = () => {
      cont().innerHTML = `<div class="tb-wrap">
        <div class="tb-head"><h2>✔ Recibir ${esc(vale.extra.vale)}</h2><button class="tb-link" id="tb-cancel">Cancelar</button></div>
        <div class="tb-card"><div class="tb-k">Recibe ${esc(quien.nombre)} · sacó ${esc(vale.persona.nombre)}</div><div class="tb-s">Toca una línea si ha llegado una cantidad distinta. ${quien.id === vale.persona.id ? '⚠ Eres la misma persona que sacó el tabaco: quedará marcado.' : ''}</div></div>
        <div class="tb-lines">${vale.lineas.map(l => `<div class="tb-line" data-ref="${esc(l.ref)}" style="cursor:pointer"><div class="tb-n">${esc(l.name)}<div class="tb-m">enviado ${l.qty}</div></div><button class="tb-link" data-cero="${esc(l.ref)}" style="white-space:nowrap">No ha llegado</button><div class="tb-q ${recibido[l.ref] < l.qty ? 'neg' : recibido[l.ref] > l.qty ? 'pos' : ''}">${recibido[l.ref]}</div></div>`).join('')}</div>
        <input class="tb-input" id="tb-nota" placeholder="Nota (precinto roto, caja abierta…)" value="${esc(nota)}">
        <button class="add-btn" id="tb-confirmar">Confirmar recepción</button></div>`;
      document.getElementById('tb-cancel').onclick = () => { if (vale.lineas.every(l => recibido[l.ref] === l.qty) || confirm('¿Salir sin registrar la recepción? Se pierden las cantidades cambiadas.')) refrescar(); };
      document.getElementById('tb-nota').oninput = e2 => { nota = e2.target.value; };
      cont().querySelector('.tb-lines').onclick = e2 => {
        const cero = e2.target.closest('[data-cero]');
        if (cero) { recibido[cero.dataset.cero] = 0; pinta(); return; }
        const fila = e2.target.closest('[data-ref]'); if (!fila) return;
        const l = vale.lineas.find(x => x.ref === fila.dataset.ref);
        openQtySheet({ ...l, family: 'TABACO' }, [...new Set([l.qty, 1, 2, 5])], 'Recibido ×{n}', q => { recibido[l.ref] = q; pinta(); });
      };
      document.getElementById('tb-confirmar').onclick = async () => {
        if (enviando) return;
        enviando = true;
        try {
          const diferencias = vale.lineas.map(l => ({ ref: l.ref, name: l.name, ean: l.ean, enviado: l.qty, recibido: recibido[l.ref], dif: recibido[l.ref] - l.qty })).filter(d => d.dif !== 0);
          const mov = await registrar(_estado, { tipo: 'recepcion', persona: { id: quien.id, nombre: quien.nombre }, lineas: vale.lineas.map(l => ({ ...l, qty: recibido[l.ref] })).filter(l => l.qty > 0), nota,
            extra: { valeId: vale.id, vale: vale.extra.vale, mismaPersona: quien.id === vale.persona.id, diferencias } });
          if (diferencias.length) toast(`Recepción con ${diferencias.length} diferencia${diferencias.length === 1 ? '' : 's'}: queda como descuadre de tránsito`, 'red', 4000);
          mostrarVale(mov);
        } catch (err) {
          toast('No se pudo registrar: ' + ((err && err.message) || err), 'red', 4000);
        } finally { enviando = false; }
      };
    };
    pinta();
  };
}

function abrirSalida() { abrirMovimiento('salida'); }
function abrirEntrada() { abrirMovimiento('entrada'); }
