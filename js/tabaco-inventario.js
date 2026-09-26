// js/tabaco-inventario.js — inventario del almacén de tabaco (con pistola/cámara/buscador) y carga inicial desde Excel
import { openSheet, closeSheet, openQtySheet, toast, esc } from './ui.js';
import { diferenciasInventario, parseFilasStock, fmtHora } from './tabaco-core.js';
import { registrar, guardar } from './tabaco-store.js';
import { ensureXLSX } from './tabaco-historico.js';   // la librería de Excel se carga en un solo sitio del módulo

const cont = () => document.getElementById('main');

// Inventario del almacén: se cuenta pistoleando (cada lectura SUMA) y al cerrar el stock queda
// EXACTAMENTE en lo contado. Dos reglas iguales que en la salida/entrada:
//  · retomar un inventario a medias SIEMPRE pide el PIN (nadie cuenta a nombre de otro);
//  · un inventario sin nada contado no se guarda (teclear el PIN y arrepentirse no deja rastro).
export async function abrirInventario(ctx) {
  const e = ctx.estado;
  const nuevo = quien => ({ personaId: quien.id, personaNombre: quien.nombre, contado: {}, nombres: {}, completo: true, origen: 'app', archivo: '', iniciado: new Date().toISOString() });
  let borr = e.inventarioEnCurso;
  if (borr) {
    const quien = await ctx.pedirPin({ titulo: 'Continuar inventario de ' + borr.personaNombre, sub: 'Teclea tu PIN' });
    if (!quien) return;
    if (quien.id !== borr.personaId) {   // es otra persona: o descarta lo que contó su compañero, o no sigue
      if (!confirm(`Este inventario es de ${borr.personaNombre} (${Object.keys(borr.contado).length} artículos contados). ¿Descartarlo y empezar el tuyo?`)) return;
      e.inventarioEnCurso = null; guardar(e); borr = nuevo(quien);
    }
  } else {
    const quien = await ctx.pedirPin({ titulo: '¿Quién hace el inventario?' });
    if (!quien) return;
    borr = nuevo(quien);
  }
  // El borrador solo entra en el estado guardado cuando hay algo contado (y sale si se queda sin nada).
  const guardaBorrador = () => {
    if (Object.keys(borr.contado).length) ctx.estado.inventarioEnCurso = borr;
    else if (ctx.estado.inventarioEnCurso === borr) ctx.estado.inventarioEnCurso = null;
    guardar(ctx.estado);
  };
  const stock = () => ctx.estado.stock || {};
  const apunta = (p, qty) => {
    borr.contado[p.ref] = qty;
    borr.nombres[p.ref] = { name: p.name || p.ref, ean: p.ean || '' };
    guardaBorrador(); pinta();
  };
  // Una lectura (pistola o cámara) SUMA lo tecleado. `onDone` (opcional) reanuda la cámara al confirmar.
  const contar = (p, onDone) => openQtySheet({ ...p, family: p.family || 'TABACO' }, [1, 5, 10, 20], 'Contado +{n}', qty => {
    apunta(p, (borr.contado[p.ref] || 0) + qty);
    if (onDone) onDone();
  });
  // Tocar una línea deja un número exacto. La hoja de cantidad no confirma 0, así que
  // «no hay ninguno» va en su propio botón (es lo que deja el descuadre de lo que falta).
  const fijar = p => {
    if (!p) return;
    openQtySheet({ ...p, family: p.family || 'TABACO' }, [1, 5, 10, 20], 'Dejar contado en ×{n}', qty => apunta(p, qty));
    const add = document.getElementById('np-add');
    if (add) {
      const cero = document.createElement('button');
      cero.className = 'tb-danger'; cero.style.marginTop = '8px'; cero.textContent = 'Poner a 0 (no hay ninguno)';
      cero.onclick = () => { apunta(p, 0); closeSheet(); };
      add.insertAdjacentElement('afterend', cero);
    }
  };
  ctx.setOnEan(contar);
  const salir = () => { ctx.setOnEan(null); ctx.refrescar(); };
  const pinta = () => {
    const cat = ctx.catalogo(), contados = Object.keys(borr.contado);
    const refsCat = new Set(cat.map(p => p.ref));
    // Lo contado que no está en el catálogo (REF nueva del Excel) también se ve, con el nombre del Excel.
    const sueltas = contados.filter(r => !refsCat.has(r)).map(r => ({ ref: r, name: (borr.nombres[r] && borr.nombres[r].name) || r, ean: (borr.nombres[r] && borr.nombres[r].ean) || '', family: 'TABACO' }));
    // Se listan los que constan en el almacén y los que se van contando (aunque no constaran).
    const filas = [...cat.filter(p => stock()[p.ref] > 0 || p.ref in borr.contado), ...sueltas];
    cont().innerHTML = `
      <div class="tb-wrap">
        <div class="tb-head"><h2>📋 Inventario del almacén</h2><button class="tb-link" id="tb-cancel">Cancelar</button></div>
        <div class="tb-card"><div class="tb-k">${esc(borr.personaNombre)} · desde ${fmtHora(borr.iniciado)}</div><div class="tb-v">${contados.length} <span style="font-size:0.85rem;font-weight:600">de ${filas.length} artículos contados</span></div><div class="tb-s">Cada lectura SUMA lo tecleado. Toca una línea para dejar un número exacto (o 0).</div></div>
        <label class="tb-toggle"><span>Inventario completo: lo que no cuente queda a 0</span><input type="checkbox" id="tb-completo" ${borr.completo ? 'checked' : ''}></label>
        <div class="tb-row"><button class="tb-btn" id="tb-buscar" style="flex:1">🔍 Buscar artículo<small>si no lee el código</small></button><button class="tb-btn" id="tb-excel" style="flex:1">📄 Cargar desde Excel<small>el conteo ya hecho · admin</small></button></div>
        <div class="tb-lines">${filas.length ? filas.map(p => {
          const c = borr.contado[p.ref], t = stock()[p.ref] || 0;
          return `<button class="tb-line" data-ref="${esc(p.ref)}" style="width:100%;text-align:left"><div class="tb-n">${esc(p.name)}<div class="tb-m">${esc(p.ref)} · teórico ${t}</div></div><div class="tb-q ${c === undefined ? '' : c < t ? 'neg' : c > t ? 'pos' : ''}">${c === undefined ? '—' : c}</div></button>`;
        }).join('') : '<div class="tb-empty">Sin stock todavía: pistolea lo que haya o carga el Excel del conteo</div>'}</div>
        <button class="add-btn" id="tb-cerrar" ${contados.length ? '' : 'disabled style="opacity:0.4"'}>Cerrar inventario</button>
      </div>`;
    document.getElementById('tb-cancel').onclick = () => { if (!contados.length || confirm('¿Cancelar el inventario? Se pierde lo contado.')) { ctx.estado.inventarioEnCurso = null; guardar(ctx.estado); salir(); } };
    document.getElementById('tb-completo').onchange = ev => { borr.completo = ev.target.checked; guardaBorrador(); };
    document.getElementById('tb-buscar').onclick = () => ctx.buscarArticulo(contar);
    document.getElementById('tb-excel').onclick = () => cargarExcel(ctx, borr, () => { guardaBorrador(); pinta(); });
    const porRef = new Map(filas.map(p => [p.ref, p]));
    cont().querySelectorAll('.tb-lines [data-ref]').forEach(b => b.onclick = () => fijar(porRef.get(b.dataset.ref)));
    document.getElementById('tb-cerrar').onclick = () => cerrar();
  };
  const cerrar = () => {
    const info = { ...ctx.info(), ...borr.nombres };
    const difs = diferenciasInventario(stock(), borr.contado, borr.completo, info), conDif = difs.filter(d => d.dif !== 0);
    let enviando = false;
    openSheet(`
      <div class="tb-pin-title">Cerrar inventario</div>
      <div class="tb-pin-sub">${difs.length} artículo${difs.length === 1 ? '' : 's'} · ${conDif.length} con diferencia${borr.completo ? ' · completo' : ' · parcial'}</div>
      <div class="tb-lines" style="margin:10px 0;max-height:45vh;overflow:auto">${conDif.length ? conDif.map(d => `<div class="tb-line"><div class="tb-n">${esc(d.name || d.ref)}<div class="tb-m">${esc(d.ref)} · teórico ${d.teorico} → contado ${d.contado}</div></div><div class="tb-q ${d.dif < 0 ? 'neg' : 'pos'}">${d.dif > 0 ? '+' : ''}${d.dif}</div></div>`).join('') : '<div class="tb-empty">Todo cuadra ✔</div>'}</div>
      <button class="add-btn" id="tb-conf">Confirmar y ajustar el stock</button>`);
    document.getElementById('tb-conf').onclick = async () => {
      if (enviando) return;
      enviando = true;
      try {
        const lineas = difs.filter(d => d.contado > 0).map(d => ({ ref: d.ref, name: d.name, ean: d.ean, qty: d.contado }));
        const ceros = Object.keys(borr.contado).filter(r => !(borr.contado[r] > 0));
        await registrar(ctx.estado, { tipo: 'inventario', persona: { id: borr.personaId, nombre: borr.personaNombre },
          lineas, extra: { completo: borr.completo, origen: borr.origen || 'app', archivo: borr.archivo || '', ceros, diferencias: difs } });
        ctx.estado.inventarioEnCurso = null; guardar(ctx.estado);
        closeSheet();
        toast(conDif.length ? `Inventario cerrado: ${conDif.length} descuadre${conDif.length === 1 ? '' : 's'} apuntado${conDif.length === 1 ? '' : 's'}` : 'Inventario cerrado: todo cuadra', conDif.length ? 'red' : 'green', 3500);
        salir();
      } catch (err) {
        toast('No se pudo registrar: ' + ((err && err.message) || err), 'red', 4000);
      } finally { enviando = false; }
    };
  };
  pinta();
}

