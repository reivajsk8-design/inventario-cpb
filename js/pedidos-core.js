// js/pedidos-core.js — lógica PURA de los pedidos (sin DOM): reparto por proveedor, filas del Excel,
// nombre del archivo, histórico y «repetir pedido». Probado en tests/pedidos-core.test.mjs (node --test).
// El pedido en curso es {ref: cantidad} (localStorage 'io'); el proveedor es la familia del artículo.

export const HIST_KEY = 'ioh';   // histórico de pedidos de este dispositivo
export const HIST_MAX = 200;
export const SIN_FAMILIA = 'SIN FAMILIA';

const clean = (v) => (v == null ? '' : String(v));

export function fechaHoy(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function horaAhora(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fmtFecha(iso) {
  const p = clean(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : clean(iso);
}

// Pedido en curso → grupos por proveedor (familia), ordenados por nombre, con sus líneas y totales.
// Cada línea lleva una copia de los datos del artículo (para el Excel y para el histórico).
export function agruparPorProveedor(orders, all) {
  const porRef = new Map((all || []).map((p) => [p.ref, p]));
  const grupos = new Map();
  Object.entries(orders || {}).forEach(([ref, qty]) => {
    const n = Number(qty) || 0;
    const p = porRef.get(ref);
    if (n <= 0 || !p) return;
    const fam = clean(p.family).trim() || SIN_FAMILIA;
    if (!grupos.has(fam)) grupos.set(fam, { family: fam, lines: [], refs: 0, uds: 0 });
    const g = grupos.get(fam);
    g.lines.push({ ref: p.ref, name: clean(p.name), ean: clean(p.ean), proxium: clean(p.proxium), family: fam, qty: n, cost: Number(p.cost) || 0 });
    g.refs += 1;
    g.uds += n;
  });
  const out = [...grupos.values()];
  out.forEach((g) => g.lines.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'es')));
  out.sort((a, b) => a.family.localeCompare(b.family, 'es'));
  return out;
}

// Filas del Excel de un proveedor: las MISMAS columnas que el export de pedidos de siempre.
export function filasExcel(lines, user, terminal) {
  return [
    ['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'Ref. Proveedor', 'Familia', 'Cantidad pedida', 'Coste'],
    ...(lines || []).map((l) => [clean(user), clean(terminal), l.ref, l.name, l.ean, l.proxium, l.family === SIN_FAMILIA ? '' : l.family, l.qty, l.cost]),
  ];
}

// espacios → «_» y fuera lo que un nombre de archivo no admite (los acentos se quedan: «Ana_García»)
const safe = (s) => clean(s).trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|.,']/g, '');

// pedido_ASIA_IMPORTACIONES_TermE_Marta_23-09-2026.xlsx
export function nombreArchivo(family, terminal, user, fechaIso) {
  const f = fmtFecha(fechaIso).replace(/\//g, '-');
  return `pedido_${safe(family) || 'SIN_FAMILIA'}${terminal ? '_Term' + safe(terminal) : ''}_${safe(user) || 'export'}_${f}.xlsx`;
}

// Entrada del histórico a partir de un grupo exportado.
export function nuevaEntradaHistorial(grupo, terminal, user, ahora = new Date()) {
  return {
    id: ahora.getTime().toString(36) + Math.random().toString(36).slice(2, 7),
    ts: ahora.getTime(),
    fecha: fechaHoy(ahora),
    hora: horaAhora(ahora),
    terminal: clean(terminal),
    user: clean(user),
    proveedor: grupo.family,
    refs: grupo.refs,
    uds: grupo.uds,
    lineas: grupo.lines.map((l) => ({ ...l })),
  };
}

export function recortaHistorial(lista, max = HIST_MAX) {
  const l = (Array.isArray(lista) ? lista : []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return l.slice(0, max);
}

// Quita del pedido en curso las referencias exportadas (devuelve un pedido nuevo).
export function quitarDelPedido(orders, refs) {
  const out = { ...(orders || {}) };
  (refs || []).forEach((r) => { delete out[r]; });
  return out;
}

// Repetir un pedido del histórico: SUMA sus cantidades al pedido en curso (decisión de Jose, 23-09-2026).
// Las referencias que ya no existen en el catálogo se dejan fuera y se cuentan.
export function repetirEnPedido(orders, lineas, all) {
  const existe = new Set((all || []).map((p) => p.ref));
  const out = { ...(orders || {}) };
  let anadidos = 0, sumados = 0, desconocidos = 0;
  (lineas || []).forEach((l) => {
    const n = Number(l.qty) || 0;
    if (n <= 0) return;
    if (all && !existe.has(l.ref)) { desconocidos += 1; return; }
    if (out[l.ref] > 0) { out[l.ref] += n; sumados += 1; } else { out[l.ref] = n; anadidos += 1; }
  });
  return { orders: out, anadidos, sumados, desconocidos };
}
