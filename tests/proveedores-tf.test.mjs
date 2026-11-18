// node --test tests/proveedores-tf.test.mjs
// Proveedores de Tenerife para el pedido único (18-11-2026): la lista que ve la encargada y la normalización de nombres,
// calcada de normProv/eqProv del Matcher, para casar el proveedor elegido con las claves de equivalencias y con las familias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVEEDORES_TF, normProv, claveProv, mismaClave } from '../js/proveedores-tf.js';

test('normProv: sin tildes, mayúsculas, sin signos y sin forma jurídica, igual que el Matcher', () => {
  assert.equal(normProv('V&B DISTRIBUCIONES'), 'V B DISTRIBUCIONES');
  assert.equal(normProv('AHEMBO, S.L.'), 'AHEMBO');
  assert.equal(normProv('FRIT RAVICH, S.L'), 'FRIT RAVICH');
  assert.equal(normProv('ALFRAN ARCHIPIELAGO S.L. (Comercial Alfran)'), 'ALFRAN ARCHIPIELAGO COMERCIAL ALFRAN');
  assert.equal(normProv('Bodegas PINORD S.A.'), 'BODEGAS PINORD');
  assert.equal(normProv('ENSO JEWERLY SL'), 'ENSO JEWERLY');
  assert.equal(normProv('Mas x Menos Barcelona S. L.'), 'MAS X MENOS BARCELONA');
  assert.equal(normProv(''), ''); assert.equal(normProv(null), '');
});

test('claveProv aplica los alias del Matcher (ALFRAN → ALFRAN ARCHIPIELAGO) y deja el resto igual', () => {
  assert.equal(claveProv('ALFRAN'), 'ALFRAN ARCHIPIELAGO');
  assert.equal(claveProv('Comercial Alfran'), 'ALFRAN ARCHIPIELAGO');
  assert.equal(claveProv('V&B DISTRIBUCIONES'), 'V B DISTRIBUCIONES');
  assert.equal(claveProv('AHEMBO'), 'AHEMBO');
  assert.equal(claveProv('ALFRAN', { 'ALFRAN': 'OTRO NOMBRE' }), 'OTRO NOMBRE', 'los alias que vienen con equivs.json mandan');
});

test('mismaClave: igual o la clave larga que empieza por la corta («ALFRAN ARCHIPIELAGO COMERCIAL ALFRAN» es Alfran)', () => {
  assert.equal(mismaClave('ALFRAN ARCHIPIELAGO COMERCIAL ALFRAN', 'ALFRAN ARCHIPIELAGO'), true);
  assert.equal(mismaClave('V B DISTRIBUCIONES', 'V B DISTRIBUCIONES'), true);
  assert.equal(mismaClave('BEAUTY SUPERBRANDS', 'BEAUTY BRANDS'), false);
  assert.equal(mismaClave('AHEMBO', ''), false);
});

test('PROVEEDORES_TF: los de Proxium que sirven a Tenerife, con V&B, Alfran, Frit Ravich y AHEMBO delante; nombres únicos', () => {
  const n = PROVEEDORES_TF.map((p) => p.nombre);
  assert.deepEqual(n.slice(0, 4), ['V&B DISTRIBUCIONES', 'ALFRAN', 'FRIT RAVICH', 'AHEMBO']);
  assert.ok(n.includes('ASIA IMPORTACIONES') && n.includes('ENSO JEWERLY') && n.includes('COMERCIAL FRANK') && n.includes('FUENTE ALTA'));
  assert.equal(new Set(n).size, n.length);
  PROVEEDORES_TF.forEach((p) => assert.equal(p.clave, claveProv(p.nombre), p.nombre));
});
