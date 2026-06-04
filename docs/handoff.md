# Inventario CPB — Handoff 2026-06-04

## Goal we're working toward

A mobile-first PWA for stock counting and order management in a glasses/accessories shop (CPB). The app runs offline, syncs a gzipped JSON database from GitHub Pages, and stores all counts/orders in localStorage. The ongoing direction is: better inventory workflow (zone-based counting, camera scanning, audio feedback, data management), DB quality (clean refs, families, EANs), and Excel exports for reporting.

---

## Current state of the code

**Deployed at:** `https://reivajsk8-design.github.io/inventario-cpb/`  
**Git root:** `C:\Inventario CPB\`  
**Service Worker:** `cpb-v55`  
**DB version:** `2026-06-02b` — 11,485 articles  
**Branch:** `main` (only branch, GitHub Pages deploys from here)

### What was shipped (all sessions to date)

| Feature | Status |
|---|---|
| Zone selector (Almacén/Tienda) in Lista + Conteos | ✅ |
| Force user name on first launch (blocks until entered) | ✅ |
| Fix RTL typing bug in EAN assignment panel | ✅ |
| Sort Conteos list by last-counted timestamp | ✅ |
| New local articles (`ia`) visible in Conteos tab | ✅ |
| Camera scanner in Conteos tab (BarcodeDetector) | ✅ |
| Camera scanner in Pedidos tab (nav-right button) | ✅ |
| Beep on scan, 1-up jingle on stock match, error sound on EAN not found | ✅ |
| DB: removed bad family values, assigned LUXOTTICA GROUP, removed VARIOS | ✅ |
| DB: merged duplicate ref pairs, removed -1 suffix from 24 refs | ✅ |
| SVG icons in tab bar (Heroicons v2 MIT, inline) | ✅ |
| Differentiated scan icons: viewfinder (pistol) vs camera (mobile) | ✅ |
| Fix: camera auto-resumes after dismissing any sheet | ✅ |
| Notes per article in Conteos: toggle → textarea, amber indicator in list, Excel column | ✅ |
| Notes auto-save on panel close without confirming count (only if article has existing count) | ✅ |
| EAN extra FORR20: 4030600347584 added to eans-extra.json | ✅ |
| DB: 6 conflicting -1 refs resolved (PPRA264/265/266, PHER54/55/57) + family PERFUMES | ✅ |
| Back guard: double-back to exit PWA (first press shows toast, second exits) | ✅ |
| Gestionar datos locales: 4 independent resets with inline confirmation + smart ia detection | ✅ |

### Architecture notes

- `js/app.js` — bootstrap, tab routing, `ensureUserName()`, `loadEansExtra()`, `initBackGuard()`
  - `initBackGuard()`: pushes history guard state, handles popstate — priority: close camera → close sheet → double-back toast → exit
- `js/lista.js` — Lista tab, product sheet, conteo mode with zone selector
- `js/conteos.js` — Conteos tab, scan-to-count, camera, stock comparison, `beepMatch()`/`beepError()`
- `js/pedidos.js` — Pedidos tab, orders, camera via nav-right button
- `js/camera-scanner.js` — BarcodeDetector wrapper + Web Audio sounds
  - Camera only works in Chrome/Edge on Android and Desktop — NOT on any iOS browser
- `js/ui.js` — `openCountSheet(product, counts, zona, quickQtys, onResult, onZonaChange, onClose, notes='')`, `openSheet`, `closeSheet`, `toast`
- `js/eans.js` — EAN assignment sheet
- `js/resumen.js` — Resumen tab, stats, exports, "Gestionar datos locales" sheet
  - `openManageSheet()`: 4 sections (conteos/pedidos/ediciones/artículos nuevos), each with inline confirm
  - Smart detection for `ia`: compares refs against `_rawAll` (IndexedDB) to flag ✅/⏳
- `sw.js` — Service Worker, auto-bumped by git pre-commit hook on every commit
- `db.json.gz` — production database (gzipped JSON array)
- `db-version.json` — triggers update banner when version string changes
- `eans-extra.json` — extra EANs by ref (outside main DB)

### localStorage keys

| Key | Value |
|---|---|
| `ic` | counts `{ref: {almacen, tienda, notes, ts}}` |
| `ic_zona` | `'almacen'` or `'tienda'` |
| `ic_user` | user name (required, blocked on first launch) |
| `ia` | new articles added locally |
| `ie` | local edits to articles |
| `io` | orders |
| `ix` | pending EANs |
| `is` | PROXIUM system stock |
| `itr` | terminal for counts/albaranes |
| `itp` | terminal for orders |

---

## Files actively edited

All changes are committed and pushed. No dirty state. Last commit: `75a9fcf` (SW v55).

---

## Everything tried that failed

1. **`_onCam` not at module scope in `conteos.js`** — fixed by declaring `let _onCam = null;` at module level.

2. **`beepMatch()` silent — AudioContext suspended** — fixed by using a persistent `_soundCtx` with `ctx.resume()` before scheduling notes, and a `+0.02s` offset on note start times.

3. **`require('node_modules/pako')` in Node scripts** — failed with MODULE_NOT_FOUND. Fixed by using Node's built-in `zlib.gunzipSync` / `zlib.gzipSync`.

4. **XSS in `addModeHTML()` textarea** — injecting `_notes` via innerHTML template literal. Fixed by rendering empty textarea and setting `.value` via DOM property in `wireAddMode()`.

5. **SVG icons not showing after deploy** — CSS `.search-scan` had `font-size: 1rem` without `display: flex`. Fixed by setting `display: inline-flex; align-items: center;`.

---

## Feature backlog

- **"Pendiente" state in Albaranes** — albaranes can be marked pending before being received
- **PDF export of albaranes list** — export received albaranes to PDF
