// node --test tests/pedidos-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorProveedor, filasExcel, nombreArchivo, nuevaEntradaHistorial, recortaHistorial, quitarDelPedido, repetirEnPedido, fmtFecha, SIN_FAMILIA } from '../js/pedidos-core.js';

const ALL = [
  { ref: 'TF-ASIA-001', proxium: '60000008', ean: '1030060000008', name: 'BOLSA TELA (TF)', family: 'ASIA IMPORTACIONES', cost: 2.2833 },
  { ref: 'TF-ASIA-002', proxium: '18506258', ean: '8808100232290', name: 'PAÑUELOS VARIADO (TF)', family: 'ASIA IMPORTACIONES', cost: 1.6 },
  { ref: 'ROR-001', proxium: 'BAR3903', ean: '8436603550949', name: 'MONEDERO TELA BCN', family: 'ROBIN RUTH', cost: 1.25 },
  { ref: 'CIS-001', proxium: '700318', ean: '8410013007750', name: 'CODORNIU BENJAMIN', family: 'CISA', cost: 1.29 },
  { ref: 'X-001', proxium: '', ean: '', name: 'SIN FAMILIA', family: '', cost: 0 },
];

test('agruparPorProveedor: un grupo por familia, ordenados, con líneas, refs y uds; ignora ceros y refs desconocidas', () => {
  const g = agruparPorProveedor({ 'ROR-001': 12, 'TF-ASIA-002': 6, 'TF-ASIA-001': 24, 'CIS-001': 0, 'NO-EXISTE': 5, 'X-001': 2 }, ALL);
  assert.deepEqual(g.map((x) => [x.family, x.refs, x.uds]), [['ASIA IMPORTACIONES', 2, 30], ['ROBIN RUTH', 1, 12], [SIN_FAMILIA, 1, 2]]);
  assert.deepEqual(g[0].lines.map((l) => l.ref), ['TF-ASIA-001', 'TF-ASIA-002']);   // más unidades primero
  assert.equal(g[0].lines[0].cost, 2.2833);
  assert.deepEqual(agruparPorProveedor({}, ALL), []);
  assert.deepEqual(agruparPorProveedor(null, null), []);
});

test('filasExcel: las mismas columnas que el export de pedidos de siempre', () => {
  const g = agruparPorProveedor({ 'ROR-001': 12 }, ALL)[0];
  const rows = filasExcel(g.lines, 'Marta', 'E');
  assert.deepEqual(rows[0], ['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'Ref. Proveedor', 'Familia', 'Cantidad pedida', 'Coste']);
  assert.deepEqual(rows[1], ['Marta', 'E', 'ROR-001', 'MONEDERO TELA BCN', '8436603550949', 'BAR3903', 'ROBIN RUTH', 12, 1.25]);
  const sf = agruparPorProveedor({ 'X-001': 2 }, ALL)[0];
  assert.equal(filasExcel(sf.lines, 'Marta', 'E')[1][6], '');   // sin familia → celda vacía, como antes
});

test('nombreArchivo: proveedor, terminal, usuario y fecha, sin caracteres raros', () => {
  assert.equal(nombreArchivo('ASIA IMPORTACIONES', 'E', 'Marta', '2026-09-23'), 'pedido_ASIA_IMPORTACIONES_TermE_Marta_23-09-2026.xlsx');
  assert.equal(nombreArchivo('MIL ILUSIONS S. L', 'MSC', 'Ana García', '2026-01-05'), 'pedido_MIL_ILUSIONS_S_L_TermMSC_Ana_García_05-01-2026.xlsx');
  assert.equal(nombreArchivo('', '', '', '2026-09-23'), 'pedido_SIN_FAMILIA_export_23-09-2026.xlsx');
});

test('nuevaEntradaHistorial guarda una copia de las líneas con fecha/hora/terminal/usuario', () => {
  const g = agruparPorProveedor({ 'TF-ASIA-001': 24, 'TF-ASIA-002': 6 }, ALL)[0];
  const e = nuevaEntradaHistorial(g, 'E', 'Marta', new Date(2026, 8, 23, 9, 5));
  assert.equal(e.fecha, '2026-09-23'); assert.equal(e.hora, '09:05'); assert.equal(e.terminal, 'E'); assert.equal(e.user, 'Marta');
  assert.equal(e.proveedor, 'ASIA IMPORTACIONES'); assert.equal(e.refs, 2); assert.equal(e.uds, 30);
  assert.equal(e.lineas.length, 2); assert.ok(e.id && e.ts);
  e.lineas[0].qty = 999; assert.equal(g.lines[0].qty, 24);   // copia, no referencia
  assert.equal(fmtFecha(e.fecha), '23/09/2026');
});

test('recortaHistorial: los más recientes primero y como mucho el máximo', () => {
  const l = Array.from({ length: 250 }, (_, i) => ({ id: String(i), ts: i }));
  const r = recortaHistorial(l, 200);
  assert.equal(r.length, 200); assert.equal(r[0].ts, 249); assert.equal(r[199].ts, 50);
  assert.deepEqual(recortaHistorial(null), []);
});

test('quitarDelPedido deja el resto intacto y no muta el original', () => {
  const o = { 'A': 1, 'B': 2, 'C': 3 };
  const r = quitarDelPedido(o, ['A', 'C', 'Z']);
  assert.deepEqual(r, { 'B': 2 }); assert.deepEqual(o, { 'A': 1, 'B': 2, 'C': 3 });
});

test('repetirEnPedido SUMA a lo que ya hay, añade lo nuevo y deja fuera lo que ya no está en el catálogo', () => {
  const lineas = [{ ref: 'ROR-001', qty: 12 }, { ref: 'TF-ASIA-001', qty: 24 }, { ref: 'YA-NO-EXISTE', qty: 3 }, { ref: 'CIS-001', qty: 0 }];
  const r = repetirEnPedido({ 'ROR-001': 6, 'CIS-001': 2 }, lineas, ALL);
  assert.deepEqual(r.orders, { 'ROR-001': 18, 'CIS-001': 2, 'TF-ASIA-001': 24 });
  assert.equal(r.sumados, 1); assert.equal(r.anadidos, 1); assert.equal(r.desconocidos, 1);
});
