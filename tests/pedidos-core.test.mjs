// node --test tests/pedidos-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorProveedor, filasExcel, nombreArchivo, nuevaEntradaHistorial, recortaHistorial, quitarDelPedido, repetirEnPedido, fmtFecha, SIN_FAMILIA,
         pedidoUnico, codigoProveedor, filasExcelTF } from '../js/pedidos-core.js';

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

// ── Pedido ÚNICO de Tenerife (18-11-2026): todo el pedido para UN proveedor elegido por la encargada ─────────────────────
// equivs = equivs.json del sync: { ref: { CLAVE_PROVEEDOR: 'código' } } (clave = normProv del Matcher, con alias aplicados).
const EQ = { 'REF-7UP-33': { 'V B DISTRIBUCIONES': '4026', 'AHEMBO': '2285' }, 'FRR-007': { 'ALFRAN ARCHIPIELAGO COMERCIAL ALFRAN': '61440' } };
const ALL_TF = [
  { ref: 'REF-7UP-33', proxium: '', ean: '87177756', name: 'refresco - 7UP - 24/33/0 (TF)', family: 'V&B DISTRIBUCIONES', cost: 0.65, cost_tf: null },
  { ref: 'REF-7UPFREE-33', proxium: '22851', ean: '87177749', name: '7UP FREE', family: 'AHEMBO, S.L.', cost: 0.63, cost_tf: 0.63 },
  { ref: 'COS-011', proxium: '040567', ean: '5449000000996', name: 'COCA COLA NACIONAL LATA 33CL', family: 'COSERAL', cost: 0.7129, cost_tf: 0.68 },
  { ref: 'FRR-007', proxium: '700007', ean: '8', name: 'MENTOS STICK MENTA', family: 'FRIT RAVICH', cost: 0.5, cost_tf: null },
];

test('codigoProveedor: equivalencia del proveedor elegido; si no, la ref propia cuando el artículo es de ese proveedor; si no, vacío', () => {
  assert.equal(codigoProveedor(ALL_TF[0], 'V&B DISTRIBUCIONES', EQ), '4026');
  assert.equal(codigoProveedor(ALL_TF[0], 'AHEMBO', EQ), '2285', 'la misma lata la venden dos proveedores');
  assert.equal(codigoProveedor(ALL_TF[1], 'AHEMBO', EQ), '22851', 'familia «AHEMBO, S.L.» = AHEMBO → su propia ref');
  assert.equal(codigoProveedor(ALL_TF[1], 'V&B DISTRIBUCIONES', EQ), '', 'V&B no lo vende: celda vacía');
  assert.equal(codigoProveedor(ALL_TF[3], 'ALFRAN', EQ), '61440', 'alias ALFRAN → ALFRAN ARCHIPIELAGO y la clave larga empieza por ella');
  assert.equal(codigoProveedor(ALL_TF[3], 'FRIT RAVICH', EQ), '700007');
  assert.equal(codigoProveedor(ALL_TF[2], 'COSERAL', {}), '040567');
  assert.equal(codigoProveedor(ALL_TF[2], 'COSERAL', undefined), '040567', 'sin equivs.json no rompe');
  assert.equal(codigoProveedor(ALL_TF[2], '', EQ), '');
});

test('pedidoUnico: un solo grupo con todo el pedido, coste de Tenerife si lo hay, código del proveedor por línea y cuántas lo tienen', () => {
  const g = pedidoUnico({ 'REF-7UP-33': 24, 'COS-011': 48, 'ZZZ': 3, 'FRR-007': 0 }, ALL_TF, 'V&B DISTRIBUCIONES', EQ);
  assert.equal(g.proveedor, 'V&B DISTRIBUCIONES'); assert.equal(g.family, 'V&B DISTRIBUCIONES');
  assert.equal(g.refs, 2); assert.equal(g.uds, 72); assert.equal(g.conCodigo, 1);
  assert.deepEqual(g.lines.map((l) => [l.ref, l.qty, l.codProv, l.cost]), [['COS-011', 48, '', 0.68], ['REF-7UP-33', 24, '4026', 0.65]]);
  assert.equal(g.lines[0].family, 'COSERAL');
  assert.equal(pedidoUnico({}, ALL_TF, 'V&B DISTRIBUCIONES', EQ).lines.length, 0);
  assert.equal(pedidoUnico(null, null, '', null).refs, 0);
});

test('filasExcelTF: columnas del Excel de Tenerife (código Proxium, proveedor del pedido y su código, familia de Barcelona, coste)', () => {
  const g = pedidoUnico({ 'REF-7UP-33': 24, 'COS-011': 48 }, ALL_TF, 'V&B DISTRIBUCIONES', EQ);
  const rows = filasExcelTF(g.lines, 'Marta', 'TF', 'V&B DISTRIBUCIONES');
  assert.deepEqual(rows[0], ['Usuario', 'Terminal', 'Código Proxium', 'Nombre', 'EAN', 'Proveedor del pedido', 'Código del proveedor', 'Familia (Barcelona)', 'Cantidad pedida', 'Coste']);
  assert.deepEqual(rows[1], ['Marta', 'TF', 'COS-011', 'COCA COLA NACIONAL LATA 33CL', '5449000000996', 'V&B DISTRIBUCIONES', '', 'COSERAL', 48, 0.68]);
  assert.deepEqual(rows[2], ['Marta', 'TF', 'REF-7UP-33', 'refresco - 7UP - 24/33/0 (TF)', '87177756', 'V&B DISTRIBUCIONES', '4026', 'V&B DISTRIBUCIONES', 24, 0.65]);
  assert.equal(nombreArchivo(g.proveedor, 'TF', 'Marta', '2026-11-18'), 'pedido_V&B_DISTRIBUCIONES_TermTF_Marta_18-11-2026.xlsx');
});

test('nuevaEntradaHistorial con un pedido único: el proveedor elegido y las líneas con su código', () => {
  const g = pedidoUnico({ 'REF-7UP-33': 24 }, ALL_TF, 'V&B DISTRIBUCIONES', EQ);
  const e = nuevaEntradaHistorial(g, 'TF', 'Marta', new Date(2026, 10, 18, 10, 0));
  assert.equal(e.proveedor, 'V&B DISTRIBUCIONES'); assert.equal(e.terminal, 'TF'); assert.equal(e.lineas[0].codProv, '4026');
});
