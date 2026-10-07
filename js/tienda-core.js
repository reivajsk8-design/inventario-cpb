// js/tienda-core.js — lógica pura de la tienda de la PDA (Barcelona / Tenerife). Sin DOM ni localStorage: se prueba en Node.
// Barcelona enseña p.pvp; Tenerife enseña p.pvp_tf (PVP Tenerife que llega del Matcher). null = «sin precio» en esa tienda.
export const TIENDAS = { bcn: 'Barcelona', tf: 'Tenerife' };

export function normTienda(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === 'bcn' || s === 'tf') ? s : null;
}

export function precioMostrado(p, tienda) {
  const t = normTienda(tienda) || 'bcn';
  const v = t === 'tf' ? (p && p.pvp_tf) : (p && p.pvp);
  const n = Number(v);
  if (v == null || !(n > 0)) return { valor: null, texto: t === 'tf' ? 'sin precio Tenerife' : '—', falta: true };
  return { valor: n, texto: n.toFixed(2) + '€', falta: false };
}

// ── PIN de supervisor: candado de «Cambiar tienda» (07-10-2026) ──
// Se guarda por PDA en localStorage (PIN_SUP_KEY) como {salt, hash}, con el mismo PBKDF2 del módulo Tabaco.
import { hashPin, nuevoSalt, pinValido } from './tabaco-core.js';
export const PIN_SUP_KEY = 'ic_pinsup';
export async function creaPinSupervisor(pin) {
  if (!pinValido(pin)) return null;
  const salt = nuevoSalt();
  return { salt, hash: await hashPin(pin, salt) };
}
export async function compruebaPinSupervisor(pin, guardado) {
  if (!guardado || !guardado.salt || !guardado.hash || !pinValido(pin)) return false;
  return (await hashPin(pin, guardado.salt)) === guardado.hash;
}
