import test from 'node:test';
import assert from 'node:assert/strict';
import { TIENDAS, normTienda, precioMostrado } from '../js/tienda-core.js';

test('normTienda acepta bcn/tf y rechaza el resto', () => {
  assert.equal(normTienda('bcn'), 'bcn'); assert.equal(normTienda('tf'), 'tf');
  assert.equal(normTienda('TF'), 'tf'); assert.equal(normTienda(''), null); assert.equal(normTienda(null), null); assert.equal(normTienda('madrid'), null);
  assert.deepEqual(TIENDAS, { bcn: 'Barcelona', tf: 'Tenerife' });
});

test('precioMostrado: Barcelona usa pvp; Tenerife usa pvp_tf; falta → texto gris', () => {
  const p = { ref: 'PCDI248', pvp: 89.9, pvp_tf: 95.5 };
  assert.deepEqual(precioMostrado(p, 'bcn'), { valor: 89.9, texto: '89.90€', falta: false });
  assert.deepEqual(precioMostrado(p, 'tf'), { valor: 95.5, texto: '95.50€', falta: false });
  assert.deepEqual(precioMostrado({ ref: 'ABA-001', pvp: 3.5, pvp_tf: null }, 'tf'), { valor: null, texto: 'sin precio Tenerife', falta: true });
  assert.deepEqual(precioMostrado({ ref: 'TF-X', pvp: 0, pvp_tf: 7.9 }, 'bcn'), { valor: null, texto: '—', falta: true }, 'solo-Tenerife en Barcelona: no inventa');
  assert.deepEqual(precioMostrado({ ref: 'VIEJO', pvp: 5 }, 'tf'), { valor: null, texto: 'sin precio Tenerife', falta: true }, 'producto de una base antigua sin el campo');
  assert.deepEqual(precioMostrado({ ref: 'X', pvp: 5 }, null), { valor: 5, texto: '5.00€', falta: false }, 'sin tienda elegida → Barcelona');
});
