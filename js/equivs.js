// js/equivs.js — equivalencias por artículo que publica el sync (equivs.json, 18-11-2026): {ref: {CLAVE_PROVEEDOR: 'código'}} más los
// alias de proveedor del Matcher. Sirven para que el Excel del pedido único de Tenerife lleve el código con el que el proveedor elegido
// conoce cada artículo (V&B 4026 y AHEMBO 2285 para la misma lata de 7UP). Si el archivo no está, la app sigue igual (sin códigos).
let _equivs = {}, _alias = {};

export async function loadEquivs() {
  try {
    const res = await fetch('equivs.json?_=' + Date.now());
    const j = await res.json();
    _equivs = j && j.equivs && typeof j.equivs === 'object' ? j.equivs : {};
    _alias  = j && j.alias  && typeof j.alias  === 'object' ? j.alias  : {};
  } catch { _equivs = {}; _alias = {}; }
}
export function getEquivs() { return _equivs; }
export function getAlias()  { return _alias; }
