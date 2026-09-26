// js/tabaco-core.js — lógica pura del control de tabaco del almacén (sin DOM). Tests: node --test tests/tabaco-core.test.mjs
export const TIPOS = ['inventario', 'salida', 'recepcion', 'entrada', 'anulacion', 'regularizacion'];
const RE_TABACO = /CART[OÓ]N|PICADURA|BOLSA|TEREA|HEETS|\bRYO\b|CIGAR|TABAC|POUCH|\bPUROS?\b/i;

export function esTabaco(p) {
  if (!p) return false;
  const fam = String(p.family || '').toUpperCase().trim();
  if (fam === 'TABACO CANARIO') return true;
  return fam === 'CISA' && RE_TABACO.test(String(p.name || ''));
}

export function nuevoId(prefijo = 'm') { return prefijo + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
export function nuevoSalt() { const a = new Uint8Array(8); globalThis.crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
export async function sha256Hex(str) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
export function hashPin(pin, salt) { return sha256Hex(salt + ':' + String(pin)); }
export function pinValido(pin) { return /^\d{4,6}$/.test(String(pin)); }

export function nuevoEstado(terminal, admin) {
  return { v: 1, terminal, creado: new Date().toISOString(), admin, personas: [], ajustes: { horasAvisoVale: 2 },
    movs: [], stock: {}, seq: 0, lastHash: '0', salidaEnCurso: null, entradaEnCurso: null, inventarioEnCurso: null };
}

export function canonical(obj) {
  return JSON.stringify(obj, (k, v) => (v && typeof v === 'object' && !Array.isArray(v))
    ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v);
}

export function normLineas(lineas) {
  const out = [];
  for (const l of lineas || []) {
    if (!l || !l.ref) continue;
    const qty = Math.trunc(Number(l.qty));
    if (!(qty > 0)) continue;
    out.push({ ref: String(l.ref).trim(), name: String(l.name || '').trim(), ean: String(l.ean || '').trim(), qty });
  }
  return out;
}
export function totalLineas(lineas) { return (lineas || []).reduce((a, l) => a + (Number(l.qty) || 0), 0); }

export function hashDe(mov) { const { hash, ...resto } = mov; return sha256Hex(resto.prevHash + '|' + canonical(resto)); }

export async function crearMovimiento(estado, { tipo, persona, lineas, nota = '', extra = {}, ts = null }) {
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de movimiento desconocido: ' + tipo);
  const mov = { id: nuevoId(), seq: (estado.seq || 0) + 1, ts: ts || new Date().toISOString(), tipo, terminal: estado.terminal,
    persona: { id: persona.id, nombre: persona.nombre }, lineas: normLineas(lineas), nota: String(nota || ''), extra: extra || {}, prevHash: estado.lastHash || '0' };
  mov.hash = await hashDe(mov);
  return mov;
}

export async function verificarCadena(movs) {
  let prev = '0';
  for (let i = 0; i < movs.length; i++) {
    const m = movs[i];
    if (m.seq !== i + 1) return { ok: false, rotoEn: m.seq, motivo: 'falta o sobra un movimiento' };
    if (m.prevHash !== prev) return { ok: false, rotoEn: m.seq, motivo: 'el eslabón anterior no coincide' };
    if (await hashDe(m) !== m.hash) return { ok: false, rotoEn: m.seq, motivo: 'contenido modificado' };
    prev = m.hash;
  }
  return { ok: true, rotoEn: null, ultimo: prev, n: movs.length };
}

export function indexarPorId(movs) { const o = {}; for (const m of movs) o[m.id] = m; return o; }

export function aplicarMovimiento(stock, mov, porId = {}) {
  const s = { ...stock };
  const suma = (lineas, signo) => { for (const l of lineas) s[l.ref] = (s[l.ref] || 0) + signo * l.qty; };
  const e = mov.extra || {};
  if (mov.tipo === 'inventario') {
    if (e.completo) for (const r of Object.keys(s)) s[r] = 0;
    for (const l of mov.lineas) s[l.ref] = l.qty;
    for (const r of e.ceros || []) s[r] = 0;
  } else if (mov.tipo === 'salida') suma(mov.lineas, -1);
  else if (mov.tipo === 'entrada') suma(mov.lineas, +1);
  else if (mov.tipo === 'anulacion') {
    const a = porId[e.anulaId];
    if (a && a.tipo === 'salida') suma(a.lineas, +1);
    if (a && a.tipo === 'entrada') suma(a.lineas, -1);
  }
  for (const r of Object.keys(s)) if (s[r] === 0) delete s[r];
  return s;
}
export function calcularStock(movs) { const porId = indexarPorId(movs); return movs.reduce((s, m) => aplicarMovimiento(s, m, porId), {}); }

export function infoRefs(movs) {
  const o = {};
  for (const m of movs) for (const l of m.lineas) o[l.ref] = { name: l.name || (o[l.ref] && o[l.ref].name) || '', ean: l.ean || (o[l.ref] && o[l.ref].ean) || '' };
  return o;
}

export function diferenciasInventario(stock, contado, completo, info = {}) {
  const refs = new Set([...Object.keys(contado), ...(completo ? Object.keys(stock) : [])]);
  const out = [];
  for (const ref of refs) {
    const teorico = stock[ref] || 0, c = Math.max(0, Math.trunc(Number(contado[ref] ?? 0)));
    out.push({ ref, name: (info[ref] && info[ref].name) || '', ean: (info[ref] && info[ref].ean) || '', teorico, contado: c, dif: c - teorico });
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

export function anulados(movs) { const s = new Set(); for (const m of movs) if (m.tipo === 'anulacion') s.add((m.extra || {}).anulaId); return s; }

export function valesPendientes(movs, ahora = Date.now(), horasAviso = 2) {
  const an = anulados(movs), recibidos = new Set(movs.filter(m => m.tipo === 'recepcion').map(m => m.extra.valeId));
  return movs.filter(m => m.tipo === 'salida' && !an.has(m.id) && !recibidos.has(m.id))
    .map(m => { const horas = (ahora - Date.parse(m.ts)) / 36e5; return { ...m, horas, tarde: horas >= horasAviso }; });
}
export function siguienteVale(movs) { return 'V-' + String(movs.filter(m => m.tipo === 'salida').length + 1).padStart(4, '0'); }

export function descuadres(movs) {
  const reg = new Map();
  for (const m of movs) if (m.tipo === 'regularizacion') for (const id of (m.extra || {}).descuadreIds || []) reg.set(id, m);
  const out = [];
  for (const m of movs) {
    for (const d of (m.extra || {}).diferencias || []) {
      if (!d.dif) continue;
      const id = m.id + ':' + d.ref, r = reg.get(id);
      out.push({ id, movId: m.id, seq: m.seq, ts: m.ts, tipo: m.tipo === 'recepcion' ? 'transito' : 'inventario', ref: d.ref, name: d.name || '', ean: d.ean || '',
        dif: d.dif, persona: m.persona.nombre, vale: (m.extra || {}).vale || '', estado: r ? 'regularizado' : 'pendiente', regularizadoTs: r ? r.ts : null, barco: r ? (r.extra.barco || '') : '' });
    }
  }
  return out;
}

export function parseFilasStock(rows) {
  const norm = v => String(v ?? '').trim(), low = v => norm(v).toLowerCase();
  const REF = ['ref', 'artículo', 'articulo', 'código', 'codigo'], QTY = ['almacén', 'almacen', 'cantidad', 'stock', 'disponible'], NOM = ['nombre', 'descripción', 'descripcion'];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = (rows[i] || []).map(low);
    const iRef = h.findIndex(c => REF.includes(c)); if (iRef < 0) continue;
    const iQty = QTY.map(q => h.indexOf(q)).find(x => x >= 0); if (iQty === undefined) continue;
    const iNom = NOM.map(q => h.indexOf(q)).find(x => x >= 0), iEan = h.indexOf('ean');
    const lineas = [], ceros = [];
    for (const r of rows.slice(i + 1)) {
      const ref = norm(r[iRef]); if (!ref) continue;
      const q = Math.trunc(Number(norm(r[iQty] ?? '0').replace(',', '.')));
      if (!Number.isFinite(q) || q < 0) continue;
      const l = { ref, name: iNom !== undefined ? norm(r[iNom]) : '', ean: iEan >= 0 ? norm(r[iEan]) : '', qty: q };
      if (q > 0) lineas.push(l); else ceros.push(ref);
    }
    return { lineas, ceros, cabecera: i + 1 };
  }
  throw new Error('No encontré la cabecera: espero "REF + Almacén" (export de Conteos) o "Artículo + Cantidad" (Proxium)');
}

export function fmtFecha(iso) { const d = new Date(iso); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
export function fmtHora(iso) { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
export function mismoDia(a, b) { return fmtFecha(a) === fmtFecha(b); }

export function detalleMov(m) {
  const e = m.extra || {};
  switch (m.tipo) {
    case 'inventario': return (e.completo ? 'completo' : 'parcial') + (e.origen === 'excel' ? ' · Excel ' + (e.archivo || '') : '');
    case 'recepcion': return 'recibe ' + (e.vale || '') + (e.mismaPersona ? ' · MISMA PERSONA QUE SACÓ' : '');
    case 'entrada': return e.motivo || '';
    case 'anulacion': return 'anula #' + e.anulaSeq + (e.motivo ? ': ' + e.motivo : '');
    case 'regularizacion': return (e.descuadreIds || []).length + ' descuadres · barco ' + (e.barco || '—');
    default: return e.destino ? 'a ' + e.destino : '';
  }
}

export function filasExcelHistorico(movs, integridad) {
  const filas = [['Fecha', 'Hora', 'Seq', 'Tipo', 'Vale', 'Persona', 'REF', 'Nombre', 'EAN', 'Cantidad', 'Nota', 'Detalle', 'Hash']];
  for (const m of [...movs].reverse()) {
    const base = [fmtFecha(m.ts), fmtHora(m.ts), m.seq, m.tipo, (m.extra || {}).vale || '', m.persona.nombre], det = detalleMov(m), h = (m.hash || '').slice(0, 12);
    if (!m.lineas.length) filas.push([...base, '', '', '', '', m.nota, det, h]);
    for (const l of m.lineas) filas.push([...base, l.ref, l.name, l.ean, l.qty, m.nota, det, h]);
  }
  if (integridad && !integridad.ok) filas.push([], ['⚠ REGISTRO ALTERADO', (integridad.problemas || []).join(' · ')]);
  return filas;
}
export function filasExcelRegularizacion(descs) {
  return [['Artículo', 'Nombre', 'EAN', 'Ajuste', 'Tipo', 'Fecha del descuadre', 'Quién contó', 'Vale', 'Barco'],
    ...descs.map(d => [d.ref, d.name, d.ean || '', d.dif, d.tipo, fmtFecha(d.ts), d.persona, d.vale || '', d.barco || ''])];
}

export function resumenDia(movs, fechaIso, terminal) {
  const dia = movs.filter(m => mismoDia(m.ts, fechaIso)), an = anulados(movs);
  const porPersona = {};
  for (const m of dia) if (m.tipo === 'salida' && !an.has(m.id)) { const p = porPersona[m.persona.nombre] = porPersona[m.persona.nombre] || { n: 0, uds: 0, vales: [] }; p.n++; p.uds += totalLineas(m.lineas); p.vales.push(m.extra.vale); }
  const entradas = dia.filter(m => m.tipo === 'entrada' && !an.has(m.id)).reduce((a, m) => a + totalLineas(m.lineas), 0);
  const inv = dia.filter(m => m.tipo === 'inventario').length;
  const stock = calcularStock(movs), total = Object.values(stock).reduce((a, b) => a + b, 0);
  const pend = valesPendientes(movs).length, desc = descuadres(movs).filter(d => d.estado === 'pendiente').length;
  const lineas = [`🚬 Tabaco almacén · Terminal ${terminal} · ${fmtFecha(fechaIso)}`];
  const nombres = Object.keys(porPersona).sort();
  lineas.push(nombres.length ? 'Salidas a tienda:' : 'Salidas a tienda: ninguna');
  for (const n of nombres) { const p = porPersona[n]; lineas.push(`• ${n}: ${p.n} salida${p.n === 1 ? '' : 's'} · ${p.uds} uds (${p.vales.join(', ')})`); }
  if (entradas) lineas.push(`Entradas al almacén: ${entradas} uds`);
  if (inv) lineas.push(`Inventarios hechos: ${inv}`);
  lineas.push(`Stock almacén: ${total} uds en ${Object.keys(stock).length} artículos`, `Vales sin recibir: ${pend}`, `Descuadres pendientes: ${desc}`);
  return lineas.join('\n');
}

export function nombreArchivo(tipo, terminal, fecha = new Date()) { return `${tipo}_tabaco_${terminal}_${fmtFecha(fecha.toISOString()).replace(/\//g, '-')}.xlsx`; }
