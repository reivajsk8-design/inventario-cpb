// js/conteos.js
import { getAllProducts, getFamilies }                       from './db.js';
import { filterProducts, mountFilterBar }                    from './filters.js';
import { openCountSheet, openSheet, closeSheet, toast, esc } from './ui.js';
import { startScanner }                                      from './scanner.js';
import { getStock, saveStock, clearStock, parseStockXLSX }  from './stock.js';
import { matchesEan, openAssignEanSheet }                    from './eans.js';
import { cameraSupported, openCamera, closeCamera, resumeCamera, beepMatch, beepError } from './camera-scanner.js';

const QUICK_QTYS = [1, 5, 10, 20];
const PAGE = 50;
let _all = [], _page = 0, _filterBar = null;
let _query = '', _filterType = 'all', _activeFamilies = [];
let _onCam = null;

function getZona()  { return localStorage.getItem('ic_zona') || 'almacen'; }
function setZona(z) { localStorage.setItem('ic_zona', z); }

function totalQty(c) {
  if (!c) return 0;
  if ('almacen' in c || 'tienda' in c) return (c.almacen || 0) + (c.tienda || 0);
  return c.qty || 0;
}

function getCounts() {
  const raw = JSON.parse(localStorage.getItem('ic') || '{}');
  const needsMigration = Object.values(raw).some(v => v && 'qty' in v && !('almacen' in v));
  if (!needsMigration) return raw;
  const migrated = {};
  for (const [ref, v] of Object.entries(raw)) {
    if (v && 'qty' in v && !('almacen' in v)) {
      migrated[ref] = { almacen: v.qty || 0, tienda: 0, notes: v.notes || '' };
    } else {
      migrated[ref] = v;
    }
  }
  localStorage.setItem('ic', JSON.stringify(migrated));
  return migrated;
}

function saveCounts(c) { localStorage.setItem('ic', JSON.stringify(c)); }

function renderZoneBar(el, onCam) {
  const zona   = getZona();
  const camBtn = cameraSupported()
    ? `<button id="btn-cam-open" class="zona-btn" style="flex:0;min-width:46px;padding:8px 10px;display:flex;align-items:center;justify-content:center" title="Escanear con cámara"><!-- Heroicons v2 MIT: camera -->
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/>
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/>
        </svg>
      </button>`
    : '';
  el.innerHTML = `
    <div class="zona-bar">
      <button class="zona-btn ${zona === 'almacen' ? 'active' : ''}" data-zona="almacen">🏪 Almacén</button>
      <button class="zona-btn ${zona === 'tienda'  ? 'active' : ''}" data-zona="tienda">🏬 Tienda</button>
      ${camBtn}
    </div>`;
  el.querySelectorAll('.zona-btn[data-zona]').forEach(btn => {
    btn.addEventListener('click', () => {
      setZona(btn.dataset.zona);
      renderZoneBar(el, onCam);
    });
  });
  if (onCam) document.getElementById('btn-cam-open')?.addEventListener('click', onCam);
}

