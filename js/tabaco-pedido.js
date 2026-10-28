// js/tabaco-pedido.js — recibir un pedido de tabaco contra lo esperado: carga del Excel de compra (TransferScan), ficha del pedido y botón del inicio
import { openSheet, closeSheet, openQtySheet, toast, esc } from './ui.js';
import { registrar } from './tabaco-store.js';
import { beepMatch, beepError } from './camera-scanner.js';
import { parseFilasPedido, refPedidoDeNombre, etiquetaPedido, nuevoId, fmtFecha, fmtHora, totalLineas, diferenciasPedido, resumenRecepcion } from './tabaco-core.js';
import { elegirYLeerExcel, compartirTexto } from './tabaco-historico.js';   // la librería de Excel (y su lectura) vive en un solo sitio del módulo

// Mientras se teclea el PIN (o se elige el archivo) otra ventana puede haber cambiado el registro
// y `mount()` habrá cargado un estado nuevo: entonces no se sigue con el de antes.
const mismoEstado = (ctx, e) => {
  if (ctx.estado === e) return true;
  toast('El control de tabaco ha cambiado en otra ventana: vuelve a abrir el pedido.', 'red', 4000);
  return false;
};

// Texto del botón «📦 …» del inicio (y la línea de aviso cuando hay un pedido esperando el palé).
export function textoBotonPedido(estado) {
  const p = estado && estado.pedido;
  if (!p) return { titulo: 'Recibir pedido', sub: 'Carga el Excel del pedido (admin)', aviso: '' };
  const et = etiquetaPedido(p), lineas = p.lineas || [];
  if (p.recepcion) {   // conteo empezado: cuenta solo los artículos DEL PEDIDO ya leídos (los sobrantes no)
    const contado = p.recepcion.contado || {};
    const n = lineas.filter(l => Object.prototype.hasOwnProperty.call(contado, l.ref)).length;
    return { titulo: `Continuar recepción (${n} de ${lineas.length} contados)`, sub: `${et} · conteo de ${p.recepcion.personaNombre || ''}`, aviso: '' };
  }
  return { titulo: 'Recibir pedido', sub: `${et} · ${lineas.length} artículos · ${totalLineas(lineas)} uds · esperando el palé`,
    aviso: `📦 Pedido ${et} cargado el ${fmtFecha(p.cargado)}, pendiente de recibir` };
}

// Lo que se quedó fuera al cargar el Excel (para el toast y para volver a verlo en la ficha).
function partesAvisos(av) {
  const a = av || {}, out = [], desc = a.desconocidas || [];
  let k = a.sinCodigo || 0;
  if (k > 0) out.push(`${k} ${k === 1 ? 'fila' : 'filas'} sin código Proxium (no ${k === 1 ? 'cargada' : 'cargadas'})`);
  k = a.noTabaco || 0;
  if (k > 0) out.push(`${k} ${k === 1 ? 'ignorada' : 'ignoradas'} por no ser tabaco`);
  k = desc.length;
  if (k > 0) out.push(`${k} no están en el catálogo (${desc.slice(0, 5).join(', ')}${k > 5 ? '…' : ''})`);
  return out;
}

// El botón del inicio: sin pedido → cargar el Excel; con conteo empezado → seguir contando; si no, la ficha.
export async function abrirPedido(ctx) {
  const p = ctx.estado.pedido;
  if (!p) return cargarExcelPedido(ctx);
  if (p.recepcion) return contarPedido(ctx);
  fichaPedido(ctx);
}

// Ficha del pedido cargado (hoja): qué es, cuándo se cargó y qué se puede hacer con él.
// No enseña las cantidades: el palé se cuenta a ciegas.
function fichaPedido(ctx) {
  const p = ctx.estado.pedido, et = etiquetaPedido(p), lineas = p.lineas || [];
  const titulo = `Pedido ${et}` + (p.arc ? ` · ARC …${String(p.arc).slice(-4)}` : '') + (p.proveedor ? ` · ${p.proveedor}` : '');
  const avisos = partesAvisos(p.avisos);
  const close = openSheet(`
    <div class="tb-pin-title">${esc(titulo)}</div>
    <div class="tb-pin-sub">Cargado el ${fmtFecha(p.cargado)} ${fmtHora(p.cargado)} · ${lineas.length} artículos · ${totalLineas(lineas)} uds</div>
    ${avisos.length ? `<div class="tb-alert" style="margin-top:10px">⚠ Al cargar: ${esc(avisos.join(' · '))}</div>` : ''}
    <button class="add-btn" id="tb-pd-contar" style="margin-top:12px">Empezar a contar</button>
    <button class="tb-btn" id="tb-pd-cambiar" style="width:100%;margin-top:8px;background:var(--surface2)">Cambiar el Excel</button>
    <button class="tb-danger" id="tb-pd-quitar" style="margin-top:8px">Quitar el pedido</button>`);
  document.getElementById('tb-pd-contar').onclick = () => { close(); contarPedido(ctx); };
  document.getElementById('tb-pd-cambiar').onclick = () => { close(); cargarExcelPedido(ctx); };
  document.getElementById('tb-pd-quitar').onclick = () => { close(); quitarPedido(ctx); };
}

