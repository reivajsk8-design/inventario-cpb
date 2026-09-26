// js/tabaco-historico.js — stock, descuadres/regularización, histórico/anulación, ajustes y exports del módulo de tabaco
import { openSheet, closeSheet, toast, esc } from './ui.js';
import { descuadres, valesPendientes, anulados, filasExcelHistorico, filasExcelRegularizacion, resumenDia, nombreArchivo, fmtFecha, fmtHora, totalLineas, detalleMov, estadoMov } from './tabaco-core.js';
import { registrar, verificarIntegridad, altaPersona, cambiarPinPersona, bajaPersona, cambiarPinAdmin, exportarCopia, borrarModulo } from './tabaco-store.js';

const cont = () => document.getElementById('main');
const TIPO_TXT = { inventario: '📋 Inventario', salida: '➜ Salida', recepcion: '✔ Recepción', entrada: '⬅ Entrada', anulacion: '↩ Anulación', regularizacion: '🧾 Regularización' };
// Todo lo que registra el administrador (regularizar, anular) va a su nombre: nunca al de una persona.
const ADMIN = { id: 'admin', nombre: 'Administrador' };
const TERMINALS = ['D', 'MSC', 'E'];
// Rótulo de sección / separador de día (sin clase nueva: el CSS del módulo no cambia).
const ROT = 'font-size:0.7rem;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em';
const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

// La librería de Excel solo se baja si de verdad se va a exportar (igual que en Conteos/Resumen).
// Vive aquí y la reutiliza `tabaco-inventario.js` (una sola copia en todo el módulo).
export function ensureXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel (¿sin internet?)'));
    document.head.appendChild(s);
  });
}

export async function descargaExcel(nombre, filas, hoja = 'tabaco') {
  try {
    const XLSX = await ensureXLSX();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), hoja);
    XLSX.writeFile(wb, nombre);
    toast('Excel descargado: ' + nombre, 'green');
  } catch (e) { toast((e && e.message) || 'No se pudo hacer el Excel', 'red', 4000); }
}

// Compartir texto por el menú del móvil (WhatsApp, correo…). Si el móvil no tiene
// «compartir», lo copia al portapapeles. Lo usan el vale de salida/entrada/recepción
// y el resumen del día del histórico.
export async function compartirTexto(texto, titulo) {
  try { if (navigator.share) { await navigator.share({ title: titulo, text: texto }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(texto); toast('Copiado al portapapeles', 'green'); } catch { toast('No se pudo compartir en este dispositivo', 'red'); }
}

function cabecera(titulo, extraHtml = '') { return `<div class="tb-head"><h2>${titulo}</h2><div class="tb-row">${extraHtml}<button class="tb-link" id="tb-volver">‹ Volver</button></div></div>`; }
function bindVolver(ctx) { const b = document.getElementById('tb-volver'); if (b) b.onclick = () => ctx.refrescar(); }

// ---------- stock del almacén ----------
// Cómo afecta cada movimiento al almacén, para leerlo de un golpe: el inventario DEJA en N,
// la salida resta, la entrada suma y la recepción (que pasa en tienda) no toca el almacén.
const SIGNO = {
  inventario: q => ['=' + q, ''],
  salida: q => ['-' + q, 'neg'],
  entrada: q => ['+' + q, 'pos'],
  recepcion: q => [String(q), ''],
};

export function abrirStock(ctx) {
  const stock = () => ctx.estado.stock || {};
  let q = '';
  const items = () => {
    const s = stock(), ql = q.trim().toLowerCase();
    return ctx.catalogo().filter(p => (s[p.ref] || 0) > 0)
      .filter(p => !ql || (p.name || '').toLowerCase().includes(ql) || (p.ref || '').toLowerCase().includes(ql) || (p.ean || '').includes(ql));
  };
  // La tarjeta cuenta SOLO los artículos con stock positivo, para que cuadre con las líneas de abajo
  // (un ajuste raro puede dejar una REF en negativo, y eso no es «hay tabaco en el almacén»).
  const conStock = () => Object.values(stock()).filter(v => v > 0).length;
  const s0 = stock(), uds = Object.values(s0).reduce((a, b) => a + b, 0);
  cont().innerHTML = `
    <div class="tb-wrap">
      ${cabecera('📦 Stock del almacén')}
      <div class="tb-card"><div class="tb-k">Hay ahora mismo</div><div class="tb-v">${uds}</div><div class="tb-s">uds en ${plural(conStock(), 'artículo', 'artículos')} · Terminal ${esc(ctx.estado.terminal)}</div></div>
      <div class="tb-search"><input class="tb-input" id="tb-q" placeholder="Buscar por nombre, código o EAN…"></div>
      <div class="tb-lines" id="tb-stock-lines"></div>
    </div>`;
  bindVolver(ctx);
  const pinta = () => {
    const s = stock(), l = items();
    document.getElementById('tb-stock-lines').innerHTML = l.length
      ? l.map(p => `<button class="tb-line" data-ref="${esc(p.ref)}" style="width:100%;text-align:left"><div class="tb-n">${esc(p.name || p.ref)}<div class="tb-m">${esc(p.ref)}${p.ean ? ' · ' + esc(p.ean) : ''}</div></div><div class="tb-q">${s[p.ref] || 0}</div></button>`).join('')
      : `<div class="tb-empty">${!conStock() && !q.trim() ? 'El almacén está vacío: haz un inventario para empezar' : 'Nada que coincida'}</div>`;
  };
  document.getElementById('tb-q').addEventListener('input', ev => { q = ev.target.value; pinta(); });
  document.getElementById('tb-stock-lines').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ref]'); if (!b) return;
    const p = items().find(x => x.ref === b.dataset.ref);
    if (p) hojaMovsDeRef(ctx, p);
  });
  pinta();
}

