// js/tabaco-store.js — almacén del módulo de tabaco: localStorage `itab` + eslabón duplicado en IndexedDB meta `tabaco-cadena`
import { calcularStock, crearMovimiento, verificarCadena, hashPin, nuevoEstado, nuevoSalt, nuevoId, pinValido } from './tabaco-core.js';
import { getMeta, setMeta } from './db.js';

export const KEY = 'itab';
const META = 'tabaco-cadena';
const META_ANT = 'tabaco-cadena-anterior';   // rastro de un registro que hubo antes en este móvil
// Si IndexedDB falla al guardar el eslabón, la segunda copia deja de valer como aviso de
// borrados: se apunta aquí para decirlo en la banda de integridad (no es «registro alterado»).
let _metaFallo = false;
export function fallaSegundaCopia() { return _metaFallo; }

export function cargar() {
  try { const e = JSON.parse(localStorage.getItem(KEY) || 'null'); return e && e.v === 1 ? e : null; } catch { return null; }
}

// La app puede estar abierta dos veces (la instalada y una pestaña del navegador): las dos
// escriben en el MISMO `itab`, así que antes de guardar se mira lo que hay en el disco. Si el
// disco va por delante (más movimientos, u otro último eslabón), no se pisa: se avisa.
export function guardar(estado) {
  const disco = cargar();
  if (disco && ((disco.seq || 0) > (estado.seq || 0) || ((disco.seq || 0) === (estado.seq || 0) && disco.lastHash !== estado.lastHash)))
    throw new Error('El control de tabaco se ha usado en otra ventana. Recarga la app para seguir.');
  escribir(estado);
}
// Escritura a pelo (sin la comprobación de arriba): solo para crear el módulo, que sustituye
// a propósito lo que hubiera.
function escribir(estado) { localStorage.setItem(KEY, JSON.stringify(estado)); }

// Borrar el módulo y volver a crearlo dejaba el registro a cero sin que nadie lo notara. Antes
// de reiniciar se apunta en IndexedDB cuántos movimientos había y cuándo fue el último: ese
// rastro sale en el inicio y en Ajustes, y no se puede quitar desde la app.
async function apuntarRegistroAnterior() {
  let actual = null;
  try { actual = await getMeta(META); } catch {}
  if (!actual || !(actual.seq > 0)) return;
  let ant = null;
  try { ant = await getMeta(META_ANT); } catch {}
  if (ant && (ant.seq || 0) >= actual.seq) return;   // se queda el registro más largo que hubo
  try { await setMeta(META_ANT, { seq: actual.seq, lastHash: actual.lastHash, ts: actual.ts, guardado: new Date().toISOString() }); } catch {}
}
export async function registroAnterior() { try { return await getMeta(META_ANT); } catch { return null; } }

export async function crear(terminal, pinAdmin) {
  if (!pinValido(pinAdmin)) throw new Error('El PIN de administrador debe tener de 4 a 6 dígitos');
  const salt = nuevoSalt();
  const estado = nuevoEstado(terminal, { salt, hash: await hashPin(pinAdmin, salt) });
  await apuntarRegistroAnterior();
  escribir(estado);
  try { await setMeta(META, { seq: 0, lastHash: '0', ts: estado.creado }); } catch { _metaFallo = true; }
  return estado;
}

// Añadir un movimiento: primero se GUARDA una copia con el movimiento dentro y solo si el
// guardado sale bien se toca el estado que tiene la pantalla delante. Así, si otra ventana se
// ha adelantado (o localStorage está lleno), no queda nada apuntado en memoria que no esté
// en el disco.
export async function registrar(estado, datos) {
  const mov = await crearMovimiento(estado, datos);
  const movs = [...estado.movs, mov];
  const nuevo = { ...estado, movs, seq: mov.seq, lastHash: mov.hash, stock: calcularStock(movs) };
  guardar(nuevo);   // puede lanzar: entonces en memoria no cambia nada
  estado.movs.push(mov);
  estado.seq = nuevo.seq; estado.lastHash = nuevo.lastHash; estado.stock = nuevo.stock;
  try { await setMeta(META, { seq: mov.seq, lastHash: mov.hash, ts: mov.ts }); } catch { _metaFallo = true; }
  return mov;
}

const ordenado = o => Object.keys(o).sort().map(k => k + '=' + o[k]).join(';');

