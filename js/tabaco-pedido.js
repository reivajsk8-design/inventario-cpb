// js/tabaco-pedido.js — recibir un pedido de tabaco contra lo esperado: carga del Excel de compra (TransferScan), ficha del pedido y botón del inicio
import { openSheet, toast, esc } from './ui.js';
import { parseFilasPedido, refPedidoDeNombre, etiquetaPedido, nuevoId, fmtFecha, fmtHora, totalLineas } from './tabaco-core.js';
import { ensureXLSX } from './tabaco-historico.js';   // la librería de Excel se carga en un solo sitio del módulo

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
  if (p.recepcion) return toast('Conteo: siguiente tarea');
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
  document.getElementById('tb-pd-contar').onclick = () => { close(); toast('Conteo: siguiente tarea'); };
  document.getElementById('tb-pd-cambiar').onclick = () => { close(); cargarExcelPedido(ctx); };
  document.getElementById('tb-pd-quitar').onclick = () => { close(); quitarPedido(ctx); };
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
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx,.xls';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const XLSX = await ensureXLSX();
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      let res = null, err = null;
      for (const nombre of wb.SheetNames) {   // se prueban todas las hojas: una con solo la cabecera no corta la búsqueda
        try {
          const r = parseFilasPedido(XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: '' }));
          res = r;
          if (r.lineas.length) break;
        } catch (e2) { err = e2; }
      }
      if (!res) throw err || new Error('El Excel no tiene filas con datos');
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
      const { proveedor, factura, arc } = refPedidoDeNombre(f.name);
      const avisos = { sinCodigo: res.sinCodigo || 0, noTabaco, desconocidas };
      const anterior = e.pedido;
      e.pedido = { id: nuevoId('pd'), archivo: f.name, proveedor, factura, arc, cargado: new Date().toISOString(), lineas, avisos, recepcion: null };
      if (!ctx.guardar(e)) { e.pedido = anterior; return; }
      const partes = partesAvisos(avisos);
      toast(`Pedido cargado: ${lineas.length} artículos · ${totalLineas(lineas)} uds` + partes.map(x => ' · ' + x).join(''), partes.length ? 'red' : 'green', 5000);
      ctx.refrescar();
    } catch (err2) { toast((err2 && err2.message) || 'No se pudo leer el Excel', 'red', 4000); }
  };
  inp.click();
}
