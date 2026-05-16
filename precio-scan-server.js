/**
 * precio-scan-server.js
 * Proxy local para PrecioScan — sin API Key externa
 *
 * Estrategia:
 *   1. Intenta obtener precios directamente de idealo.es (gratis, sin clave)
 *   2. Si falla, usa `claude -p` del CLI de Claude Code (tu suscripción)
 *
 * Requisitos:
 *   - Node.js v18+ (ya instalado si tienes Claude Code)
 *   - Claude Code CLI instalado y autenticado
 *
 * Uso: node precio-scan-server.js
 */

'use strict';
const http  = require('http');
const https = require('https');
const { spawn } = require('child_process');

const PORT = 3001;

/* ─────────────────────────────────────────────
   1. SCRAPING DIRECTO DE IDEALO.ES
   Usa el JSON-LD estructurado que idealo incluye
   en todas sus páginas de producto.
───────────────────────────────────────────── */
async function scrapeIdealo(ean, desc) {
  const url = `https://www.idealo.es/precios/${ean}.html`;
  console.log(`  [idealo] → ${url}`);

  const html = await httpsGet(url);

  // Buscar JSON-LD con datos de oferta (estructura estándar schema.org)
  const jsonLdRx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRx.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      const items = Array.isArray(obj) ? obj : [obj];
      for (const item of items) {
        const offers = item.offers;
        if (!offers) continue;
        const low  = parseFloat(offers.lowPrice  || offers.price || 0);
        const high = parseFloat(offers.highPrice || offers.price || 0);
        if (low > 0) {
          const media = high > low ? +((low + high) / 2).toFixed(2) : low;
          const count = offers.offerCount || '?';
          return {
            min:    low,
            max:    high || low,
            media:  media,
            fuentes: ['idealo.es'],
            nota:   `${count} vendedores en idealo.es`
          };
        }
      }
    } catch {}
  }

  // Segundo intento: buscar por descripción si el EAN no tiene página propia
  const searchUrl = `https://www.idealo.es/buscar.html?q=${encodeURIComponent(ean + ' ' + desc.slice(0, 40))}`;
  console.log(`  [idealo] Sin resultado por EAN → ${searchUrl}`);
  const html2 = await httpsGet(searchUrl);

  // En páginas de búsqueda el primer resultado suele tener el precio más bajo
  const priceRx = /"lowPrice"\s*:\s*"?([0-9]+[.,][0-9]+)"?/;
  const pm = html2.match(priceRx);
  if (pm) {
    const price = parseFloat(pm[1].replace(',', '.'));
    return { min: price, max: price, media: price, fuentes: ['idealo.es'], nota: 'Primer resultado en búsqueda idealo.es' };
  }

  throw new Error('Sin datos de precio en idealo.es');
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const reqOpts = {
      hostname: opts.hostname,
      path:     opts.pathname + opts.search,
      method:   'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cache-Control':   'no-cache'
      }
    };

    const req = https.request(reqOpts, res => {
      // Seguir redirecciones (301/302)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return resolve(httpsGet(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`idealo.es HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end',  ()  => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout idealo.es')); });
    req.end();
  });
}


/* ─────────────────────────────────────────────
   2. FALLBACK: claude -p (CLI de Claude Code)
   Usa tu suscripción de Claude — no necesita
   API Key separada.
───────────────────────────────────────────── */
function askClaude(ean, desc) {
  const prompt =
`Busca el precio actual de este perfume en tiendas online de España (idealo.es, amazon.es, perfumesclub.es, notino.es):

Producto: ${desc}
EAN: ${ean}

Responde ÚNICAMENTE con JSON válido (sin markdown, sin texto extra):
{"min": 00.00, "max": 00.00, "media": 00.00, "fuentes": ["idealo.es"], "nota": "resumen breve"}

Si no encuentras datos reales de precio:
{"error": "No encontrado", "min": null, "max": null, "media": null, "fuentes": [], "nota": ""}`;

  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    // En Windows el ejecutable puede llamarse claude.cmd
    const child = spawn(isWin ? 'claude' : 'claude', ['-p', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin   // shell:true en Windows resuelve .cmd/.bat automáticamente
    });

    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);

    child.on('close', code => {
      if (code === 0) {
        const m = out.match(/\{[\s\S]*\}/);
        if (m) resolve(JSON.parse(m[0]));
        else   reject(new Error('Claude no devolvió JSON: ' + out.slice(0, 200)));
      } else {
        reject(new Error('claude CLI error: ' + (err.trim() || `exit ${code}`)));
      }
    });

    child.on('error', e => reject(new Error(
      'claude CLI no encontrado. ¿Está instalado Claude Code? Error: ' + e.message
    )));

    // Timeout de 60 segundos
    setTimeout(() => { child.kill(); reject(new Error('Timeout esperando claude')); }, 60000);
  });
}


/* ─────────────────────────────────────────────
   SERVIDOR HTTP LOCAL
───────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  // Cabeceras CORS — necesario para llamadas desde el navegador
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: '1.0' }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/buscar') {
    res.writeHead(404); res.end('Not found'); return;
  }

  let body = '';
  req.on('data', d => body += d);
  req.on('end',  async () => {
    let ean = '', desc = '';
    try { ({ ean, desc } = JSON.parse(body)); } catch {
      res.writeHead(400); res.end('Bad JSON'); return;
    }

    console.log(`\n[${new Date().toLocaleTimeString('es-ES')}] Buscando: ${desc} (${ean})`);

    let result;
    try {
      // Intento 1: scraping de idealo.es
      result = await scrapeIdealo(ean, desc);
      console.log(`  ✓ idealo.es: min=€${result.min} max=€${result.max} media=€${result.media}`);
    } catch (e1) {
      console.log(`  ✗ idealo.es: ${e1.message}`);
      console.log('  → Intentando con claude CLI...');
      try {
        result = await askClaude(ean, desc);
        console.log(`  ✓ claude: min=€${result.min} max=€${result.max} media=€${result.media}`);
      } catch (e2) {
        console.log(`  ✗ claude: ${e2.message}`);
        result = {
          error: `Sin resultados. idealo: ${e1.message} | claude: ${e2.message}`,
          min: null, max: null, media: null, fuentes: [], nota: ''
        };
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  PrecioScan Server · v1.0                ║');
  console.log(`║  http://localhost:${PORT}                  ║`);
  console.log('║  Usa idealo.es + Claude Code CLI         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('Deja esta ventana abierta mientras usas PrecioScan.');
  console.log('En PrecioScan → ⚙ Ajustes → activa "Modo proxy local".');
  console.log('');
  console.log('Ctrl+C para parar.');
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n⚠ Puerto ${PORT} ya en uso. ¿Ya tienes el servidor corriendo?`);
    console.error('  Cierra la otra instancia o cambia el PORT en este archivo.\n');
  } else {
    console.error('Error del servidor:', e);
  }
  process.exit(1);
});