// Tocar un artículo: sus últimos 20 movimientos (lo que se sacó, entró, contó…).
function hojaMovsDeRef(ctx, p) {
  const movs = ctx.estado.movs, an = anulados(movs);
  const suyos = movs.filter(m => m.lineas.some(l => l.ref === p.ref)).slice(-20).reverse();
  openSheet(`
    <div class="tb-pin-title">${esc(p.name || p.ref)}</div>
    <div class="tb-pin-sub">${esc(p.ref)} · ${(ctx.estado.stock || {})[p.ref] || 0} uds en el almacén</div>
    <div class="tb-lines" style="margin-top:10px;max-height:55vh;overflow:auto">${suyos.length ? suyos.map(m => {
      const qty = m.lineas.filter(l => l.ref === p.ref).reduce((a, l) => a + l.qty, 0);
      const [txt, cls] = (SIGNO[m.tipo] || (n => [String(n), '']))(qty);
      return `<div class="tb-line"><div class="tb-n">${TIPO_TXT[m.tipo] || esc(m.tipo)} · ${esc(m.persona.nombre)}<div class="tb-m">${fmtFecha(m.ts)} ${fmtHora(m.ts)} · #${m.seq}${an.has(m.id) ? ' · ANULADA' : ''}</div></div><div class="tb-q ${cls}">${txt}</div></div>`;
    }).join('') : '<div class="tb-empty">Sin movimientos de este artículo</div>'}</div>`);
}

// ---------- descuadres y regularización ----------
// Un descuadre es lo que no cuadró al contar (inventario) o al recibir en tienda (tránsito).
// Regularizar NO borra nada: añade un movimiento de ajuste del administrador con el barco
// al que se carga, y de ahí sale el Excel que se manda a la oficina.
export function abrirDescuadres(ctx) {
  let tab = 'pendiente';
  const sel = new Set();
  const todos = () => descuadres(ctx.estado.movs);

  const meta = d => `${esc(d.ref)} · ${d.tipo === 'transito' ? 'tránsito' : 'inventario'} · ${fmtFecha(d.ts)} · ${esc(d.persona)}${d.vale ? ' · ' + esc(d.vale) : ''}`;
  const dif = d => `<div class="tb-q ${d.dif < 0 ? 'neg' : 'pos'}">${d.dif > 0 ? '+' : ''}${d.dif}</div>`;
  const filaPend = d => `<div class="tb-line"><input type="checkbox" data-sel="${esc(d.id)}" ${sel.has(d.id) ? 'checked' : ''} style="width:20px;height:20px;flex:none;accent-color:var(--accent)"><div class="tb-n">${esc(d.name || d.ref)}<div class="tb-m">${meta(d)}</div></div>${dif(d)}</div>`;
  const filaReg = d => `<div class="tb-line"><div class="tb-n">${esc(d.name || d.ref)}<div class="tb-m">${meta(d)} · ajustado ${fmtFecha(d.regularizadoTs)} · barco ${esc(d.barco || '—')}</div></div>${dif(d)}</div>`;

  const regularizar = async ids => {
    if (!ids.length) return;
    const quien = await ctx.pedirPin({ admin: true });
    if (quien !== 'admin') return;
    let enviando = false;
    openSheet(`
      <div class="tb-pin-title">Regularizar ${plural(ids.length, 'descuadre', 'descuadres')}</div>
      <div class="tb-pin-sub">Se apunta como ajuste del administrador. Del registro no se borra nada.</div>
      <input class="tb-input" id="tb-barco" placeholder="Barco (obligatorio)" style="margin-top:12px">
      <input class="tb-input" id="tb-reg-nota" placeholder="Nota (opcional)" style="margin-top:8px">
      <button class="add-btn" id="tb-reg-ok" style="margin-top:12px">Regularizar y bajar el Excel</button>`);
    document.getElementById('tb-reg-ok').onclick = async () => {
      if (enviando) return;
      const barco = document.getElementById('tb-barco').value.trim();
      if (!barco) return toast('Falta el barco al que se carga el ajuste', 'red');
      const nota = document.getElementById('tb-reg-nota').value.trim();
      enviando = true;
      try {
        await registrar(ctx.estado, { tipo: 'regularizacion', persona: ADMIN, lineas: [], nota, extra: { descuadreIds: ids, barco, nota } });
        closeSheet();
        toast(`${plural(ids.length, 'descuadre', 'descuadres')} regularizado${ids.length === 1 ? '' : 's'} al barco ${barco}`, 'green', 3500);
        await descargaExcel(nombreArchivo('regularizacion', ctx.estado.terminal), filasExcelRegularizacion(todos().filter(d => ids.includes(d.id))), 'ajustes');
        ctx.refrescar();
      } catch (err) {
        toast('No se pudo registrar: ' + ((err && err.message) || err), 'red', 4000);
      } finally { enviando = false; }
    };
  };

  const pinta = () => {
    const ds = todos(), pend = ds.filter(d => d.estado === 'pendiente'), regs = ds.filter(d => d.estado === 'regularizado');
    for (const id of [...sel]) if (!pend.some(d => d.id === id)) sel.delete(id);
    const grupos = [...new Set(regs.map(d => d.regularizadoTs))].sort().reverse();
    cont().innerHTML = `
      <div class="tb-wrap">
        ${cabecera('⚠ Descuadres')}
        <div class="tb-tabs" id="tb-dtabs">
          <button class="chip ${tab === 'pendiente' ? 'on' : 'off'}" data-dt="pendiente">Pendientes (${pend.length})</button>
          <button class="chip ${tab === 'regularizado' ? 'on' : 'off'}" data-dt="regularizado">Regularizados</button>
        </div>
        ${tab === 'pendiente' ? `
          <div class="tb-card"><div class="tb-k">Qué es esto</div><div class="tb-s">Lo que no cuadró al contar el almacén o al recibir en tienda. Regularizar no borra nada: apunta el ajuste con el barco al que se carga y saca el Excel.</div></div>
          <div class="tb-lines">${pend.length ? pend.map(filaPend).join('') : '<div class="tb-empty">No hay descuadres pendientes ✔</div>'}</div>
          <button class="add-btn" id="tb-reg-sel" ${sel.size ? '' : 'disabled style="opacity:0.4"'}>Regularizar seleccionados (${sel.size})</button>`
        : (grupos.length ? grupos.map(ts => {
            const g = regs.filter(d => d.regularizadoTs === ts);
            return `<div style="${ROT}">${fmtFecha(ts)} ${fmtHora(ts)} · barco ${esc(g[0].barco || '—')} · ${plural(g.length, 'ajuste', 'ajustes')}</div>
              <div class="tb-lines">${g.map(filaReg).join('')}</div>
              <button class="tb-link" data-excel="${esc(ts)}" style="text-align:left">⬇ Excel de esta regularización</button>`;
          }).join('') : '<div class="tb-lines"><div class="tb-empty">Todavía no se ha regularizado nada</div></div>')}
      </div>`;
    bindVolver(ctx);
    document.getElementById('tb-dtabs').onclick = ev => { const b = ev.target.closest('[data-dt]'); if (!b) return; tab = b.dataset.dt; pinta(); };
    const boton = document.getElementById('tb-reg-sel');
    cont().querySelectorAll('[data-sel]').forEach(c => c.onchange = () => {
      if (c.checked) sel.add(c.dataset.sel); else sel.delete(c.dataset.sel);
      if (boton) { boton.textContent = `Regularizar seleccionados (${sel.size})`; boton.disabled = !sel.size; boton.style.opacity = sel.size ? '' : '0.4'; }
    });
    if (boton) boton.onclick = () => regularizar([...sel]);
    cont().querySelectorAll('[data-excel]').forEach(b => b.onclick = () =>
      descargaExcel(nombreArchivo('regularizacion', ctx.estado.terminal), filasExcelRegularizacion(todos().filter(d => d.regularizadoTs === b.dataset.excel)), 'ajustes'));
  };
  pinta();
}

// ---------- histórico y anulación ----------
// El registro no se edita ni se borra nunca: anular añade un movimiento de anulación (del
// administrador, con motivo) que deshace el stock y deja la salida/entrada marcada «ANULADA».
export function abrirHistorico(ctx) {
  let fTipo = 'todos', fPersona = 'todas', q = '';
  const est = () => ctx.estado;
  const personas = () => [...new Set(est().movs.map(m => m.persona.nombre))].sort();

  // El estado de cada movimiento lo dice el núcleo (el mismo que sale en la columna «Estado» del Excel).
  const filaMov = (m, movs) => {
    const e2 = estadoMov(m, movs), vale = (m.extra || {}).vale || '';
    return `<button class="tb-line" data-mov="${esc(m.id)}" style="width:100%;text-align:left"><div class="tb-n">${TIPO_TXT[m.tipo] || esc(m.tipo)} · ${esc(m.persona.nombre)}<div class="tb-m">${fmtHora(m.ts)} · ${plural(m.lineas.length, 'línea', 'líneas')} / ${totalLineas(m.lineas)} uds${vale ? ' · ' + esc(vale) : ''}${e2 ? ' · ' + e2 : ''}</div></div><div class="tb-q">#${m.seq}</div></button>`;
  };

  const anular = async m => {
    const quien = await ctx.pedirPin({ admin: true });
    if (quien !== 'admin') return;
    let enviando = false;
    openSheet(`
      <div class="tb-pin-title">Anular ${TIPO_TXT[m.tipo]} #${m.seq}</div>
      <div class="tb-pin-sub">No se borra nada: queda apuntada la anulación y el stock vuelve atrás.</div>
      <input class="tb-input" id="tb-motivo-anu" placeholder="Motivo (obligatorio)" style="margin-top:12px">
      <button class="tb-danger" id="tb-anu-ok" style="margin-top:12px">Anular el movimiento #${m.seq}</button>`);
    document.getElementById('tb-anu-ok').onclick = async () => {
      if (enviando) return;
      const motivo = document.getElementById('tb-motivo-anu').value.trim();
      if (!motivo) return toast('Falta el motivo de la anulación', 'red');
      enviando = true;
      try {
        await registrar(ctx.estado, { tipo: 'anulacion', persona: ADMIN, lineas: [], nota: motivo, extra: { anulaId: m.id, anulaSeq: m.seq, motivo } });
        closeSheet();
        toast(`Movimiento #${m.seq} anulado`, 'green', 3500);
        pinta();   // se queda en el histórico, con los filtros y la búsqueda como estaban
      } catch (err) {
        toast('No se pudo registrar: ' + ((err && err.message) || err), 'red', 4000);
      } finally { enviando = false; }
    };
  };

  const detalle = m => {
    const movs = est().movs, an = anulados(movs), pend = new Set(valesPendientes(movs, Date.now(), est().ajustes.horasAvisoVale).map(v => v.id));
    // Quién recibió en tienda este vale (y si hubo pegas), para que el detalle cierre el círculo.
    const rec = m.tipo === 'salida' ? movs.find(x => x.tipo === 'recepcion' && (x.extra || {}).valeId === m.id) : null;
    // La anulación se aplica como resta/suma sobre el stock de AHORA: si después ya se contó el
    // almacén, deshacerla estropearía lo contado. Entonces no se anula: se corrige contando.
    const sigueVivo = (m.tipo === 'salida' && pend.has(m.id)) || (m.tipo === 'entrada' && !an.has(m.id));
    const invPosterior = sigueVivo && movs.some(x => x.tipo === 'inventario' && x.seq > m.seq);
    const anulable = sigueVivo && !invPosterior;
    openSheet(`
      <div class="tb-pin-title">${TIPO_TXT[m.tipo] || esc(m.tipo)} · #${m.seq}</div>
      <div class="tb-pin-sub">${fmtFecha(m.ts)} ${fmtHora(m.ts)} · ${esc(m.persona.nombre)} · Terminal ${esc(m.terminal)}${an.has(m.id) ? ' · ANULADA' : ''}</div>
      <div class="tb-lines" style="margin:10px 0;max-height:40vh;overflow:auto">${m.lineas.length ? m.lineas.map(l => `<div class="tb-line"><div class="tb-n">${esc(l.name || l.ref)}<div class="tb-m">${esc(l.ref)}${l.ean ? ' · ' + esc(l.ean) : ''}</div></div><div class="tb-q">${l.qty}</div></div>`).join('') : '<div class="tb-empty">Sin líneas (no mueve artículos)</div>'}</div>
      <div class="tb-card">
        <div class="tb-k">${plural(m.lineas.length, 'línea', 'líneas')} · ${totalLineas(m.lineas)} uds</div>
        ${m.tipo === 'salida' ? (rec
          ? `<div class="tb-s">✔ Recibido por ${esc(rec.persona.nombre)} · ${fmtFecha(rec.ts)} ${fmtHora(rec.ts)}${(rec.extra || {}).mismaPersona ? ' · ⚠ misma persona' : ''}${((rec.extra || {}).diferencias || []).length ? ' · con diferencias' : ''}</div>`
          : (an.has(m.id) ? '' : '<div class="tb-s">⏳ En camino: nadie lo ha recibido todavía en tienda</div>')) : ''}
        ${m.nota ? `<div class="tb-s">Nota: ${esc(m.nota)}</div>` : ''}
        ${detalleMov(m) ? `<div class="tb-s">${esc(detalleMov(m))}</div>` : ''}
        <div class="tb-s">Registro #${m.seq} · ${esc((m.hash || '').slice(0, 10))}</div>
      </div>
      ${anulable ? '<button class="tb-danger" id="tb-anular" style="margin-top:10px">Anular (admin)</button>'
        : invPosterior ? '<div class="tb-card" style="margin-top:10px"><div class="tb-s">No se puede anular: hay un inventario posterior. Si hace falta, corrígelo con un inventario parcial.</div></div>' : ''}`);
    const b = document.getElementById('tb-anular');
    if (b) b.onclick = () => anular(m);
  };

  cont().innerHTML = `
    <div class="tb-wrap">
      ${cabecera('📜 Histórico')}
      <div class="tb-row">
        <button class="tb-btn" id="tb-hist-excel" style="flex:1">⬇ Excel<small>todo el registro</small></button>
        <button class="tb-btn" id="tb-hist-resumen" style="flex:1">📤 Resumen de hoy<small>para mandarlo</small></button>
      </div>
      <div class="chip-row" id="tb-htipos">${['todos', ...Object.keys(TIPO_TXT)].map(t => `<button class="chip off" data-ht="${t}">${t === 'todos' ? 'Todos' : TIPO_TXT[t]}</button>`).join('')}</div>
      <div id="tb-hpers-wrap"></div>
      <div class="tb-search"><input class="tb-input" id="tb-q" placeholder="Buscar por artículo, vale o nota…"></div>
      <div id="tb-hist" style="display:flex;flex-direction:column;gap:6px"></div>
    </div>`;
  bindVolver(ctx);

  const pinta = () => {
    // Los chips de persona se rehacen en cada pintada: si un movimiento nuevo trae a alguien
    // (p. ej. «Administrador» al anular), su chip aparece sin salir de la pantalla.
    const ps = personas();
    if (fPersona !== 'todas' && !ps.includes(fPersona)) fPersona = 'todas';
    document.getElementById('tb-hpers-wrap').innerHTML = ps.length
      ? `<div class="chip-row" id="tb-hpers"><button class="chip off" data-hp="todas">Todas</button>${ps.map(n => `<button class="chip off" data-hp="${esc(n)}">${esc(n)}</button>`).join('')}</div>`
      : '';
    cont().querySelectorAll('[data-ht]').forEach(b => { const on = b.dataset.ht === fTipo; b.classList.toggle('on', on); b.classList.toggle('off', !on); });
    cont().querySelectorAll('[data-hp]').forEach(b => { const on = b.dataset.hp === fPersona; b.classList.toggle('on', on); b.classList.toggle('off', !on); });
    const movs = est().movs;
    const ql = q.trim().toLowerCase();
    const l = [...movs].reverse().filter(m => (fTipo === 'todos' || m.tipo === fTipo) && (fPersona === 'todas' || m.persona.nombre === fPersona)
      && (!ql || m.lineas.some(x => (x.ref || '').toLowerCase().includes(ql) || (x.name || '').toLowerCase().includes(ql))
        || String((m.extra || {}).vale || '').toLowerCase().includes(ql) || (m.nota || '').toLowerCase().includes(ql)));
    let html = '', dia = null, buf = [];
    const cierraDia = () => { if (buf.length) html += `<div style="${ROT}">${dia}</div><div class="tb-lines">${buf.join('')}</div>`; buf = []; };
    for (const m of l) { const f = fmtFecha(m.ts); if (f !== dia) { cierraDia(); dia = f; } buf.push(filaMov(m, movs)); }
    cierraDia();
    document.getElementById('tb-hist').innerHTML = l.length ? html : '<div class="tb-lines"><div class="tb-empty">Nada que coincida</div></div>';
  };

  document.getElementById('tb-htipos').onclick = ev => { const b = ev.target.closest('[data-ht]'); if (!b) return; fTipo = b.dataset.ht; pinta(); };
  document.getElementById('tb-hpers-wrap').onclick = ev => { const b = ev.target.closest('[data-hp]'); if (!b) return; fPersona = b.dataset.hp; pinta(); };
  document.getElementById('tb-q').addEventListener('input', ev => { q = ev.target.value; pinta(); });
  document.getElementById('tb-hist').addEventListener('click', ev => {
    const b = ev.target.closest('[data-mov]'); if (!b) return;
    const m = est().movs.find(x => x.id === b.dataset.mov);
    if (m) detalle(m);
  });
  document.getElementById('tb-hist-excel').onclick = async () => {
    const integ = await verificarIntegridad(est());
    descargaExcel(nombreArchivo('historico', est().terminal), filasExcelHistorico(est().movs, integ), 'historico');
  };
  document.getElementById('tb-hist-resumen').onclick = () => compartirTexto(resumenDia(est().movs, new Date().toISOString(), est().terminal), 'Tabaco almacén');
  pinta();
}

