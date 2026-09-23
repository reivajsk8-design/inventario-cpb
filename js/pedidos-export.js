// js/pedidos-export.js — hoja «⬇ Exportar pedido» (un Excel POR PROVEEDOR; al exportar, sus líneas salen del pedido
// y quedan en el historial) y hoja «📜 Historial de pedidos» (ver, repetir sumando al pedido en curso, volver a
// descargar el Excel, borrar). El historial vive en este dispositivo (localStorage 'ioh'), como el propio pedido.
// La lógica pura está en pedidos-core.js. Pedido de Jose del 23-09-2026 (la encargada mezclaba proveedores en un pedido).
import { openSheet, closeSheet, toast, esc } from './ui.js';
import { agruparPorProveedor, filasExcel, nombreArchivo, nuevaEntradaHistorial, recortaHistorial,
         quitarDelPedido, repetirEnPedido, fechaHoy, fmtFecha, HIST_KEY, HIST_MAX } from './pedidos-core.js';

const TERMINALS = ['D', 'MSC', 'E'];
const getOrders   = () => JSON.parse(localStorage.getItem('io') || '{}');
const saveOrders  = (o) => localStorage.setItem('io', JSON.stringify(o));
const getTerminal = () => localStorage.getItem('itp') || TERMINALS[0];
const setTerminal = (t) => localStorage.setItem('itp', t);
const getUser     = () => localStorage.getItem('ic_user') || '';
const sleep       = (ms) => new Promise((r) => setTimeout(r, ms));

export function getHistory() {
  try { const h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); return Array.isArray(h) ? h : []; }
  catch { return []; }
}
function saveHistory(h) { localStorage.setItem(HIST_KEY, JSON.stringify(recortaHistorial(h, HIST_MAX))); }

// SheetJS se carga solo cuando hace falta (igual que hacía Resumen)
function ensureXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel (¿sin internet?)'));
    document.head.appendChild(s);
  });
}
async function descargaExcel(lineas, proveedor, terminal, user, fechaIso) {
  const XLSX = await ensureXLSX();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasExcel(lineas, user, terminal)), 'pedido');
  const nombre = nombreArchivo(proveedor, terminal, user, fechaIso || fechaHoy());
  XLSX.writeFile(wb, nombre);
  return nombre;
}

// Exporta un grupo (proveedor): Excel → historial → fuera del pedido en curso
async function exportarGrupo(g, terminal, onChange) {
  const user = getUser();
  try { await descargaExcel(g.lines, g.family, terminal, user); }
  catch (e) { toast(e.message || 'No se pudo generar el Excel', 'red', 4000); return false; }
  const h = getHistory(); h.unshift(nuevaEntradaHistorial(g, terminal, user)); saveHistory(h);
  saveOrders(quitarDelPedido(getOrders(), g.lines.map((l) => l.ref)));
  toast(`${g.family}: ${g.refs} refs · ${g.uds} uds → Excel. Guardado en el historial y quitado del pedido.`, 'green', 3200);
  if (onChange) onChange();
  return true;
}

// ── Hoja «Exportar pedido» ────────────────────────────────────────────────────
export function openExportSheet(all, onChange) {
  const pinta = () => {
    const grupos = agruparPorProveedor(getOrders(), all);
    if (!grupos.length) { closeSheet(); toast('El pedido está vacío', 'amber'); return; }
    const term = getTerminal();
    const totalRefs = grupos.reduce((s, g) => s + g.refs, 0), totalUds = grupos.reduce((s, g) => s + g.uds, 0);
    openSheet(`
      <div class="ph-title">⬇ Exportar pedido</div>
      <div class="ph-sub">Un Excel por proveedor. Al exportarlo, sus líneas se quitan del pedido en curso y quedan guardadas en el historial.</div>
      <div class="ph-terms">${TERMINALS.map((t) => `<button class="chip ${t === term ? 'on' : 'off'}" data-term="${t}">Term. ${t}</button>`).join('')}</div>
      <div class="ph-list">
        ${grupos.map((g, i) => `
          <div class="ph-row">
            <div class="ph-info">
              <div class="ph-fam">${esc(g.family)}</div>
              <div class="ph-meta">${g.refs} refs · ${g.uds} uds</div>
            </div>
            <button class="ph-dl" data-i="${i}">⬇ Excel</button>
          </div>`).join('')}
      </div>
      <div class="ph-meta" style="text-align:right;margin:2px 2px 10px">${grupos.length} proveedor${grupos.length === 1 ? '' : 'es'} · ${totalRefs} refs · ${totalUds} uds</div>
      ${grupos.length > 1 ? `<button id="ph-all" class="add-btn">⬇ Exportar todos (${grupos.length} archivos)</button>
        <div class="ph-meta" style="text-align:center;margin-top:8px">Si el móvil pregunta si permite varias descargas, di que sí.</div>` : ''}
    `);
    const box = document.getElementById('sheet-content');
    box.querySelectorAll('[data-term]').forEach((b) => b.addEventListener('click', () => { setTerminal(b.dataset.term); pinta(); }));
    box.querySelectorAll('.ph-dl').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = '…';
      await exportarGrupo(grupos[+b.dataset.i], getTerminal(), onChange);
      pinta();
    }));
    document.getElementById('ph-all')?.addEventListener('click', async () => {
      const btn = document.getElementById('ph-all'); btn.disabled = true;
      let n = 0;
      for (const g of grupos) {
        if (n > 0) await sleep(700);                 // Chrome/Android acepta descargas seguidas si van espaciadas
        btn.textContent = `Exportando ${g.family}… (${n + 1}/${grupos.length})`;
        if (!(await exportarGrupo(g, getTerminal(), onChange))) break;
        n++;
      }
      pinta();
    });
  };
  pinta();
}

