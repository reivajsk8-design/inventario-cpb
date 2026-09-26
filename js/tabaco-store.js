// js/tabaco-store.js — almacén del módulo de tabaco: localStorage `itab` + eslabón duplicado en IndexedDB meta `tabaco-cadena`
import { calcularStock, crearMovimiento, verificarCadena, hashPin, nuevoEstado, nuevoSalt, nuevoId, pinValido } from './tabaco-core.js';
import { getMeta, setMeta } from './db.js';

export const KEY = 'itab';
const META = 'tabaco-cadena';

export function cargar() {
  try { const e = JSON.parse(localStorage.getItem(KEY) || 'null'); return e && e.v === 1 ? e : null; } catch { return null; }
}
export function guardar(estado) { localStorage.setItem(KEY, JSON.stringify(estado)); }

export async function crear(terminal, pinAdmin) {
  if (!pinValido(pinAdmin)) throw new Error('El PIN de administrador debe tener de 4 a 6 dígitos');
  const salt = nuevoSalt();
  const estado = nuevoEstado(terminal, { salt, hash: await hashPin(pinAdmin, salt) });
  guardar(estado);
  try { await setMeta(META, { seq: 0, lastHash: '0', ts: estado.creado }); } catch {}
  return estado;
}

export async function registrar(estado, datos) {
  const mov = await crearMovimiento(estado, datos);
  estado.movs.push(mov);
  estado.seq = mov.seq; estado.lastHash = mov.hash;
  estado.stock = calcularStock(estado.movs);
  guardar(estado);
  try { await setMeta(META, { seq: mov.seq, lastHash: mov.hash, ts: mov.ts }); } catch {}
  return mov;
}

const ordenado = o => Object.keys(o).sort().map(k => k + '=' + o[k]).join(';');

export async function verificarIntegridad(estado) {
  const problemas = [];
  const cadena = await verificarCadena(estado.movs);
  if (!cadena.ok) problemas.push(`registro roto en el movimiento #${cadena.rotoEn}: ${cadena.motivo}`);
  else if (estado.seq !== estado.movs.length || (estado.movs.length && estado.lastHash !== cadena.ultimo)) problemas.push('el último eslabón guardado no coincide con los movimientos');
  if (ordenado(calcularStock(estado.movs)) !== ordenado(estado.stock || {})) problemas.push('el stock guardado no coincide con los movimientos');
  let meta = null;
  try { meta = await getMeta(META); } catch {}
  if (meta && meta.seq > estado.seq) problemas.push(`faltan movimientos: este móvil llegó a tener ${meta.seq} y ahora hay ${estado.seq}`);
  else if (meta && meta.seq === estado.seq && meta.lastHash !== estado.lastHash) problemas.push('el último movimiento no es el que se registró');
  return { ok: problemas.length === 0, problemas, n: estado.movs.length };
}

export async function buscarPersonaPorPin(estado, pin) {
  for (const p of estado.personas) if (p.activa && await hashPin(pin, p.salt) === p.hash) return p;
  return null;
}
export async function esAdminPin(estado, pin) { return await hashPin(pin, estado.admin.salt) === estado.admin.hash; }

export async function altaPersona(estado, nombre, pin) {
  nombre = String(nombre || '').trim();
  if (!nombre) throw new Error('Falta el nombre');
  if (!pinValido(pin)) throw new Error('El PIN debe tener de 4 a 6 dígitos');
  if (await buscarPersonaPorPin(estado, pin)) throw new Error('Ese PIN ya lo usa otra persona: elige otro');
  if (await esAdminPin(estado, pin)) throw new Error('Ese PIN es el de administrador: elige otro');
  const salt = nuevoSalt();
  const p = { id: nuevoId('p'), nombre, salt, hash: await hashPin(pin, salt), activa: true, creada: new Date().toISOString() };
  estado.personas.push(p); guardar(estado);
  return p;
}
export async function cambiarPinPersona(estado, personaId, pin) {
  if (!pinValido(pin)) throw new Error('El PIN debe tener de 4 a 6 dígitos');
  const p = estado.personas.find(x => x.id === personaId); if (!p) throw new Error('Persona no encontrada');
  const otra = await buscarPersonaPorPin(estado, pin);
  if (otra && otra.id !== personaId) throw new Error('Ese PIN ya lo usa otra persona: elige otro');
  if (await esAdminPin(estado, pin)) throw new Error('Ese PIN es el de administrador: elige otro');
  p.salt = nuevoSalt(); p.hash = await hashPin(pin, p.salt); guardar(estado);
}
export function bajaPersona(estado, personaId) { const p = estado.personas.find(x => x.id === personaId); if (p) { p.activa = false; p.baja = new Date().toISOString(); guardar(estado); } }
export async function cambiarPinAdmin(estado, pin) {
  if (!pinValido(pin)) throw new Error('El PIN debe tener de 4 a 6 dígitos');
  if (await buscarPersonaPorPin(estado, pin)) throw new Error('Ese PIN ya lo usa una persona: elige otro');
  const salt = nuevoSalt(); estado.admin = { salt, hash: await hashPin(pin, salt) }; guardar(estado);
}
export function exportarCopia(estado) { return JSON.stringify({ exportado: new Date().toISOString(), ...estado }, null, 1); }
export function borrarModulo() { localStorage.removeItem(KEY); }
