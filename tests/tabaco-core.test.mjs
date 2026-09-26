// node --test tests/tabaco-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esTabaco, nuevoEstado, canonical, hashPin, nuevoSalt, crearMovimiento, verificarCadena, calcularStock, diferenciasInventario, descuadres, valesPendientes, siguienteVale, parseFilasStock, filasExcelHistorico, filasExcelRegularizacion, resumenDia, nombreArchivo, infoRefs, pinValido } from '../js/tabaco-core.js';

const ANA = { id: 'p_ana', nombre: 'Ana' }, LUIS = { id: 'p_luis', nombre: 'Luis' };
const L = (ref, qty, name = ref, ean = '') => ({ ref, qty, name, ean });
async function estadoCon(...datos) {
  const e = nuevoEstado('E', { salt: 'x', hash: 'y' });
  for (const d of datos) { const m = await crearMovimiento(e, d); e.movs.push(m); e.seq = m.seq; e.lastHash = m.hash; }
  e.stock = calcularStock(e.movs);
  return e;
}

test('esTabaco: canario, CISA con nombre de tabaco; no vino CISA ni otras familias', () => {
  assert.equal(esTabaco({ family: 'TABACO CANARIO', name: 'CAMEL BLUE 200 CARTON' }), true);
  assert.equal(esTabaco({ family: 'CISA', name: 'CARTON MARLBORO GOLD 3.0' }), true);
  assert.equal(esTabaco({ family: 'CISA', name: 'PICADURA RYO MARLBORO-GOLD 5/45 GR' }), true);
  assert.equal(esTabaco({ family: 'CISA', name: 'BOLSA AMBER LEAF 10 X 30' }), true);
  assert.equal(esTabaco({ family: 'CISA', name: 'CODORNIU BENJAMIN' }), false);
  assert.equal(esTabaco({ family: 'ROBIN RUTH', name: 'CARTON REGALO' }), false);
  assert.equal(esTabaco(null), false);
});

test('pinValido: 4 a 6 dígitos', () => {
  assert.equal(pinValido('1234'), true); assert.equal(pinValido('123456'), true);
  assert.equal(pinValido('123'), false); assert.equal(pinValido('12a4'), false); assert.equal(pinValido('1234567'), false);
});

test('hashPin es determinista y cambia con el salt', async () => {
  assert.equal(await hashPin('1234', 'abc'), await hashPin('1234', 'abc'));
  assert.notEqual(await hashPin('1234', 'abc'), await hashPin('1234', 'abd'));
  assert.notEqual(nuevoSalt(), nuevoSalt()); assert.match(nuevoSalt(), /^[0-9a-f]{16}$/);
});

test('canonical ordena claves anidadas', () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: [ { z: 1, y: 2 } ] } }), '{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}');
});

test('cadena: tres movimientos verifican; cambiar una cantidad la rompe en ese eslabón', async () => {
  const e = await estadoCon(
    { tipo: 'inventario', persona: ANA, lineas: [L('MARG40', 10), L('CAMY40', 5)], extra: { completo: true, origen: 'app', diferencias: [] } },
    { tipo: 'salida', persona: LUIS, lineas: [L('MARG40', 3)], extra: { vale: 'V-0001', destino: 'tienda' } },
    { tipo: 'entrada', persona: ANA, lineas: [L('CAMY40', 2)], extra: { motivo: 'Llegada CISA' } });
  assert.deepEqual(await verificarCadena(e.movs), { ok: true, rotoEn: null, ultimo: e.lastHash, n: 3 });
  assert.equal(e.movs[0].prevHash, '0'); assert.equal(e.movs[1].prevHash, e.movs[0].hash); assert.equal(e.movs[2].seq, 3);
  const copia = JSON.parse(JSON.stringify(e.movs)); copia[1].lineas[0].qty = 1;
  const v = await verificarCadena(copia);
  assert.equal(v.ok, false); assert.equal(v.rotoEn, 2);
  const sinUno = [e.movs[0], e.movs[2]];
  assert.equal((await verificarCadena(sinUno)).rotoEn, 3);
});