const cont = () => document.getElementById('main');
const tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Contar el palé contra el pedido. Igual que el inventario: cada lectura SUMA, tocar una línea deja
// un número exacto, retomar el conteo pide SIEMPRE el PIN y un conteo sin nada leído no se guarda.
// Es un conteo CIEGO: lo que dice el pedido no se enseña hasta que se lee el artículo (así se
// cuenta lo que hay, no lo que se espera). Aquí no se registra ningún movimiento: el borrador
// vive en `estado.pedido.recepcion` hasta que se cierre la recepción.
async function contarPedido(ctx) {
  const e = ctx.estado, pedido = e.pedido;
  if (!pedido) return;
  const nuevo = quien => ({ personaId: quien.id, personaNombre: quien.nombre, iniciado: new Date().toISOString(), contado: {}, nombres: {}, incidencias: '' });
  let rec = pedido.recepcion;
  if (rec) {
    const quien = await ctx.pedirPin({ titulo: 'Continuar recepción de ' + rec.personaNombre, sub: 'Teclea tu PIN' });
    if (!quien || !mismoEstado(ctx, e)) return;
    if (quien.id !== rec.personaId) {   // es otra persona: o descarta lo que contó su compañero, o no sigue
      if (!confirm(`Este conteo es de ${rec.personaNombre} (${Object.keys(rec.contado).length} artículos contados). ¿Descartarlo y empezar el tuyo?`)) return ctx.refrescar();
      pedido.recepcion = null; ctx.guardar(e); rec = nuevo(quien);
    }
  } else {
    const quien = await ctx.pedirPin({ titulo: '¿Quién recibe el pedido?' });
    if (!quien || !mismoEstado(ctx, e)) return;
    rec = nuevo(quien);
  }
  const lineas = pedido.lineas || [];
  const esperado = new Map(lineas.map(l => [l.ref, l.qty]));
  const nombre = p => p.name || p.ref;
  // El borrador solo entra en el estado guardado cuando hay algo contado (y sale si se queda sin nada).
  const guardaBorrador = () => {
    if (Object.keys(rec.contado).length) pedido.recepcion = rec;
    else if (pedido.recepcion === rec) pedido.recepcion = null;
    ctx.guardar(e);
  };
  const apunta = (p, qty) => {
    rec.contado[p.ref] = qty;
    rec.nombres[p.ref] = { name: nombre(p), ean: p.ean || '' };
    guardaBorrador(); pinta();
  };
  // Tras cada cambio: pitido doble si cuadra, de error si sobra; lo que falta solo se dice.
  const aviso = p => {
    const c = rec.contado[p.ref];
    if (!esperado.has(p.ref)) return toast(`${nombre(p)}: ${c} (sobrante, no estaba en el pedido)`, 'red');
    const esp = esperado.get(p.ref);
    if (c === esp) { beepMatch(); toast(`✓ ${nombre(p)} cuadra con el pedido (${esp})`, 'green'); }
    else if (c > esp) { beepError(); toast(`${nombre(p)}: ${c} contados, pedido ${esp} (+${c - esp})`, 'red'); }
    else toast(`${nombre(p)}: ${c} de ${esp}`);
  };
  // Una lectura (pistola, cámara o buscador) SUMA lo tecleado. `onDone` (opcional) reanuda la cámara.
  const contar = (p, onDone) => {
    if (!p) return;
    if (!esperado.has(p.ref) && !tiene(rec.contado, p.ref)) {
      beepError();
      if (!confirm(`"${nombre(p)}" no está en el pedido. ¿Añadirlo como sobrante?`)) { if (onDone) onDone(); return; }
    }
    openQtySheet({ ...p, family: p.family || 'TABACO' }, [1, 5, 10, 20], 'Recibido +{n}', qty => {
      apunta(p, (rec.contado[p.ref] || 0) + qty); aviso(p);
      if (onDone) onDone();
    });
  };
  // Tocar una línea deja un número exacto. La hoja de cantidad no confirma 0: va en su propio botón.
  const fijar = p => {
    if (!p) return;
    openQtySheet({ ...p, family: p.family || 'TABACO' }, [1, 5, 10, 20], 'Dejar recibido en ×{n}', qty => { apunta(p, qty); aviso(p); });
    const add = document.getElementById('np-add');
    if (add) {
      const cero = document.createElement('button');
      cero.className = 'tb-danger'; cero.style.marginTop = '8px'; cero.textContent = 'No vino ninguno (0)';
      cero.onclick = () => { apunta(p, 0); aviso(p); closeSheet(); };
      add.insertAdjacentElement('afterend', cero);
    }
  };
  ctx.setOnEan(contar);
  const salir = () => { ctx.setOnEan(null); ctx.refrescar(); };
  const fila = (p, m, c, cls) => `<button class="tb-line" data-ref="${esc(p.ref)}" style="width:100%;text-align:left"><div class="tb-n">${esc(nombre(p))}<div class="tb-m">${esc(m)}</div></div><div class="tb-q ${cls}">${c === undefined ? '—' : c}</div></button>`;
  const pinta = () => {
    const contado = rec.contado, refs = Object.keys(contado);
    const sobrantes = refs.filter(r => !esperado.has(r)).map(r => ({ ref: r, name: (rec.nombres[r] && rec.nombres[r].name) || r, ean: (rec.nombres[r] && rec.nombres[r].ean) || '', family: 'TABACO' }));
    const leidas = lineas.filter(l => tiene(contado, l.ref));
    const cuadran = leidas.filter(l => contado[l.ref] === l.qty).length;
    const conDif = leidas.length - cuadran + sobrantes.length, sinContar = lineas.length - leidas.length;
    const filasPedido = lineas.map(l => {
      if (!tiene(contado, l.ref)) return fila(l, l.ref, undefined, '');   // a ciegas: aún no se ha leído
      const c = contado[l.ref];
      return fila(l, `${l.ref} · pedido ${l.qty} · recibido ${c}`, c, c < l.qty ? 'neg' : c > l.qty ? 'pos' : '');
    }).join('');
    cont().innerHTML = `
      <div class="tb-wrap">
        <div class="tb-head"><h2>📦 Recepción ${esc(etiquetaPedido(pedido))}</h2><button class="tb-link" id="tb-pd-cancel">Cancelar</button></div>
        <div class="tb-card"><div class="tb-k">${esc(rec.personaNombre)} · desde ${fmtHora(rec.iniciado)}</div><div class="tb-v">${leidas.length} <small>de ${lineas.length} artículos del pedido contados</small></div><div class="tb-s">Pistolea o usa la cámara 📷. Cada lectura SUMA. Toca una línea para dejar un número exacto (o 0).</div></div>
        <div class="stock-banner"><span class="stock-banner-item match">✓ ${cuadran} cuadrados</span><span class="stock-banner-sep">·</span><span class="stock-banner-item diff">⚠ ${conDif} con diferencia</span><span class="stock-banner-sep">·</span><span class="stock-banner-item pend">${sinContar} sin contar</span></div>
        <button class="tb-btn" id="tb-pd-buscar">🔍 Buscar artículo<small>si no lee el código</small></button>
        <div class="tb-lines">${filasPedido}</div>
        ${sobrantes.length ? `<div class="tb-pin-sub" style="text-align:left;margin:0 4px">No estaban en el pedido</div>
        <div class="tb-lines">${sobrantes.map(p => fila(p, `${p.ref} · no estaba en el pedido · recibido ${contado[p.ref]}`, contado[p.ref], 'pos')).join('')}</div>` : ''}
        <button class="add-btn" id="tb-pd-cerrar" ${refs.length ? '' : 'disabled style="opacity:0.4"'}>Cerrar recepción</button>
      </div>`;
    document.getElementById('tb-pd-cancel').onclick = () => {
      if (refs.length && !confirm('¿Cancelar el conteo? Se pierde lo contado; el pedido sigue cargado.')) return;
      pedido.recepcion = null; ctx.guardar(e); salir();
    };
    document.getElementById('tb-pd-buscar').onclick = () => ctx.buscarArticulo(contar);
    const porRef = new Map([...lineas, ...sobrantes].map(p => [p.ref, p]));
    cont().querySelectorAll('.tb-lines [data-ref]').forEach(b => b.onclick = () => fijar(porRef.get(b.dataset.ref)));
    document.getElementById('tb-pd-cerrar').onclick = () => { if (refs.length) cerrarRecepcion(ctx, e, rec, guardaBorrador); };
  };
  pinta();
}

