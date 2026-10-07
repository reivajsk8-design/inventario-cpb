// js/terminales.js — lista ÚNICA de terminales de la app (antes estaba repetida en Pedidos, Albaranes, Resumen y el export).
// D, MSC y E son las terminales de Barcelona; TF es la tienda de Tenerife (añadida el 07-10-2026).
// Módulo puro (sin imports): se prueba en tests/terminales.test.mjs.
export const TERMINALS = ['D', 'MSC', 'E', 'TF'];

export const TERM_COLORS = {
  D:   { bg: '#FF6B00', bgOff: 'rgba(255,107,0,0.12)',   color: '#fff',    colorOff: 'rgba(255,107,0,0.8)'   },
  MSC: { bg: '#FFD60A', bgOff: 'rgba(255,214,10,0.12)',  color: '#1a1a1a', colorOff: 'rgba(255,214,10,0.85)' },
  E:   { bg: '#0A84FF', bgOff: 'rgba(10,132,255,0.12)',  color: '#fff',    colorOff: 'rgba(10,132,255,0.8)'  },
  TF:  { bg: '#30D158', bgOff: 'rgba(48,209,88,0.12)',   color: '#0b2a14', colorOff: 'rgba(48,209,88,0.9)'   },
};

// Terminal por defecto: la guardada si es válida; si no, TF en una PDA de Tenerife y D en Barcelona.
export function defaultTerminal(tienda, saved) {
  if (saved && TERMINALS.includes(saved)) return saved;
  return tienda === 'tf' ? 'TF' : 'D';
}
