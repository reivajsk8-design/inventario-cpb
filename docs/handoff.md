# Inventario CPB — Handoff 2026-06-02

## Goal we're working toward

A mobile-first PWA for stock counting and order management in a glasses/accessories shop (CPB). The app runs offline, syncs a gzipped JSON database from GitHub Pages, and stores all counts/orders in localStorage. The ongoing direction is: better inventory workflow (zone-based counting, camera scanning, audio feedback), DB quality (clean refs, families, EANs), and Excel exports for reporting.

---

## Current state of the code

**Deployed at:** `https://reivajsk8-design.github.io/inventario-cpb/`  
**Git root:** `C:\Inventario CPB\`  
**Service Worker:** `cpb-v51`  
**DB version:** `2026-06-01b` — 11,485 articles  
**Branch:** `main` (only branch, GitHub Pages deploys from here)

### What was shipped across these two sessions (2026-06-01 / 2026-06-02)

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
| DB: removed 10 bad family values, assigned LUXOTTICA GROUP to those 10 | ✅ |
| DB: removed VARIOS article (ref=1, EAN 10) | ✅ |
| DB: merged 7 duplicate ref pairs, removed -1 suffix from 24 refs | ✅ |
| SVG icons in tab bar (Heroicons v2 MIT, inline) | ✅ |
| Differentiated scan icons: viewfinder (pistol) vs camera (mobile) | ✅ |
| Fix: camera auto-resumes after dismissing any sheet (EAN not found, or close without confirming) | ✅ |
| Notes per article in Conteos: toggle button → textarea, amber indicator in list, column in Excel export | ✅ |
| Notes auto-save on panel close without confirming count (only if article already has a count) | ✅ |

### Architecture notes

- `js/app.js` — bootstrap, tab routing, `ensureUserName()`, `loadEansExtra()`
- `js/lista.js` — Lista tab, product sheet, conteo mode with zone selector
- `js/conteos.js` — Conteos tab, scan-to-count, camera, stock comparison, `beepMatch()`/`beepError()`
- `js/pedidos.js` — Pedidos tab, orders, camera via nav-right button
- `js/camera-scanner.js` — BarcodeDetector wrapper + Web Audio sounds
  - `_ctx` = AudioContext created during openCamera() (user gesture)
  - `_soundCtx` = persistent AudioContext for sounds without camera (uses `resume()` before scheduling)
  - Camera only works in Chrome/Edge on Android and Desktop — NOT on any iOS browser
- `js/ui.js` — `openCountSheet(product, counts, zona, quickQtys, onResult, onZonaChange, onClose, notes='')`, `openSheet`, `closeSheet`, `toast`
- `js/eans.js` — EAN assignment sheet (fixed: input created once, only results div updates)
- `js/filters.js` — filter bar with viewfinder-circle SVG for scan button
- `js/resumen.js` — Resumen tab, user name display + change
- `sw.js` — Service Worker, auto-bumped by git pre-commit hook on every commit
- `db.json.gz` — production database (gzipped JSON array)
- `db-version.json` — triggers update banner when version string changes

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
| `itc` | terminal/store identifier |

---

## Files actively edited

All changes are committed and pushed. No dirty state. Last commit: `047c0b1` (SW v51).

---

## Everything tried that failed

1. **`_onCam` not at module scope in `conteos.js`** — `addQty()` referenced `_onCam` but it was only a local variable inside `mount()`. Fixed by declaring `let _onCam = null;` at module level and assigning in `mount()`.

2. **`beepMatch()` silent — AudioContext suspended** — Created a new `AudioContext` each time → context started in "suspended" state → `currentTime = 0` → notes scheduled in the past → silence. Fixed by using a persistent `_soundCtx` module-level variable with `ctx.resume()` before scheduling notes, and a `+0.02s` offset on note start times.

3. **`require('node_modules/pako')` in Node scripts** — Failed with MODULE_NOT_FOUND. Fixed by using Node's built-in `zlib.gunzipSync` / `zlib.gzipSync` for all DB maintenance scripts.

4. **6 articles with conflicting -1 suffixes** — Could not rename because a different product already exists at the target ref. Skipped, pending manual review in PROXIUM: `PPRA264-1`, `PPRA265-1`, `PPRA266-1`, `PHER54-1`, `PHER55-1`, `PHER57-1`.

5. **SVG icons not showing after deploy** — CSS `.search-scan` had `font-size: 1rem` (emoji styling) without `display: flex`, causing alignment issues. Fixed by setting `display: inline-flex; align-items: center;`. Also 📷 emojis remained in `pedidos.js` hint text and `albaranes.js` "Tomar foto" button.

---

## Next steps

### Immediate (pending user review)
- **Resolve 6 conflicting -1 refs**: user needs to check in PROXIUM which article is correct for each conflicting pair, then rename or merge.

### Feature backlog
- **Independent reset** — separate "reset counts" from "reset orders" (currently one action clears both)
- **"Pendiente" state in Albaranes** — albaranes can be marked pending before being received
- **PDF export of albaranes list** — export received albaranes to PDF

### DB maintenance pending
- Continue cleaning refs as PROXIUM discrepancies are found
- Assign families to articles that currently have `family: ""`