// Cerrar la recepción: lo que falta, lo que sobra y lo que no se contó (cuenta como NO recibido),
// con las incidencias para CISA. Al confirmar se registra UNA entrada con lo recibido de verdad;
// cada diferencia queda como descuadre «pedido» para regularizar. Después el pedido deja de esperarse.
function cerrarRecepcion(ctx, e, rec, guardaBorrador) {
  const pedido = e.pedido;
  if (!pedido) return;
  const lineas = pedido.lineas || [];
  const difs = diferenciasPedido(lineas, rec.contado, { ...ctx.info(), ...rec.nombres });
  const conDif = difs.filter(d => d.dif !== 0);
  const faltan = difs.filter(d => d.dif < 0 && !d.sinContar), sobran = difs.filter(d => d.dif > 0), sinContar = difs.filter(d => d.sinContar);
  const esperadoTotal = totalLineas(lineas), recibidoTotal = difs.reduce((a, d) => a + d.recibido, 0);
  const n = lineas.length;
  const sub = conDif.length
    ? '⚠ ' + [faltan.length ? `${faltan.length} ${faltan.length === 1 ? 'falta' : 'faltas'}` : '',
        sobran.length ? `${sobran.length} ${sobran.length === 1 ? 'sobra' : 'sobran'}` : '',
        sinContar.length ? `${sinContar.length} sin contar` : ''].filter(Boolean).join(' · ')
    : `✅ Llegó todo · ${n} artículo${n === 1 ? '' : 's'} · ${recibidoTotal} uds`;
  const ROT = 'text-align:left;margin:10px 4px 4px';
  const filaDif = d => `<div class="tb-line"><div class="tb-n">${esc(d.name || d.ref)}<div class="tb-m">${esc(d.ref)} · pedido ${d.esperado} → recibido ${d.recibido}</div></div><div class="tb-q ${d.dif < 0 ? 'neg' : 'pos'}">${d.dif > 0 ? '+' : ''}${d.dif}</div></div>`;
  const bloque = (titulo, filas) => filas.length ? `<div class="tb-pin-sub" style="${ROT}">${esc(titulo)}</div><div class="tb-lines">${filas.map(filaDif).join('')}</div>` : '';
  let enviando = false;
  openSheet(`
    <div class="tb-pin-title">Cerrar recepción</div>
    <div class="tb-pin-sub">${esc(sub)}</div>
    <div style="max-height:45vh;overflow:auto">${bloque('Faltan', faltan)}${bloque('Sobran', sobran)}${bloque('Sin contar: se dan por NO recibidos', sinContar)}</div>
    <textarea class="tb-input" id="tb-pd-inc" rows="2" placeholder="Incidencias para CISA (golpeados, mal estado, bultos…)" style="margin-top:10px">${esc(rec.incidencias || '')}</textarea>
    <button class="add-btn" id="tb-pd-conf" style="margin-top:10px">Confirmar entrada (${recibidoTotal} uds)</button>`);
  if (!conDif.length) beepMatch();
  document.getElementById('tb-pd-inc').addEventListener('input', ev => { rec.incidencias = ev.target.value; guardaBorrador(); });
  document.getElementById('tb-pd-conf').onclick = async () => {
    if (enviando) return;
    if (!mismoEstado(ctx, e)) return;
    enviando = true;
    try {
      const mov = await registrar(e, {
        tipo: 'entrada',
        persona: { id: rec.personaId, nombre: rec.personaNombre },
        lineas: difs.filter(d => d.recibido > 0).map(d => ({ ref: d.ref, name: d.name, ean: d.ean, qty: d.recibido })),
        nota: (rec.incidencias || '').trim(),
        extra: {
          motivo: 'Llegada CISA',
          pedido: { id: pedido.id, archivo: pedido.archivo, proveedor: pedido.proveedor, factura: pedido.factura, arc: pedido.arc, cargado: pedido.cargado, nArticulos: n, esperadoTotal, recibidoTotal },
          esperado: lineas.map(l => ({ ref: l.ref, qty: l.qty })),
          diferencias: conDif,
        },
      });
      e.pedido = null; ctx.guardar(e); ctx.setOnEan(null);
      closeSheet();
      const k = conDif.length;
      toast(k ? `Recepción registrada: ${k} diferencia${k === 1 ? '' : 's'} apuntada${k === 1 ? '' : 's'} como descuadre` : 'Recepción registrada: llegó todo', k ? 'red' : 'green', 3500);
      mostrarResumen(ctx, mov);
    } catch (err) {
      toast('No se pudo registrar: ' + ((err && err.message) || err), 'red', 4000);
    } finally { enviando = false; }
  };
}

