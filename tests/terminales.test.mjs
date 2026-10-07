import test from 'node:test';
import assert from 'node:assert/strict';
import { TERMINALS, TERM_COLORS, defaultTerminal } from '../js/terminales.js';

test('TERMINALS incluye TF (Tenerife) y cada terminal tiene sus 4 colores', () => {
  assert.deepEqual(TERMINALS, ['D', 'MSC', 'E', 'TF']);
  for (const t of TERMINALS) for (const k of ['bg', 'bgOff', 'color', 'colorOff']) assert.ok(TERM_COLORS[t] && TERM_COLORS[t][k], t + '.' + k);
});

test('defaultTerminal: la guardada si vale; si no, TF en Tenerife y D en Barcelona', () => {
  assert.equal(defaultTerminal('tf', null), 'TF');
  assert.equal(defaultTerminal('bcn', null), 'D');
  assert.equal(defaultTerminal(null, ''), 'D', 'sin tienda elegida → Barcelona');
  assert.equal(defaultTerminal('tf', 'E'), 'E', 'lo guardado manda');
  assert.equal(defaultTerminal('bcn', 'TF'), 'TF', 'desde Barcelona también se puede trabajar con TF');
  assert.equal(defaultTerminal('bcn', 'X'), 'D', 'un valor raro guardado no vale');
});
