# Gestionar Datos Locales — Design Spec

**Date:** 2026-06-02  
**Status:** Approved

---

## Goal

Sustituir el botón "Borrar todos los conteos y pedidos" de la tab Resumen por un botón "Gestionar datos locales" que abre un sheet con 4 secciones independientes de reset, cada una con confirmación inline. Los artículos nuevos (`ia`) incluyen detección inteligente contra la BD oficial.

---

## Contexto

- **`js/resumen.js` línea 93-96** — botón `btn-reset` actual con `confirm()` nativo del navegador.
- **`js/resumen.js` línea 134-140** — handler actual: elimina `ic` e `io`, llama `render()` y dispara evento `data-reset`.
- **`_rawAll`** — array de productos de IndexedDB, disponible a nivel de módulo. Usarlo para la detección inteligente sin rellamar `getAllProducts()`.
- **`openSheet`, `closeSheet`, `toast`** — ya importados en `resumen.js`.
- **Convención:** estilos inline para contenido dinámico de sheets. No añadir clases nuevas a `components.css`.

---

## Cambios en `render()`

### Reemplazar el botón de reset

Localiza en `render()`:
```js
    <button class="export-btn" id="btn-reset"
      style="background:rgba(255,69,58,0.12);color:var(--red);margin-top:8px">
      🗑 Borrar todos los conteos y pedidos
    </button>
```
Sustitúyelo por:
```js
    <button class="export-btn" id="btn-manage-data"
      style="background:var(--surface2);color:var(--text2);margin-top:8px">
      🗑 Gestionar datos locales
    </button>
```

### Reemplazar el listener de reset

Localiza:
```js
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('¿Borrar todos los conteos y pedidos? Esta acción no se puede deshacer.')) return;
    localStorage.removeItem('ic');
    localStorage.removeItem('io');
    render();
    window.dispatchEvent(new Event('data-reset'));
  });
```
Sustitúyelo por:
```js
  document.getElementById('btn-manage-data').addEventListener('click', openManageSheet);
```

---

## Función `openManageSheet()`

Función nueva en `resumen.js` (fuera de `render()`). Lee el estado actual de localStorage y `_rawAll` para construir el sheet.

### Detección inteligente de `ia`

```js
const iaObj  = JSON.parse(localStorage.getItem('ia') || '{}');
const iaList = Object.values(iaObj);
const dbRefs = new Set(_rawAll.map(p => p.ref));
const confirmed = iaList.filter(p => dbRefs.has(p.ref));   // ✅ ya en BD oficial
const pending   = iaList.filter(p => !dbRefs.has(p.ref));  // ⏳ pendiente
```

### HTML del sheet