// El resguardo de la recepción (mismo estilo que el vale de una salida): para compartir con CISA / Jose.
function mostrarResumen(ctx, mov) {
  const t = resumenRecepcion(mov);
  openSheet(`<div class="tb-pin-title">✅ Recepción registrada</div>
    <pre style="white-space:pre-wrap;font:inherit;font-size:0.82rem;background:var(--surface2);border-radius:12px;padding:12px;margin:10px 0">${esc(t)}</pre>
    <button class="add-btn" id="tb-share">📤 Compartir</button>
    <button class="tb-link" id="tb-ok" style="width:100%;margin-top:6px">Cerrar</button>`, () => ctx.refrescar());
  document.getElementById('tb-share').onclick = () => compartirTexto(t, 'Recepción de pedido');
  document.getElementById('tb-ok').onclick = () => closeSheet();
}

// Quitar el pedido no registra nada: solo deja de esperarse (PIN admin + confirmación).
async function quitarPedido(ctx) {
  const e = ctx.estado, p = e.pedido;
  if (!p) return;
  const ok = await ctx.pedirPin({ admin: true }); if (ok !== 'admin' || !mismoEstado(ctx, e)) return;
  if (!confirm(`¿Quitar el pedido ${etiquetaPedido(p)}? No se registra nada.`)) return;
  e.pedido = null;
  if (!ctx.guardar(e)) { e.pedido = p; return; }
  toast('Pedido quitado');
  ctx.refrescar();
}