// Carga inicial (o de rescate): el conteo ya hecho en un Excel. Es cosa de Jose, así que pide el
// PIN de administrador. No registra nada: rellena lo contado para que se revise y se cierre a mano.
async function cargarExcel(ctx, borr, repinta) {
  const ok = await ctx.pedirPin({ admin: true }); if (ok !== 'admin') return;
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
          const r = parseFilasStock(XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: '' }));
          res = r;
          if (r.lineas.length || r.ceros.length) break;
        } catch (e2) { err = e2; }
      }
      if (!res) throw err || new Error('El Excel no tiene filas con datos');
      if (!res.lineas.length && !res.ceros.length) throw new Error('El Excel no tiene filas con datos');
      // Este inventario es SOLO del tabaco del almacén: un export del stock entero (miles de
      // artículos, casi todos a 0) no puede colarse en el conteo ni en el movimiento.
      const tabaco = new Map(ctx.catalogo().map(p => [p.ref, p]));
      const desconocidas = [], noTabaco = [];
      let cargados = 0;
      for (const l of res.lineas) {
        const p = tabaco.get(l.ref);
        if (!p && ctx.producto(l.ref)) { noTabaco.push(l.ref); continue; }   // la app lo conoce y NO es tabaco: fuera
        borr.contado[l.ref] = l.qty;
        borr.nombres[l.ref] = { name: (p && p.name) || l.name || l.ref, ean: (p && p.ean) || l.ean || '' };
        if (!p) desconocidas.push(l.ref);
        cargados++;
      }
      for (const r of res.ceros) if (tabaco.has(r)) borr.contado[r] = 0;   // los ceros, solo del tabaco
      borr.completo = true; borr.origen = 'excel'; borr.archivo = f.name;
      toast(`Excel cargado: ${cargados} artículos con stock`
        + (noTabaco.length ? ` · ${noTabaco.length} ignorados por no ser tabaco` : '')
        + (desconocidas.length ? ` · ${desconocidas.length} no están en el catálogo (${desconocidas.slice(0, 5).join(', ')}${desconocidas.length > 5 ? '…' : ''})` : '')
        + '. Revisa y pulsa «Cerrar inventario».', (desconocidas.length || noTabaco.length) ? 'red' : 'green', 5000);
      repinta();
    } catch (e) { toast((e && e.message) || 'No se pudo leer el Excel', 'red', 4000); }
  };
  inp.click();
}
