// js/tabaco-historico.js — (Task 6 lo completa)
import { toast } from './ui.js';

export function abrirStock(ctx) { ctx.toast('Pendiente'); }
export function abrirDescuadres(ctx) { ctx.toast('Pendiente'); }
export function abrirHistorico(ctx) { ctx.toast('Pendiente'); }
export function abrirAjustes(ctx) { ctx.toast('Pendiente'); }

// Compartir texto por el menú del móvil (WhatsApp, correo…). Si el móvil no tiene
// «compartir», lo copia al portapapeles. Lo usan el vale de salida/entrada/recepción
// y (Task 6) el histórico.
export async function compartirTexto(texto, titulo) {
  try { if (navigator.share) { await navigator.share({ title: titulo, text: texto }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(texto); toast('Copiado al portapapeles', 'green'); } catch { toast('No se pudo compartir en este dispositivo', 'red'); }
}