// Carga (o sustituye) el pedido esperado desde el Excel de compra que genera TransferScan
// (COMPRA_<prov>_FT<factura>_ARC-<arc>.xlsx). Es cosa de Jose: PIN de administrador. No registra
// ningún movimiento; solo deja el pedido en `estado.pedido` para contrastarlo al llegar el palé.
async function cargarExcelPedido(ctx) {
  const e = ctx.estado, previo = e.pedido;
  if (previo && previo.recepcion) return toast('Hay un conteo empezado sobre el pedido actual: cancélalo antes de cargar otro', 'red', 4000);
  if (previo && !confirm(`Ya hay un pedido cargado (${etiquetaPedido(previo)}). ¿Sustituirlo por el nuevo Excel?`)) return;
  const ok = await ctx.pedirPin({ admin: true }); if (ok !== 'admin' || !mismoEstado(ctx, e)) return;
  try {
    const { res, archivo } = await elegirYLeerExcel(parseFilasPedido, r => r.lineas.length);
    // El pedido es SOLO del tabaco: lo que la app conoce y no es tabaco se queda fuera.
    const tabaco = new Map(ctx.catalogo().map(p => [p.ref, p]));
    const lineas = [], desconocidas = [];
    let noTabaco = 0;
    for (const l of res.lineas) {
      const p = tabaco.get(l.ref);
      if (!p && ctx.producto(l.ref)) { noTabaco++; continue; }
      lineas.push({ ref: l.ref, name: (p && p.name) || l.name || l.ref, ean: (p && p.ean) || l.ean || '', qty: l.qty });
      if (!p) desconocidas.push(l.ref);
    }
    if (!lineas.length) return toast('El Excel no tiene líneas de tabaco con código', 'red', 4000);   // el pedido anterior se queda
    if (!mismoEstado(ctx, e)) return;
    if (e.pedido && e.pedido.recepcion) return toast('Hay un conteo empezado sobre el pedido actual: cancélalo antes de cargar otro', 'red', 4000);
    const { proveedor, factura, arc } = refPedidoDeNombre(archivo);
    const avisos = { sinCodigo: res.sinCodigo || 0, noTabaco, desconocidas };
    const anterior = e.pedido;
    e.pedido = { id: nuevoId('pd'), archivo, proveedor, factura, arc, cargado: new Date().toISOString(), lineas, avisos, recepcion: null };
    if (!ctx.guardar(e)) { e.pedido = anterior; return; }
    const partes = partesAvisos(avisos);
    toast(`Pedido cargado: ${lineas.length} artículos · ${totalLineas(lineas)} uds` + partes.map(x => ' · ' + x).join(''), partes.length ? 'red' : 'green', 5000);
    ctx.refrescar();
  } catch (err) { toast((err && err.message) || 'No se pudo leer el Excel', 'red', 4000); }
}