// ---------- ajustes ----------
// Todo esto es cosa de Jose: personas, terminal, avisos, PIN, copia de seguridad y el botón
// de borrar el módulo (que exige haberse bajado la copia antes).
export async function abrirAjustes(ctx) {
  const quien = await ctx.pedirPin({ admin: true });
  if (quien !== 'admin') return;
  let copiaHecha = false;   // solo en esta sesión: borrar el módulo exige bajarse la copia primero
  // La comprobación del registro se hace UNA vez al entrar (nada de lo que hay aquí toca los
  // movimientos). Si falla (IndexedDB caída, crypto sin contexto seguro…) se dice, no se deja la
  // pantalla en blanco.
  let integ;
  try { integ = await verificarIntegridad(ctx.estado); }
  catch (err) { integ = { error: (err && err.message) || String(err) }; }

  const seccion = (titulo, html) => `<div><div style="${ROT};margin-bottom:6px">${titulo}</div><div style="display:flex;flex-direction:column;gap:8px">${html}</div></div>`;

  // Hoja de «PIN nuevo + repetir» que sirve para las personas y para el administrador.
  const hojaPinNuevo = (titulo, sub, aplicar) => {
    let enviando = false;
    openSheet(`
      <div class="tb-pin-title">${esc(titulo)}</div>
      <div class="tb-pin-sub">${esc(sub)}</div>
      <input class="tb-input" id="tb-np1" type="password" inputmode="numeric" maxlength="6" placeholder="PIN nuevo (4 a 6 dígitos)" style="margin-top:12px">
      <input class="tb-input" id="tb-np2" type="password" inputmode="numeric" maxlength="6" placeholder="Repite el PIN nuevo" style="margin-top:8px">
      <button class="add-btn" id="tb-np-ok" style="margin-top:12px">Guardar el PIN</button>`);
    document.getElementById('tb-np-ok').onclick = async () => {
      if (enviando) return;
      const a = document.getElementById('tb-np1').value, b = document.getElementById('tb-np2').value;
      if (a !== b) return toast('Los dos PIN no coinciden', 'red');
      enviando = true;
      try { await aplicar(a); closeSheet(); toast('PIN cambiado', 'green'); pinta(); }
      catch (err) { toast((err && err.message) || 'No se pudo cambiar el PIN', 'red', 4000); }
      finally { enviando = false; }
    };
  };

  const descargarCopia = () => {
    const nombre = `copia_tabaco_${ctx.estado.terminal}_${fmtFecha(new Date().toISOString()).replace(/\//g, '-')}.json`;
    try {
      const url = URL.createObjectURL(new Blob([exportarCopia(ctx.estado)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 4000);
      copiaHecha = true;
      toast('Copia descargada: ' + nombre, 'green', 3500);
      pinta();
    } catch (e) { toast('No se pudo hacer la copia: ' + ((e && e.message) || e), 'red', 4000); }
  };

  function pinta() {
    const e = ctx.estado;
    const activas = e.personas.filter(p => p.activa), bajas = e.personas.filter(p => !p.activa);
    cont().innerHTML = `
      <div class="tb-wrap">
        ${cabecera('⚙ Ajustes')}
        ${seccion('Personas', `
          <div class="tb-lines">${activas.length || bajas.length ? [
            ...activas.map(p => `<div class="tb-line"><div class="tb-n">${esc(p.nombre)}<div class="tb-m">${p.creada ? 'de alta desde ' + fmtFecha(p.creada) : 'de alta'}</div></div><button class="tb-link" data-pin="${esc(p.id)}">Cambiar PIN</button><button class="tb-link" data-baja="${esc(p.id)}">Dar de baja</button></div>`),
            ...bajas.map(p => `<div class="tb-line" style="opacity:0.45"><div class="tb-n">${esc(p.nombre)}<div class="tb-m">de baja${p.baja ? ' el ' + fmtFecha(p.baja) : ''}</div></div></div>`),
          ].join('') : '<div class="tb-empty">Todavía no hay nadie de alta: sin PIN nadie puede sacar tabaco</div>'}</div>
          <div class="tb-row"><input class="tb-input" id="tb-alta-nombre" placeholder="Nombre"><input class="tb-input" id="tb-alta-pin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN"></div>
          <button class="add-btn" id="tb-alta">Dar de alta</button>`)}
        ${seccion('Terminal', `
          <div class="chip-row" id="tb-aj-term">${TERMINALS.map(t => `<button class="chip ${t === e.terminal ? 'on' : 'off'}" data-t="${t}">Term. ${t}</button>`).join('')}</div>
          <div class="tb-card"><div class="tb-s">Solo afecta a los movimientos NUEVOS: los que ya están registrados guardan el terminal que tenían.</div></div>`)}
        ${seccion('Aviso de vale sin recibir', `
          <div class="tb-row"><input class="tb-input" id="tb-horas" type="number" min="1" max="48" value="${e.ajustes.horasAvisoVale}" style="max-width:120px"><span class="tb-s" style="color:var(--text3);font-size:0.8rem">horas desde que sale el tabaco hasta que el inicio avisa de que nadie lo ha recibido</span></div>`)}
        ${seccion('PIN de administrador', `<button class="tb-btn" id="tb-pin-admin">Cambiar PIN<small>el tuyo, el que abre estos ajustes</small></button>`)}
        ${seccion('Copia de seguridad', `
          <button class="tb-btn" id="tb-copia">⬇ Descargar JSON<small>todo el registro, para guardarlo fuera del móvil</small></button>`)}
        ${seccion('Estado del registro', `
          <div class="tb-banner ${integ.ok ? 'ok' : 'bad'}">${integ.error ? '⚠ No se pudo comprobar el registro: ' + esc(integ.error)
            : integ.ok ? `✔ todo correcto · ${plural(integ.n, 'movimiento', 'movimientos')}` : '⚠ ' + esc((integ.problemas || []).join(' · '))}</div>
          <div class="tb-card"><div class="tb-s">creado el ${fmtFecha(e.creado)} · Terminal ${esc(e.terminal)}</div></div>`)}
        ${seccion('Borrar', `
          <div class="tb-card"><div class="tb-s">${copiaHecha ? 'Ya tienes la copia de esta sesión: puedes borrar.' : 'Baja primero la copia de seguridad (arriba) para poder borrar.'}</div></div>
          <button class="tb-danger" id="tb-borrar" ${copiaHecha ? '' : 'disabled style="opacity:0.4"'}>🗑 Borrar el módulo en este móvil</button>`)}
      </div>`;
    bindVolver(ctx);
    cont().querySelectorAll('[data-pin]').forEach(b => b.onclick = () => {
      const p = ctx.estado.personas.find(x => x.id === b.dataset.pin);
      if (p) hojaPinNuevo('PIN de ' + p.nombre, 'Teclea el PIN nuevo dos veces', pin => cambiarPinPersona(ctx.estado, p.id, pin));
    });
    cont().querySelectorAll('[data-baja]').forEach(b => b.onclick = () => {
      const p = ctx.estado.personas.find(x => x.id === b.dataset.baja);
      if (!p) return;
      if (!confirm(`¿Dar de baja a ${p.nombre}? Su PIN deja de valer, pero todo lo que sacó sigue en el registro.`)) return;
      bajaPersona(ctx.estado, p.id);
      toast(p.nombre + ' está de baja', 'green');
      pinta();
    });
    let dandoAlta = false;
    document.getElementById('tb-alta').onclick = async () => {
      if (dandoAlta) return;
      const nombre = document.getElementById('tb-alta-nombre').value, pin = document.getElementById('tb-alta-pin').value;
      dandoAlta = true;
      try { const p = await altaPersona(ctx.estado, nombre, pin); toast(p.nombre + ' ya puede sacar tabaco con su PIN', 'green', 3500); pinta(); }
      catch (err) { toast((err && err.message) || 'No se pudo dar de alta', 'red', 4000); }
      finally { dandoAlta = false; }
    };
    document.getElementById('tb-aj-term').onclick = ev => {
      const b = ev.target.closest('[data-t]'); if (!b) return;
      ctx.estado.terminal = b.dataset.t;
      if (!ctx.guardar(ctx.estado)) return;
      toast('Los movimientos nuevos van al Terminal ' + b.dataset.t, 'green');
      pinta();
    };
    document.getElementById('tb-horas').onchange = ev => {
      const n = Math.max(1, Math.min(48, Math.trunc(Number(ev.target.value)) || 2));
      ctx.estado.ajustes.horasAvisoVale = n;
      ev.target.value = n;
      if (!ctx.guardar(ctx.estado)) return;
      toast('Avisa a ' + plural(n, 'hora', 'horas') + ' del vale', 'green');
    };
    document.getElementById('tb-pin-admin').onclick = () => hojaPinNuevo('PIN de administrador', 'Teclea el PIN nuevo dos veces', pin => cambiarPinAdmin(ctx.estado, pin));
    document.getElementById('tb-copia').onclick = () => descargarCopia();
    document.getElementById('tb-borrar').onclick = () => {
      if (!copiaHecha) return;
      if (!confirm('Se borra TODO el control de tabaco de este móvil: movimientos, personas, PIN y stock. No se puede deshacer. ¿Ya tienes guardada la copia JSON?')) return;
      borrarModulo();
      location.reload();
    };
  }
  pinta();
}