test('calcularStock: inventario completo sustituye, parcial solo toca lo contado, salida resta, entrada suma, anulación deshace', async () => {
  const e = await estadoCon(
    { tipo: 'inventario', persona: ANA, lineas: [L('A', 10), L('B', 5)], extra: { completo: true, diferencias: [] } },
    { tipo: 'salida', persona: LUIS, lineas: [L('A', 3)], extra: { vale: 'V-0001' } },
    { tipo: 'entrada', persona: ANA, lineas: [L('C', 4)], extra: { motivo: 'Otro' } });
  assert.deepEqual(e.stock, { A: 7, B: 5, C: 4 });
  // la anulación referencia por id: como los ids se regeneran, comprobamos con la lista original
  const movs = [...e.movs, await crearMovimiento(e, { tipo: 'anulacion', persona: ANA, lineas: [], extra: { anulaId: e.movs[1].id, anulaSeq: 2, motivo: 'error' } })];
  assert.deepEqual(calcularStock(movs), { A: 10, B: 5, C: 4 });
  const parcial = [...movs, await crearMovimiento({ ...e, seq: 4, lastHash: movs[3].hash }, { tipo: 'inventario', persona: ANA, lineas: [L('A', 8)], extra: { completo: false, ceros: ['C'], diferencias: [] } })];
  assert.deepEqual(calcularStock(parcial), { A: 8, B: 5 });
  const completo = [...movs, await crearMovimiento({ ...e, seq: 4, lastHash: movs[3].hash }, { tipo: 'inventario', persona: ANA, lineas: [L('A', 8)], extra: { completo: true, diferencias: [] } })];
  assert.deepEqual(calcularStock(completo), { A: 8 });
});

test('diferenciasInventario: completo incluye lo no contado a 0; parcial solo lo contado', () => {
  const stock = { A: 10, B: 5 }, info = { A: { name: 'Art A', ean: '1' } };
  assert.deepEqual(diferenciasInventario(stock, { A: 8, C: 2 }, true, info), [
    { ref: 'A', name: 'Art A', ean: '1', teorico: 10, contado: 8, dif: -2 },
    { ref: 'B', name: '', ean: '', teorico: 5, contado: 0, dif: -5 },
    { ref: 'C', name: '', ean: '', teorico: 0, contado: 2, dif: 2 }]);
  assert.deepEqual(diferenciasInventario(stock, { A: 10 }, false, info), [{ ref: 'A', name: 'Art A', ean: '1', teorico: 10, contado: 10, dif: 0 }]);
});

test('descuadres: salen de inventarios y recepciones con dif ≠ 0 y se marcan regularizados', async () => {
  const e = await estadoCon(
    { tipo: 'inventario', persona: ANA, lineas: [L('A', 8)], extra: { completo: true, diferencias: [{ ref: 'A', name: 'Art A', ean: '', teorico: 10, contado: 8, dif: -2 }, { ref: 'B', name: 'B', ean: '', teorico: 5, contado: 5, dif: 0 }] } },
    { tipo: 'salida', persona: LUIS, lineas: [L('A', 4)], extra: { vale: 'V-0001' } });
  const rec = await crearMovimiento(e, { tipo: 'recepcion', persona: ANA, lineas: [L('A', 3)], extra: { valeId: e.movs[1].id, vale: 'V-0001', mismaPersona: false, diferencias: [{ ref: 'A', name: 'Art A', ean: '', enviado: 4, recibido: 3, dif: -1 }] } });
  let d = descuadres([...e.movs, rec]);
  assert.equal(d.length, 2);
  assert.deepEqual(d.map(x => [x.tipo, x.dif, x.estado]), [['inventario', -2, 'pendiente'], ['transito', -1, 'pendiente']]);
  const reg = await crearMovimiento({ ...e, seq: 3, lastHash: rec.hash }, { tipo: 'regularizacion', persona: ANA, lineas: [], extra: { descuadreIds: [d[0].id], barco: 'ARVIA', nota: '' } });
  d = descuadres([...e.movs, rec, reg]);
  assert.equal(d[0].estado, 'regularizado'); assert.equal(d[0].barco, 'ARVIA'); assert.equal(d[1].estado, 'pendiente');
});

test('valesPendientes y siguienteVale', async () => {
  const e = await estadoCon(
    { tipo: 'inventario', persona: ANA, lineas: [L('A', 10)], extra: { completo: true, diferencias: [] } },
    { tipo: 'salida', persona: LUIS, lineas: [L('A', 1)], extra: { vale: 'V-0001' }, ts: '2026-09-25T06:00:00.000Z' },
    { tipo: 'salida', persona: LUIS, lineas: [L('A', 1)], extra: { vale: 'V-0002' }, ts: '2026-09-25T09:30:00.000Z' });
  const rec = await crearMovimiento(e, { tipo: 'recepcion', persona: ANA, lineas: [L('A', 1)], extra: { valeId: e.movs[1].id, vale: 'V-0001', diferencias: [] } });
  const p = valesPendientes([...e.movs, rec], Date.parse('2026-09-25T10:00:00.000Z'), 2);
  assert.deepEqual(p.map(v => [v.extra.vale, v.tarde]), [['V-0002', false]]);
  assert.equal(valesPendientes([...e.movs, rec], Date.parse('2026-09-25T12:00:00.000Z'), 2)[0].tarde, true);
  assert.equal(siguienteVale([...e.movs, rec]), 'V-0003');
});