// ── Hoja «Historial de pedidos» ───────────────────────────────────────────────
export function openHistorySheet(all, onChange) {
  const pintaLista = () => {
    const h = getHistory();
    openSheet(`
      <div class="ph-title">📜 Historial de pedidos</div>
      <div class="ph-sub">Pedidos exportados desde este dispositivo (los ${HIST_MAX} últimos). Toca uno para verlo, repetirlo o descargarlo otra vez.</div>
      ${!h.length
        ? `<div class="empty-state"><div class="icon">📜</div><p>Todavía no hay pedidos exportados</p></div>`
        : `<div class="ph-list">${h.map((e, i) => `
            <button class="ph-row ph-btn" data-i="${i}">
              <div class="ph-info">
                <div class="ph-fam">${esc(e.proveedor)}</div>
                <div class="ph-meta">${fmtFecha(e.fecha)} ${esc(e.hora || '')}${e.terminal ? ' · Term. ' + esc(e.terminal) : ''}${e.user ? ' · ' + esc(e.user) : ''}</div>
              </div>
              <div class="ph-num">${e.refs}<small>refs</small></div>
              <div class="ph-num">${e.uds}<small>uds</small></div>
            </button>`).join('')}</div>`}
    `);
    document.getElementById('sheet-content').querySelectorAll('.ph-btn').forEach((b) =>
      b.addEventListener('click', () => pintaDetalle(getHistory()[+b.dataset.i])));
  };

  const pintaDetalle = (e) => {
    if (!e) { pintaLista(); return; }
    openSheet(`
      <button class="ph-back" id="ph-back">← Historial</button>
      <div class="ph-title">${esc(e.proveedor)}</div>
      <div class="ph-sub">${fmtFecha(e.fecha)} ${esc(e.hora || '')}${e.terminal ? ' · Term. ' + esc(e.terminal) : ''}${e.user ? ' · ' + esc(e.user) : ''} · ${e.refs} refs · ${e.uds} uds</div>
      <div class="prod-list ph-lines">
        ${(e.lineas || []).map((l) => `
          <div class="prod-item ph-line">
            <div style="flex:1;min-width:0">
              <div class="prod-name">${esc(l.name)}</div>
              <div class="ph-meta">${esc(l.ref)}${l.ean ? ' · ' + esc(l.ean) : ''}</div>
            </div>
            <div class="prod-qty-badge">${l.qty}<small>uds</small></div>
          </div>`).join('')}
      </div>
      <button id="ph-repeat" class="add-btn">🔁 Repetir pedido</button>
      <div class="ph-meta" style="text-align:center;margin:6px 0 12px">Añade estas líneas al pedido en curso (si algo ya estaba, se suma). Luego cambia lo que quieras y exporta.</div>
      <button id="ph-again" class="ph-secondary">⬇ Volver a descargar el Excel</button>
      <div id="ph-del-area"><button id="ph-del" class="ph-danger">🗑 Borrar del historial</button></div>
    `);
    document.getElementById('ph-back').addEventListener('click', pintaLista);
    document.getElementById('ph-repeat').addEventListener('click', () => {
      const r = repetirEnPedido(getOrders(), e.lineas, all);
      saveOrders(r.orders);
      const partes = [];
      if (r.anadidos)     partes.push(`${r.anadidos} añadido${r.anadidos === 1 ? '' : 's'} al pedido`);
      if (r.sumados)      partes.push(`${r.sumados} sumado${r.sumados === 1 ? '' : 's'} a lo que ya había`);
      if (r.desconocidos) partes.push(`${r.desconocidos} ya no está${r.desconocidos === 1 ? '' : 'n'} en el catálogo`);
      toast(`🔁 ${e.proveedor}: ${partes.join(' · ') || 'nada que añadir'}`, 'green', 3800);
      closeSheet();
      if (onChange) onChange();
    });
    document.getElementById('ph-again').addEventListener('click', async () => {
      const b = document.getElementById('ph-again'); b.disabled = true;
      try { await descargaExcel(e.lineas, e.proveedor, e.terminal || getTerminal(), e.user || getUser(), e.fecha); toast('Excel descargado de nuevo', 'green'); }
      catch (err) { toast(err.message || 'No se pudo generar el Excel', 'red', 4000); }
      b.disabled = false;
    });
    document.getElementById('ph-del').addEventListener('click', () => {
      const area = document.getElementById('ph-del-area');
      area.innerHTML = `<div class="ph-confirm"><span>¿Borrar este pedido del historial?</span>
        <button id="ph-del-no" class="ph-secondary" style="flex:1;margin:0">Cancelar</button>
        <button id="ph-del-si" class="ph-danger" style="flex:1;margin:0">Sí, borrar</button></div>`;
      document.getElementById('ph-del-no').addEventListener('click', () => pintaDetalle(e));
      document.getElementById('ph-del-si').addEventListener('click', () => {
        saveHistory(getHistory().filter((x) => x.id !== e.id));
        toast('Pedido borrado del historial', 'amber');
        if (onChange) onChange();
        pintaLista();
      });
    });
  };

  pintaLista();
}