// `problemas` = el registro no cuadra (banda roja). `avisos` = la segunda defensa no está
// funcionando en este móvil (banda en ámbar aparte): no es que falte nada, es que si faltara
// no nos enteraríamos. Se distinguen para no dar por alterado un registro que está bien.
export async function verificarIntegridad(estado) {
  const problemas = [], avisos = [];
  const cadena = await verificarCadena(estado.movs);
  if (!cadena.ok) problemas.push(`registro roto en el movimiento #${cadena.rotoEn}: ${cadena.motivo}`);
  else if (estado.seq !== estado.movs.length || (estado.movs.length && estado.lastHash !== cadena.ultimo)) problemas.push('el último eslabón guardado no coincide con los movimientos');
  if (ordenado(calcularStock(estado.movs)) !== ordenado(estado.stock || {})) problemas.push('el stock guardado no coincide con los movimientos');
  let meta = null, metaRoto = false;
  try { meta = await getMeta(META); } catch { metaRoto = true; }
  if (metaRoto || (!meta && (estado.seq || 0) > 0)) avisos.push('No se pudo leer la segunda copia del eslabón: la detección de borrados está desactivada en este móvil.');
  else if (meta && meta.seq > estado.seq) problemas.push(`faltan movimientos: este móvil llegó a tener ${meta.seq} y ahora hay ${estado.seq}`);
  else if (meta && meta.seq === estado.seq && meta.lastHash !== estado.lastHash) problemas.push('el último movimiento no es el que se registró');
  if (_metaFallo) avisos.push('No se pudo guardar la segunda copia del eslabón: la detección de borrados está desactivada en este móvil.');
  return { ok: problemas.length === 0, problemas, avisos, n: estado.movs.length };
}

export async function buscarPersonaPorPin(estado, pin) {
  for (const p of estado.personas) if (p.activa && await hashPin(pin, p.salt) === p.hash) return p;
  return null;
}
export async function esAdminPin(estado, pin) { return await hashPin(pin, estado.admin.salt) === estado.admin.hash; }

const RESERVADOS = ['administrador'];   // el nombre con el que firma el admin: no puede haber dos

// Igual que `registrar`: se guarda primero la lista nueva de personas y solo si el guardado sale
// bien se cambia la que tiene la pantalla delante. Si otra ventana se ha adelantado, esto lanza y
// en memoria no queda un alta (o una baja) que no está en el disco.
function guardaPersonas(estado, personas) {
  guardar({ ...estado, personas });
  estado.personas = personas;
}

export async function altaPersona(estado, nombre, pin) {
  nombre = String(nombre || '').trim();
  if (!nombre) throw new Error('Falta el nombre');
  // Dos «Marta» activas hacen ilegible el histórico y el parte del día (y «Administrador» se
  // confundiría con lo que firma Jose al anular o regularizar).
  if (RESERVADOS.includes(nombre.toLowerCase())) throw new Error('Ese nombre está reservado');
  if (estado.personas.some(p => p.activa && p.nombre.trim().toLowerCase() === nombre.toLowerCase())) throw new Error('Ya hay una persona activa con ese nombre');
  if (!pinValido(pin)) throw new Error('El PIN debe tener de 4 a 6 dígitos');
  if (await buscarPersonaPorPin(estado, pin)) throw new Error('Ese PIN ya lo usa otra persona: elige otro');
  if (await esAdminPin(estado, pin)) throw new Error('Ese PIN es el de administrador: elige otro');
  const salt = nuevoSalt();
  const p = { id: nuevoId('p'), nombre, salt, hash: await hashPin(pin, salt), activa: true, creada: new Date().toISOString() };
  guardaPersonas(estado, [...estado.personas, p]);
  return p;
}
export async function cambiarPinPersona(estado, personaId, pin) {
  if (!pinValido(pin)) throw new Error('El PIN debe tener de 4 a 6 dígitos');
  const p = estado.personas.find(x => x.id === personaId); if (!p) throw new Error('Persona no encontrada');
  const otra = await buscarPersonaPorPin(estado, pin);
  if (otra && otra.id !== personaId) throw new Error('Ese PIN ya lo usa otra persona: elige otro');
  if (await esAdminPin(estado, pin)) throw new Error('Ese PIN es el de administrador: elige otro');
  const salt = nuevoSalt(), hash = await hashPin(pin, salt);
  guardaPersonas(estado, estado.personas.map(x => x.id === personaId ? { ...x, salt, hash } : x));
}
export function bajaPersona(estado, personaId) {
  if (!estado.personas.some(x => x.id === personaId)) return;
  const baja = new Date().toISOString();
  guardaPersonas(estado, estado.personas.map(x => x.id === personaId ? { ...x, activa: false, baja } : x));
}
export async function cambiarPinAdmin(estado, pin) {
  if (!pinValido(pin)) throw new Error('El PIN debe tener de 4 a 6 dígitos');
  if (await buscarPersonaPorPin(estado, pin)) throw new Error('Ese PIN ya lo usa una persona: elige otro');
  const salt = nuevoSalt();
  const admin = { salt, hash: await hashPin(pin, salt) };
  guardar({ ...estado, admin });   // si otra ventana se adelantó, lanza y el PIN de aquí no cambia
  estado.admin = admin;
}
export function exportarCopia(estado) { return JSON.stringify({ exportado: new Date().toISOString(), ...estado }, null, 1); }
export async function borrarModulo() {
  await apuntarRegistroAnterior();
  localStorage.removeItem(KEY);
  try { await setMeta(META, { seq: 0, lastHash: '0', ts: new Date().toISOString() }); } catch {}
}