test('parseFilasStock: export de Conteos (REF + Almacén) y Proxium (Artículo + Cantidad)', () => {
  const conteos = [['Usuario', 'Terminal', 'REF', 'Nombre', 'EAN', 'Ref. Proveedor', 'Familia', 'Almacén', 'Tienda', 'Total'],
    ['Olek', 'MSC', 'MARG40', 'CARTON MARLBORO GOLD 3.0', '7622100912392', '100157', 'CISA', '79', '0', '79'],
    ['Olek', 'MSC', 'TERW20', 'CARTON TEREA WARM', '7622100581581', '100578', 'CISA', 0, 3, 3]];
  const a = parseFilasStock(conteos);
  assert.deepEqual(a.lineas, [{ ref: 'MARG40', name: 'CARTON MARLBORO GOLD 3.0', ean: '7622100912392', qty: 79 }]);
  assert.deepEqual(a.ceros, ['TERW20']);
  const proxium = [['Listado: Inventario'], [], ['Artículo', 'Descripción', 'Bultos', 'Cantidad', 'Un. cant.'], ['CAMF20', 'CARTON CAMEL BLUE', '3', '112', 'CT'], ['', '', '', '', '']];
  assert.deepEqual(parseFilasStock(proxium).lineas, [{ ref: 'CAMF20', name: 'CARTON CAMEL BLUE', ean: '', qty: 112 }]);
  assert.throws(() => parseFilasStock([['Hola', 'Mundo'], [1, 2]]), /cabecera/);
});

test('infoRefs recuerda el último nombre y EAN visto por ref', async () => {
  const e = await estadoCon({ tipo: 'inventario', persona: ANA, lineas: [L('A', 1, 'Viejo', '111')], extra: { completo: true, diferencias: [] } },
    { tipo: 'entrada', persona: ANA, lineas: [L('A', 1, 'Nuevo', '222')], extra: { motivo: 'Otro' } });
  assert.deepEqual(infoRefs(e.movs), { A: { name: 'Nuevo', ean: '222' } });
});

test('Excel del histórico: una fila por línea, cabecera fija, marca si el registro está alterado', async () => {
  const e = await estadoCon({ tipo: 'salida', persona: LUIS, lineas: [L('A', 2, 'Art A', '1'), L('B', 1, 'Art B', '2')], extra: { vale: 'V-0001' }, nota: 'precinto 7' });
  const f = filasExcelHistorico(e.movs, { ok: true });
  assert.deepEqual(f[0], ['Fecha', 'Hora', 'Seq', 'Tipo', 'Vale', 'Persona', 'REF', 'Nombre', 'EAN', 'Cantidad', 'Nota', 'Detalle', 'Hash']);
  assert.equal(f.length, 3); assert.equal(f[1][6], 'A'); assert.equal(f[1][4], 'V-0001'); assert.equal(f[1][10], 'precinto 7');
  const g = filasExcelHistorico(e.movs, { ok: false, problemas: ['cadena rota'] });
  assert.match(g[g.length - 1][0], /ALTERADO/);
  assert.deepEqual(filasExcelRegularizacion([{ ref: 'A', name: 'Art A', ean: '1', dif: -2, tipo: 'inventario', ts: '2026-09-25T10:00:00.000Z', persona: 'Ana', vale: '', barco: 'ARVIA' }])[1].slice(0, 4), ['A', 'Art A', '1', -2]);
});

test('resumenDia agrupa salidas por persona y nombreArchivo lleva terminal y fecha', async () => {
  const hoy = new Date().toISOString();
  const e = await estadoCon({ tipo: 'inventario', persona: ANA, lineas: [L('A', 10)], extra: { completo: true, diferencias: [] } },
    { tipo: 'salida', persona: LUIS, lineas: [L('A', 3)], extra: { vale: 'V-0001' } },
    { tipo: 'salida', persona: LUIS, lineas: [L('A', 2)], extra: { vale: 'V-0002' } });
  const t = resumenDia(e.movs, hoy, 'E');
  assert.match(t, /Luis: 2 salidas · 5 uds \(V-0001, V-0002\)/); assert.match(t, /Stock almacén: 5/); assert.match(t, /Vales sin recibir: 2/);
  assert.match(nombreArchivo('historico', 'E', new Date(2026, 8, 25)), /^historico_tabaco_E_25-09-2026\.xlsx$/);
});
