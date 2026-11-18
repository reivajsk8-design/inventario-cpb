// js/proveedores-tf.js — proveedores de TENERIFE para el pedido único (18-11-2026) y la normalización de nombres de proveedor,
// calcada de normProv/eqProv del Matcher (bloque EQUIV-CORE): sin tildes, mayúsculas, sin signos ni forma jurídica, con alias.
// Sirve para casar el proveedor que elige la encargada con las claves de equivs.json («V B DISTRIBUCIONES|4026») y con la
// familia de cada artículo («AHEMBO, S.L.» → «AHEMBO»). Módulo puro: se prueba en tests/proveedores-tf.test.mjs.

const EQ_FORMAS = { SL: 1, SA: 1, SLU: 1, SAU: 1, SLL: 1, SLNE: 1, SCOOP: 1, COOP: 1, CB: 1, SRL: 1, GMBH: 1, LTD: 1, LIMITED: 1, BV: 1, NV: 1, LLC: 1, INC: 1 };
const sinTildes = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');

export function normProv(s) {
  const t = sinTildes(s).toUpperCase().replace(/\./g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!t) return '';
  let w = t.split(' '), k = w.length;
  while (k > 0 && w[k - 1].length === 1) k--;                       // «S L U» al final (con espacios) → «SLU»
  if (w.length - k >= 2) w = w.slice(0, k).concat([w.slice(k).join('')]);
  const out = w.filter((x) => !EQ_FORMAS[x]);
  return (out.length ? out : w).join(' ');
}

// Alias mínimos de la propia app (los del Matcher llegan con equivs.json y mandan sobre estos).
export const ALIAS_DEFECTO = { 'ALFRAN': 'ALFRAN ARCHIPIELAGO', 'COMERCIAL ALFRAN': 'ALFRAN ARCHIPIELAGO', 'ENSO JEWELRY': 'ENSO JEWERLY' };

// Clave del proveedor tal y como la usan las equivalencias: normalizado + alias (igual que eqProv del Matcher).
export function claveProv(prov, alias) {
  const a = Object.assign({}, ALIAS_DEFECTO, alias || {});
  let p = normProv(prov), n = 0;
  while (p && n < 3 && Object.prototype.hasOwnProperty.call(a, p) && a[p] && normProv(a[p]) !== p) { p = normProv(a[p]); n++; }
  return p;
}

// ¿La clave «larga» es el mismo proveedor que la elegida? Igual, o empieza por ella («ALFRAN ARCHIPIELAGO COMERCIAL ALFRAN»).
export function mismaClave(clave, elegida) {
  if (!clave || !elegida) return false;
  return clave === elegida || clave.startsWith(elegida + ' ');
}

// Los proveedores que sirven a Tenerife según la lista de Proxium (RC_PROVS del Matcher, 27-10-2026), los habituales delante.
const NOMBRES_TF = [
  'V&B DISTRIBUCIONES', 'ALFRAN', 'FRIT RAVICH', 'AHEMBO', 'ENSO JEWERLY', 'ASIA IMPORTACIONES', 'COMERCIAL FRANK', 'MUSSA CANARIAS',
  'POPO IMPORT', 'LOGISTA', 'JTI', 'REGALITOS', 'HG3', 'FUENTE ALTA', 'SOUVENIR SUR SUR', 'LANZALOE', 'SABORITEX', 'MONTSERRAT VIERA',
  'SERMOGA', 'DONATE DISTRIBUCIONES', 'ALTADIS', 'ATLANTIA', "FICHERO'S",
];
export const PROVEEDORES_TF = NOMBRES_TF.map((nombre) => ({ nombre, clave: claveProv(nombre) }));