export async function mount() {
  const editOvr = JSON.parse(localStorage.getItem('ie') || '{}');
  const raw     = await getAllProducts();
  const newArts = Object.values(JSON.parse(localStorage.getItem('ia') || '{}'));
  _all = [...raw, ...newArts].map(p => editOvr[p.ref] ? { ...p, ...editOvr[p.ref] } : p);

  const families = await getFamilies();
  _filterBar = mountFilterBar(families, ({ query, filterType, families: fams }) => {
    _query = query; _filterType = filterType; _activeFamilies = fams;
    _page = 0;
    renderList();
  });

  const navBtn = document.getElementById('btn-nav-right');
  navBtn.textContent = '📊';
  navBtn.onclick = openStockPanel;

  let zoneBar = document.getElementById('conteos-zone-bar');
  if (!zoneBar) {
    zoneBar = document.createElement('div');
    zoneBar.id = 'conteos-zone-bar';
    document.getElementById('nav').appendChild(zoneBar);
  }

  const onCamScan = ean => {
    const p = _all.find(x => matchesEan(x, ean));
    if (!p) {
      beepError();
      openAssignEanSheet(ean, _all, product => addQty(product, () => resumeCamera()), () => resumeCamera());
      return;
    }
    addQty(p, () => resumeCamera());
  };

  const openCam = () => {
    const zona = getZona();
    document.querySelector('#cam-scanner-overlay .cam-hint').textContent =
      (zona === 'almacen' ? '🏪 Almacén' : '🏬 Tienda') + ' · Enfoca el código de barras';
    openCamera(onCamScan, toast);
  };
  _onCam = openCam;

  document.getElementById('btn-cam-close').addEventListener('click', () => closeCamera());

  renderZoneBar(zoneBar, openCam);
  renderList();

  startScanner(ean => {
    const p = _all.find(x => matchesEan(x, ean));
    if (!p) { beepError(); openAssignEanSheet(ean, _all, product => addQty(product)); return; }
    addQty(p);
  });
}

export function unmount() {
  closeCamera();
  if (_filterBar) _filterBar.hide();
  const navBtn = document.getElementById('btn-nav-right');
  navBtn.textContent = '?';
  navBtn.onclick = navBtn._tutorialHandler || null;
  const zoneBar = document.getElementById('conteos-zone-bar');
  if (zoneBar) zoneBar.remove();
}

function addQty(p, onDone = null) {
  const curCounts = getCounts();
  openCountSheet(p, curCounts, getZona(), QUICK_QTYS, (result) => {
    const all = getCounts();
    const c   = all[p.ref] || { almacen: 0, tienda: 0, notes: '' };

    if (result.type === 'add') {
      c[result.zona] = (c[result.zona] || 0) + result.qty;
      c.ts    = Date.now();
      c.notes = result.notes ?? c.notes;
      setZona(result.zona);
      const zoneBar = document.getElementById('conteos-zone-bar');
      if (zoneBar) renderZoneBar(zoneBar, _onCam);
    } else if (result.type === 'correct') {
      c.almacen = result.almacen;
      c.tienda  = result.tienda;
      c.ts      = Date.now();
      c.notes   = result.notes ?? c.notes;
    } else if (result.type === 'zero') {
      c.almacen = 0;
      c.tienda  = 0;
      c.notes   = '';
    }

    const tot = (c.almacen || 0) + (c.tienda || 0);
    if (tot === 0 && !c.notes) {
      delete all[p.ref];
    } else {
      all[p.ref] = c;
    }
    saveCounts(all);

    const sysQty = getStock()[p.ref];
    const cuadra = sysQty !== undefined && tot === sysQty && tot > 0;

    if (result.type === 'add') {
      if (cuadra) beepMatch();
      toast(cuadra ? `✓ ${p.name} — cuadra con sistema (${tot} uds)` : `${p.name} — ${tot} ud. total`, cuadra ? 'green' : 'green');
    } else if (result.type === 'correct') {
      if (cuadra) beepMatch();
      toast(cuadra ? `✓ Conteo corregido — cuadra con sistema (${tot} uds)` : 'Conteo corregido', 'green');
    } else {
      toast(`${p.name} — puesto a 0`, 'amber');
    }
    renderList();
    if (onDone) onDone();
  }, (newZona) => {
    setZona(newZona);
    const zoneBar = document.getElementById('conteos-zone-bar');
    if (zoneBar) renderZoneBar(zoneBar, _onCam);
  }, (notes) => {
    const all = getCounts();
    const c   = all[p.ref];
    if (c && notes !== (c.notes || '')) {
      c.notes = notes;
      all[p.ref] = c;
      saveCounts(all);
      renderList();
    }
    if (onDone) onDone();
  }, curCounts[p.ref]?.notes || '');
}