```js
function openManageSheet() {
  const counts   = JSON.parse(localStorage.getItem('ic') || '{}');
  const orders   = JSON.parse(localStorage.getItem('io') || '{}');
  const editOvr  = JSON.parse(localStorage.getItem('ie') || '{}');
  const iaObj    = JSON.parse(localStorage.getItem('ia') || '{}');
  const iaList   = Object.values(iaObj);
  const dbRefs   = new Set(_rawAll.map(p => p.ref));
  const confirmed = iaList.filter(p => dbRefs.has(p.ref));
  const pending   = iaList.filter(p => !dbRefs.has(p.ref));

  const countRefs  = Object.keys(counts).filter(r => (counts[r]?.almacen ?? 0) + (counts[r]?.tienda ?? counts[r]?.qty ?? 0) > 0);
  const orderRefs  = Object.keys(orders).filter(r => orders[r] > 0);
  const editCount  = Object.keys(editOvr).length;

  function section(id, label, summary, btnId, btnLabel, disabled = false) {
    return `
      <div id="${id}" style="background:var(--surface2);border-radius:12px;
           padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${disabled ? '0' : '10px'}">
          <div>
            <div style="font-size:0.65rem;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.05em">${label}</div>
            <div style="font-size:0.82rem;color:var(--text2);margin-top:2px">${summary}</div>
          </div>
        </div>
        ${disabled ? '' : `
        <div id="${btnId}-area">
          <button id="${btnId}" style="width:100%;background:rgba(255,69,58,0.1);
            border-radius:10px;padding:10px;color:var(--red);font-size:0.78rem;font-weight:600">
            ${btnLabel}
          </button>
        </div>`}
      </div>`;
  }

  const iaSection = `
    <div id="gd-new" style="background:var(--surface2);border-radius:12px;
         padding:12px 14px;margin-bottom:10px">
      <div style="font-size:0.65rem;font-weight:700;color:var(--text3);
                  text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">
        Artículos nuevos creados
      </div>
      ${iaList.length === 0
        ? `<div style="font-size:0.78rem;color:var(--text3)">Ningún artículo nuevo.</div>`
        : iaList.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:5px 0;border-bottom:1px solid var(--separator)">
            <div>
              <span style="font-size:0.75rem;font-weight:700;color:var(--text)">${p.ref}</span>
              <span style="font-size:0.68rem;color:var(--text3);margin-left:6px">${p.name || ''}</span>
            </div>
            <span style="font-size:0.7rem;font-weight:700;
              color:${dbRefs.has(p.ref) ? 'var(--green)' : 'var(--amber)'}">
              ${dbRefs.has(p.ref) ? '✅ ya en BD' : '⏳ pendiente'}
            </span>
          </div>`).join('')}
      ${confirmed.length > 0 ? `
      <div id="gd-new-confirmed-area" style="margin-top:10px">
        <button id="gd-new-confirmed" style="width:100%;background:rgba(48,209,88,0.1);
          border-radius:10px;padding:10px;color:var(--green);font-size:0.78rem;font-weight:600;margin-bottom:6px">
          ✅ Borrar los ${confirmed.length} confirmados
        </button>
      </div>` : ''}
      ${iaList.length > 0 ? `
      <div id="gd-new-all-area" style="margin-top:${confirmed.length > 0 ? '0' : '10px'}">
        <button id="gd-new-all" style="width:100%;background:rgba(255,69,58,0.1);
          border-radius:10px;padding:10px;color:var(--red);font-size:0.78rem;font-weight:600">
          🗑 Borrar todos (${iaList.length})
        </button>
      </div>` : ''}
    </div>`;

  const html = `
    <div style="font-size:0.9rem;font-weight:700;color:var(--text);margin-bottom:14px">
      🗑 Gestionar datos locales
    </div>
    ${section('gd-counts', 'Conteos', `${countRefs.length} artículos contados`, 'gd-del-counts', '🗑 Borrar conteos', countRefs.length === 0)}
    ${section('gd-orders', 'Pedidos', `${orderRefs.length} artículos en pedido`, 'gd-del-orders', '🗑 Borrar pedidos', orderRefs.length === 0)}
    ${section('gd-edits', 'Ediciones locales', `${editCount} artículos modificados`, 'gd-del-edits', '🗑 Borrar ediciones', editCount === 0)}
    ${iaSection}
  `;

  openSheet(html);
  wireManageSheet(confirmed, iaList);
}
```

---

## Función `wireManageSheet(confirmed, iaList)`

Conecta los listeners de los botones de borrado. Cada botón al pulsarse reemplaza su contenedor `*-area` con la confirmación inline.

### Helper `confirmInline(areaId, onConfirm)`

```js
function confirmInline(areaId, onConfirm) {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="font-size:0.75rem;color:var(--text2);flex:1">¿Seguro?</span>
      <button id="${areaId}-cancel" style="padding:8px 14px;border-radius:8px;
        background:var(--surface);color:var(--text2);font-size:0.75rem;font-weight:600">
        Cancelar
      </button>
      <button id="${areaId}-confirm" style="padding:8px 14px;border-radius:8px;
        background:var(--red);color:#fff;font-size:0.75rem;font-weight:600">
        Sí, borrar →
      </button>
    </div>`;
  document.getElementById(`${areaId}-confirm`).addEventListener('click', onConfirm);
  document.getElementById(`${areaId}-cancel`).addEventListener('click', () => openManageSheet());
}
```

El "Cancelar" vuelve a abrir el sheet desde cero (re-renders el estado actualizado).

### Listeners

```js
function wireManageSheet(confirmed, iaList) {
  document.getElementById('gd-del-counts')?.addEventListener('click', () =>
    confirmInline('gd-del-counts-area', () => {
      localStorage.removeItem('ic');
      window.dispatchEvent(new Event('data-reset'));
      closeSheet(); toast('Conteos borrados', 'green'); mount();
    }));

  document.getElementById('gd-del-orders')?.addEventListener('click', () =>
    confirmInline('gd-del-orders-area', () => {
      localStorage.removeItem('io');
      window.dispatchEvent(new Event('data-reset'));
      closeSheet(); toast('Pedidos borrados', 'green'); mount();
    }));

  document.getElementById('gd-del-edits')?.addEventListener('click', () =>
    confirmInline('gd-del-edits-area', () => {
      localStorage.removeItem('ie');
      closeSheet(); toast('Ediciones borradas', 'green'); mount();
    }));

  document.getElementById('gd-new-confirmed')?.addEventListener('click', () =>
    confirmInline('gd-new-confirmed-area', () => {
      const ia = JSON.parse(localStorage.getItem('ia') || '{}');
      confirmed.forEach(p => delete ia[p.ref]);
      localStorage.setItem('ia', JSON.stringify(ia));
      closeSheet(); toast(`${confirmed.length} artículo(s) confirmado(s) borrados`, 'green'); mount();
    }));

  document.getElementById('gd-new-all')?.addEventListener('click', () =>
    confirmInline('gd-new-all-area', () => {
      localStorage.removeItem('ia');
      closeSheet(); toast('Artículos nuevos borrados', 'green'); mount();
    }));
}
```

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `js/resumen.js` | Reemplazar `btn-reset` por `btn-manage-data`, añadir `openManageSheet()`, `wireManageSheet()`, `confirmInline()` |

---

## Fuera de scope

- Reset de EANs pendientes (`ix`)
- Reset de terminales (`itr`, `itp`)
- Reset de nombre de usuario (`ic_user`)
