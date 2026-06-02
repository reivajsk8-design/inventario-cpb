# Notas en Conteos — Design Spec

**Date:** 2026-06-02  
**Status:** Approved

---

## Goal

Añadir UI para el campo `notes` que ya existe en los datos de conteo (`ic` localStorage). El usuario puede escribir una nota libre por artículo durante el inventario (ej: "caja dañada", "encontrado en almacén 2"). La nota aparece en la lista de Conteos y se exporta al Excel comparativo.

---

## Contexto

El campo `notes` ya está almacenado en `ic` con formato `{ ref: { almacen, tienda, notes, ts } }`. Ningún módulo lo usa hoy. Solo falta la UI.

`openCountSheet` en `ui.js` es el panel compartido de conteo. Lo usan `conteos.js` (tab Conteos) y eventualmente otros módulos. `lista.js` usa `openSheet` directamente, queda fuera de este scope.

---

## Diseño

### 1. `openCountSheet` — nueva firma

```js
openCountSheet(product, counts, zona, quickQtys, onResult, onZonaChange, onClose, notes)
```

El parámetro `notes` (string, puede ser `''`) es el texto de nota actual del artículo.

**Comportamiento del toggle:**

- Si `notes === ''`: mostrar botón **"📝 Añadir nota…"** al final del panel (debajo del botón Añadir). Al tocarlo, el botón se reemplaza por un `<textarea>`.
- Si `notes !== ''`: mostrar el `<textarea>` directamente pre-rellenado, sin botón toggle.

El textarea es `<textarea id="cs-notes">` con estilos consistentes con el resto del panel (fondo `--surface2`, radius 10px, color `--text`, font-size 0.82rem).

La variable `_notes` dentro del closure se inicializa con el parámetro `notes` y se actualiza en el evento `input` del textarea.

**`onResult` incluye `notes` en todos los tipos:**

```js
// type: 'add'
{ type: 'add', zona, qty, notes: _notes }

// type: 'correct'
{ type: 'correct', almacen, tienda, notes: _notes }

// type: 'zero'
{ type: 'zero' }   // sin notes — se borra al poner a 0
```

### 2. `addQty` en `conteos.js`

Pasa la nota actual como último argumento a `openCountSheet`:

```js
openCountSheet(p, getCounts(), getZona(), QUICK_QTYS, onResult, onZonaChange, onDone,
  getCounts()[p.ref]?.notes || '')
```

Al guardar el resultado:

- `type: 'add'` → `c.notes = result.notes`
- `type: 'correct'` → `c.notes = result.notes`
- `type: 'zero'` → `c.notes = ''` (se borra junto con los conteos)

### 3. Lista de Conteos — indicador de nota

En `renderList`, dentro del HTML de cada `prod-item`, si el artículo tiene nota:

```html
<div style="font-size:0.7rem;color:var(--amber);font-style:italic;margin-top:3px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">
  📝 ${truncateNote(c.notes)}
</div>
```

`truncateNote` corta a 60 caracteres con `…` si es más largo. Se muestra en la fila del artículo, debajo de las tags de familia/EAN.

### 4. Export Excel — columna Notas

En `exportComparativa`, añadir columna **"Notas"** como última columna:

- Cabecera: `['REF', 'Nombre', 'Familia', 'Stock sistema', 'Contado', 'Diferencia', 'Estado', 'Notas']`
- Valor: `counts[ref]?.notes || ''`
- Ancho de columna: `{ wch: 30 }`

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `js/ui.js` | `openCountSheet`: nuevo param `notes`, toggle button, textarea, `_notes` en `onResult` |
| `js/conteos.js` | `addQty`: pasar `notes` a `openCountSheet`, guardar `result.notes`; `renderList`: mostrar nota; `exportComparativa`: columna Notas |

---

## Fuera de scope

- Notas en `lista.js` (usa `openSheet` directamente, no `openCountSheet`)
- Notas en pedidos o albaranes
- Búsqueda/filtro por notas