function renderList() {
  const main        = document.getElementById('main');
  const counts      = getCounts();
  const stock       = getStock();
  const stockLoaded = Object.keys(stock).length > 0;
  const hasFilter   = _query.trim() || _activeFamilies.length > 0;

  const contados = _all.filter(p => totalQty(counts[p.ref]) > 0);
  const items = hasFilter
    ? filterProducts(contados, _query, _filterType, _activeFamilies)
    : [...contados].sort((a, b) => {
        if (stockLoaded) {
          const priA = stockPriority(a.ref, counts, stock);
          const priB = stockPriority(b.ref, counts, stock);
          if (priA !== priB) return priA - priB;
        }
        const tsA = counts[a.ref]?.ts || 0;
        const tsB = counts[b.ref]?.ts || 0;
        return tsB - tsA;
      });

  const page          = items.slice(0, (_page + 1) * PAGE);
  const more          = items.length > page.length;
  const totalContados = Object.keys(counts).filter(r => totalQty(counts[r]) > 0).length;

  // Sin conteos y sin stock → empty state inmediato
  if (items.length === 0 && !stockLoaded) {
    main.innerHTML = !hasFilter
      ? `<div class="empty-state">
           <div class="icon">🔢</div>
           <p style="font-weight:700;color:var(--text)">Sin conteos todavía</p>
           <p style="color:var(--text3);font-size:0.82rem">Escanea o toca un artículo<br>en <strong>Lista</strong> para empezar.</p>
         </div>`
      : `<div class="empty-state"><div class="icon">🔍</div><p>Sin resultados en el conteo</p></div>`;
    return;
  }

  let stockBannerHTML = '';
  let sinContarHTML   = '';
  if (stockLoaded) {
    let cuadrados = 0, diffs = 0, pending = 0;
    const sinContarItems = [];
    Object.entries(stock).forEach(([ref, sysQty]) => {
      const tot = totalQty(counts[ref]);
      if (!tot) {
        pending++;
        const prod = _all.find(x => x.ref === ref);
        sinContarItems.push({ ref, sysQty, name: prod?.name || ref, family: prod?.family || '' });
      } else if (tot === sysQty) {
        cuadrados++;
      } else {
        diffs++;
      }
    });
    stockBannerHTML = `
      <div class="stock-banner">
        <span class="stock-banner-item match">✓ ${cuadrados} cuadrados</span>
        <span class="stock-banner-sep">·</span>
        <span class="stock-banner-item diff">⚠ ${diffs} diferencias</span>
        <span class="stock-banner-sep">·</span>
        <span class="stock-banner-item pend">◯ ${pending} sin contar</span>
      </div>`;
    if (sinContarItems.length > 0 && !hasFilter) {
      const shown = sinContarItems.slice(0, 20);
      sinContarHTML = `
        <div style="padding:12px 12px 4px;font-size:0.65rem;color:var(--text3)">
          ◯ Sin contar del sistema (${sinContarItems.length})
        </div>
        <div class="prod-list" style="margin-bottom:12px">
          ${shown.map(item => `
            <div class="prod-item sin-contar-item" data-ref="${esc(item.ref)}" style="opacity:0.7">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px">
                  <span class="prod-tag tag-ref">${esc(item.ref)}</span>
                  <div class="prod-name" style="flex:1;min-width:80px">${esc(item.name)}</div>
                </div>
                ${item.family ? `<div><span class="prod-tag tag-family">${esc(item.family)}</span></div>` : ''}
              </div>
              <div class="stock-cmp stock-pending">${item.sysQty}<small>en sistema</small></div>
            </div>`).join('')}
          ${sinContarItems.length > 20
            ? `<div style="padding:10px 14px;font-size:0.68rem;color:var(--text3);text-align:center">
                 + ${sinContarItems.length - 20} artículos más sin contar
               </div>`
            : ''}
        </div>`;
    }
  }

  // Sin conteos pero sí hay stock → mostrar solo info de stock
  if (items.length === 0) {
    main.innerHTML = `
      <div style="padding:10px 12px 4px;font-size:0.65rem;color:var(--text3)">
        📡 Escanea con la pistola o toca un artículo · <strong style="color:var(--green)">${totalContados} contados</strong>
      </div>
      ${stockBannerHTML}
      ${sinContarHTML}`;
    main.querySelectorAll('.sin-contar-item[data-ref]').forEach(el => {
      el.addEventListener('click', () => {
        const p = _all.find(x => x.ref === el.dataset.ref);
        if (p) addQty(p);
      });
    });
    return;
  }

  main.innerHTML = `
    <div style="padding:10px 12px 4px;font-size:0.65rem;color:var(--text3)">
      📡 Escanea con la pistola o toca un artículo · <strong style="color:var(--green)">${totalContados} contados</strong>
    </div>
    ${stockBannerHTML}
    <div class="prod-list">
      ${page.map(p => {
        const c       = counts[p.ref];
        const noteText = c?.notes
          ? (c.notes.length > 60 ? c.notes.slice(0, 60) + '…' : c.notes)
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          : '';
        const tot     = totalQty(c);
        const counted = tot > 0;
        const alm     = c?.almacen ?? 0;
        const tie     = c?.tienda  ?? 0;
        const sysQty  = stock[p.ref];

        let badge;
        if (!stockLoaded || sysQty === undefined) {
          if (!counted) {
            badge = `<div style="font-size:1rem;color:var(--text3);flex-shrink:0;padding-right:2px">+</div>`;
          } else {
            const label = (alm > 0 && tie > 0) ? 'A+T' : (alm > 0 ? 'Alm.' : 'Tie.');
            badge = `<div class="prod-qty-badge" style="color:var(--green)">${tot}<small>${label}</small></div>`;
          }
        } else if (!counted) {
          badge = `<div class="stock-cmp stock-pending">${sysQty}<small>en sistema</small></div>`;
        } else if (tot === sysQty) {
          badge = `<div class="stock-cmp stock-match">${tot}<small>✓ cuadra</small></div>`;
        } else {
          const diff = tot - sysQty;
          const sign = diff > 0 ? '+' : '';
          badge = `<div class="stock-cmp stock-diff">${tot}<small>${sign}${diff} vs ${sysQty} sis.</small></div>`;
        }

        const rowStyle = (stockLoaded && sysQty !== undefined && counted && tot !== sysQty)
          ? 'border-left:3px solid var(--amber);'
          : '';

        return `<div class="prod-item" data-ref="${esc(p.ref)}" style="${rowStyle}">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px">
              <span class="prod-tag ${counted ? 'tag-counted' : 'tag-ref'}">${esc(p.ref)}</span>
              ${p.proxium ? `<span class="prod-tag tag-proxium">${esc(p.proxium)}</span>` : ''}
              <div class="prod-name" style="flex:1;min-width:80px">${esc(p.name)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${p.family ? `<span class="prod-tag tag-family">${esc(p.family)}</span>` : ''}
              ${p.ean ? `<span style="font-size:0.6rem;color:var(--text3)">▪ ${esc(p.ean)}</span>` : ''}
            </div>
            ${noteText ? `<div style="font-size:0.7rem;color:var(--amber);font-style:italic;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px">📝 ${esc(noteText)}</div>` : ''}
          </div>
          ${badge}
        </div>`;
      }).join('')}
      ${more ? `<button id="btn-more" style="display:block;width:100%;padding:14px;color:var(--accent);font-size:0.82rem;font-weight:700;text-align:center">Ver más (${items.length - page.length})</button>` : ''}
    </div>
    ${sinContarHTML}`;

  main.querySelectorAll('.prod-item[data-ref], .sin-contar-item[data-ref]').forEach(el => {
    el.addEventListener('click', () => {
      const p = _all.find(x => x.ref === el.dataset.ref);
      if (p) addQty(p);
    });
  });

  document.getElementById('btn-more')?.addEventListener('click', () => { _page++; renderList(); });
}

function stockPriority(ref, counts, stock) {
  const sysQty  = stock[ref];
  const c       = counts[ref];
  const tot     = totalQty(c);
  const counted = tot > 0;
  if (sysQty !== undefined && counted && tot !== sysQty) return 0;
  if (sysQty !== undefined && !counted)                  return 1;
  if (sysQty !== undefined && counted && tot === sysQty) return 2;
  if (sysQty === undefined && counted)                   return 3;
  return 4;
}

function openStockPanel() {
  const stock      = getStock();
  const stockCount = Object.keys(stock).length;

  if (stockCount === 0) {
    openSheet(`
      <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:6px">Cargar stock del sistema</div>
      <div style="font-size:0.7rem;color:var(--text3);margin-bottom:20px">
        Selecciona el Excel exportado de PROXIUM.<br>
        Se usarán las columnas <strong style="color:var(--text2)">Artículo</strong>
        y <strong style="color:var(--text2)">Cantidad</strong>.
      </div>
      <label for="stock-file-input" id="stock-file-label" style="
        display:block;border:1.5px dashed var(--text3);border-radius:var(--radius-md);
        padding:24px 16px;text-align:center;cursor:pointer;margin-bottom:8px
      ">
        <div style="font-size:1.6rem;margin-bottom:8px">📂</div>
        <div style="font-size:0.82rem;color:var(--text3)">Toca para elegir archivo</div>
        <div style="font-size:0.68rem;color:var(--text3);margin-top:4px">.xlsx · .xls</div>
      </label>
      <input type="file" id="stock-file-input" accept=".xlsx,.xls" style="display:none">
      <div id="stock-file-name" style="font-size:0.75rem;color:var(--accent);text-align:center;margin-bottom:16px;min-height:16px"></div>
      <button id="btn-load-stock" class="add-btn" style="opacity:0.4" disabled>
        Cargar stock →
      </button>
    `);

    let _file = null;

    document.getElementById('stock-file-input').addEventListener('change', e => {
      _file = e.target.files[0];
      if (!_file) return;
      document.getElementById('stock-file-name').textContent = _file.name;
      document.getElementById('stock-file-label').style.borderColor = 'var(--accent)';
      const btn = document.getElementById('btn-load-stock');
      btn.disabled = false;
      btn.style.opacity = '1';
    });

    document.getElementById('btn-load-stock').addEventListener('click', async () => {
      if (!_file) return;
      const btn = document.getElementById('btn-load-stock');
      btn.textContent = 'Procesando…';
      btn.disabled = true;
      try {
        const data  = await parseStockXLSX(_file);
        const count = Object.keys(data).length;
        if (count === 0) { toast('No se encontraron artículos', 'red'); return; }
        saveStock(data);
        closeSheet();
        toast(`Stock cargado · ${count} artículos`, 'green');
        renderList();
      } catch (err) {
        console.error(err);
        toast('Error al leer el archivo', 'red');
        btn.textContent = 'Cargar stock →';
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });

  } else {
    const counts = getCounts();
    let cuadrados = 0, diffs = 0, pending = 0;
    Object.entries(stock).forEach(([ref, sysQty]) => {
      const tot = totalQty(counts[ref]);
      if (!tot)                pending++;
      else if (tot === sysQty) cuadrados++;
      else                     diffs++;
    });

    openSheet(`
      <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:4px">Stock del sistema</div>
      <div style="font-size:0.7rem;color:var(--text3);margin-bottom:20px">${stockCount} artículos cargados</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
        <div style="background:rgba(48,209,88,0.1);border-radius:12px;padding:14px 8px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--green)">${cuadrados}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:4px;line-height:1.3">Cuadrados</div>
        </div>
        <div style="background:rgba(255,159,10,0.1);border-radius:12px;padding:14px 8px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--amber)">${diffs}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:4px;line-height:1.3">Diferencias</div>
        </div>
        <div style="background:var(--surface2);border-radius:12px;padding:14px 8px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--text3)">${pending}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:4px;line-height:1.3">Sin contar</div>
        </div>
      </div>
      <button id="btn-export-comp" class="add-btn" style="margin-bottom:10px">
        ⬇ Exportar comparativa (Excel)
      </button>
      <button id="btn-clear-stock" style="
        display:block;width:100%;padding:14px;border-radius:var(--radius-md);
        background:rgba(255,69,58,0.1);color:var(--red);
        font-size:0.82rem;font-weight:700;text-align:center
      ">Eliminar stock cargado</button>
    `);

    document.getElementById('btn-export-comp').addEventListener('click', () => {
      exportComparativa(stock, counts);
    });

    document.getElementById('btn-clear-stock').addEventListener('click', () => {
      clearStock();
      closeSheet();
      toast('Stock eliminado', 'amber');
      renderList();
    });
  }
}

function exportComparativa(stock, counts) {
  // Construye las filas ordenadas: diferencias primero (por magnitud), luego cuadrados, luego sin contar
  const rows = [];

  // Separar en grupos
  const diferencias = [], cuadrados = [], sinContar = [];

  Object.entries(stock).forEach(([ref, sysQty]) => {
    const prod    = _all.find(x => x.ref === ref) || {};
    const contado = totalQty(counts[ref]) || null;

    if (contado === null) {
      sinContar.push({ ref, sysQty, contado: null, diff: null, prod });
    } else if (contado === sysQty) {
      cuadrados.push({ ref, sysQty, contado, diff: 0, prod });
    } else {
      diferencias.push({ ref, sysQty, contado, diff: contado - sysQty, prod });
    }
  });

  // Diferencias ordenadas por magnitud absoluta descendente
  diferencias.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const toRow = ({ ref, sysQty, contado, diff, prod }) => {
    let estado;
    if (contado === null)  estado = 'Sin contar';
    else if (diff === 0)   estado = 'Cuadra';
    else if (diff > 0)     estado = `Exceso +${diff}`;
    else                   estado = `Falta ${diff}`;

    return [
      ref,
      prod.name    || '',
      prod.ean     || '',
      prod.family  || '',
      sysQty,
      contado ?? '',
      contado !== null ? diff : '',
      estado,
      counts[ref]?.notes || '',
    ];
  };

  rows.push(['REF', 'Nombre', 'EAN', 'Familia', 'Stock sistema', 'Contado', 'Diferencia', 'Estado', 'Notas']);
  diferencias.forEach(r => rows.push(toRow(r)));
  cuadrados.forEach(r   => rows.push(toRow(r)));
  sinContar.forEach(r   => rows.push(toRow(r)));

  const doExport = () => {
    const wb  = XLSX.utils.book_new();
    const ws  = XLSX.utils.aoa_to_sheet(rows);

    // Ancho de columnas
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 30 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Comparativa');

    const user     = (localStorage.getItem('ic_user') || 'export').replace(/\s+/g, '_');
    const terminal = localStorage.getItem('itc') || '';
    const date     = new Date();
    const dd       = String(date.getDate()).padStart(2, '0');
    const mm       = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy     = date.getFullYear();
    const parts    = ['comparativa_stock', terminal, user, `${dd}-${mm}-${yyyy}`].filter(Boolean);

    XLSX.writeFile(wb, `${parts.join('_')}.xlsx`);
    toast('Excel exportado', 'green');
  };

  if (window.XLSX) {
    doExport();
  } else {
    const s   = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = doExport;
    s.onerror = () => toast('Error al cargar XLSX', 'red');
    document.head.appendChild(s);
  }
}
