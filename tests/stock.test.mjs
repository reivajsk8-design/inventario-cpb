import test from 'node:test';
import assert from 'node:assert/strict';
import { stockDeFilas } from '../js/stock.js';

test('stockDeFilas: depósito fiscal (Artículo + Cantidad)', () => {
  const rows = [['Listado: Inventario'], [], ['Artículo', 'Descripción', 'Bultos', 'Cantidad'], ['CAMF20', 'CARTON CAMEL', '3', '112'], ['', '', '', '']];
  assert.deepEqual(stockDeFilas(rows), { CAMF20: 112 });
});

test('stockDeFilas: «Detalle del stock» (Código + Stock): las partidas del mismo código se SUMAN (Tenerife, 04-11-2026)', () => {
  const rows = [['Listado: Consulta dinámica del stock -> Detalle del stock'], [],
    ['Código', 'Descripción', 'EAN', 'Stock', 'Disponible', 'U. Med.', 'Almacén'],
    ['MARR40', 'CARTON MARLBORO RED', '7622100972518;7622100879107', 100, 100, '2', '1'],
    ['AMBL500', 'BOLSA AMBER LEAF', '4033100062520', 284, 284, '3', '1'],
    ['MARR40', 'CARTON MARLBORO RED', '7622100972518;7622100879107', 26, 26, '2', '1'],
    ['TERS20', 'CARTON TEREA SIENNA', '', '7,5', '', '3', '1']];
  assert.deepEqual(stockDeFilas(rows), { MARR40: 126, AMBL500: 284, TERS20: 7.5 });
});

test('stockDeFilas: sin cabecera → error claro', () => {
  assert.throws(() => stockDeFilas([['Hola', 'Mundo'], [1, 2]]), /cabecera/);
});
