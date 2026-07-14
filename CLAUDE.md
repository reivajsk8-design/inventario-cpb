# CLAUDE.md — Inventario CPB

Guía de contexto para Claude Code. Léela completa antes de tocar cualquier archivo.

---

## Qué es esta app

PWA mobile-first de gestión de inventario para la empresa CPB. Sin framework, vanilla JS ES modules, dark theme estilo iOS. Pensada para usarse desde el móvil con una pistola lectora de códigos de barras HID o con la cámara del dispositivo.

**URL producción:** https://reivajsk8-design.github.io/inventario-cpb/

---

## Repositorio y deploy

- **Rama de producción:** `main` — SIEMPRE hacer push aquí
- **⚠️ Existe `master` pero NO despliega.** Nunca hagas push a master creyendo que va a producción.
- **Deploy:** automático vía GitHub Pages al push a `main`
- **Remote:** `https://github.com/reivajsk8-design/inventario-cpb.git`
- **SW:** auto-incrementa `CACHE_NAME` en cada commit vía git pre-commit hook. Última versión: `cpb-v61`

```bash
# Flujo correcto
git add <archivos>
git commit -m "tipo: descripción"
git push origin main
```

---

## Estructura de archivos

```
C:\Inventario CPB\          ← GIT ROOT (producción)
├── index.html              ← HTML único, tabs + sheet overlay + toast + cam overlay
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service worker (auto-bump CACHE_NAME en cada commit)
├── db.json.gz              ← BD de productos comprimida (11.485 artículos)
├── db-version.json         ← { "version": "2026-06-01b" }
├── eans-extra.json         ← EANs extra por ref (fuera de la BD)
├── css/
│   ├── base.css            ← Reset, variables CSS, fuentes
│   └── components.css      ← Todos los componentes UI
└── js/
    ├── app.js              ← Init, router de tabs, ensureUserName(), loadEansExtra()
    ├── db.js               ← IndexedDB: productos, albaranes, fotos, meta
    ├── filters.js          ← filterProducts(), mountFilterBar() — icono #fb-scan: viewfinder SVG
    ├── scanner.js          ← Escáner HID (keydown listener, buffer EAN)
    ├── camera-scanner.js   ← BarcodeDetector API: openCamera/closeCamera/resumeCamera/beepMatch/beepError
    ├── stock.js            ← getStock/saveStock/clearStock, parseStockXLSX
    ├── ui.js               ← toast(), openSheet(), closeSheet(), openQtySheet(), openCountSheet()
    ├── eans.js             ← matchesEan(), openAssignEanSheet()
    ├── lista.js            ← Tab Lista: catálogo + edición local + conteo con zona
    ├── conteos.js          ← Tab Conteos: conteo por zonas + cámara + comparación stock
    ├── pedidos.js          ← Tab Pedidos: gestión de pedidos + cámara (nav-right)
    ├── albaranes.js        ← Tab Albaranes: CRUD + foto + PDF
    ├── resumen.js          ← Tab Resumen: stats + exports Excel + nombre usuario
    └── tutorial.js         ← Tutorial de primera vez
```

**Carpeta de utilidades** (NO en git):
```
C:\Inventario CPB\Inventario CPB\
├── update-db.cjs           ← Script para actualizar la BD (node update-db.cjs)
└── Mejoras App/            ← Archivos de datos para actualizaciones de BD
```

---

## CSS — variables disponibles

```css
--bg, --surface, --surface2, --separator
--accent (#0A84FF), --green (#30D158), --red (#FF453A), --amber (#FF9F0A)
--text, --text2, --text3
--radius-sm/md/lg/xl, --blur, --font
```

---

## Datos — localStorage keys

| Key | Formato | Descripción |
|-----|---------|-------------|
| `ic` | `{ ref: { almacen, tienda, notes, ts } }` | Conteos por zona + timestamp |
| `ic_zona` | `'almacen'` \| `'tienda'` | Zona activa en Conteos |
| `ic_user` | string | Nombre usuario (obligatorio al inicio) |
| `io` | `{ ref: qty }` | Pedidos |
| `ie` | `{ ref: { campo: valor } }` | Ediciones locales de productos |
| `ia` | `{ ref: artículo }` | Artículos nuevos creados localmente |
| `ix` | array | EANs pendientes de asignar |
| `is` | `{ ref: qty }` | Stock sistema PROXIUM (cargado desde Excel) |
| `itr` | string | Terminal para conteos/albaranes |
| `itp` | string | Terminal para pedidos |

**IndexedDB** (`inventario-cpb`): `products` (keyPath `ref`), `albaranes`, `albaran_photos`, `meta`

---

## Estructura de un producto

```json
{
  "ref": "ABA-001",
  "name": "ABANICO BARCELONA PUNTILLA BIS",
  "ean": "8435069400010",
  "family": "ABANICOS APARISI",
  "pvp": 3.5,
  "cost": 0.65,
  "iva": 21,
  "proxium": "BARCELONA/P BIS"
}
```

---

## Módulos JS — responsabilidades

### `camera-scanner.js`
Escáner de cámara vía BarcodeDetector API. Solo disponible en Chrome/Edge Android+Desktop (NO iOS — todos los navegadores iOS usan WebKit que no soporta BarcodeDetector).
- `cameraSupported()` — comprueba si el navegador soporta BarcodeDetector + getUserMedia
- `openCamera(onEan, toast)` — abre cámara trasera, crea AudioContext `_ctx` durante el gesto del usuario
- `resumeCamera()` — reanuda el bucle de detección tras confirmar un artículo
- `closeCamera()` — para el stream y cierra el AudioContext
- `beepMatch()` — jingle 1-up Mario cuando conteo cuadra con stock del sistema
- `beepError()` — dos notas descendentes cuando EAN no encontrado en BD
- Internamente usa `_soundCtx` persistente (con `resume()`) para sonidos fuera de la cámara

### `ui.js`
Funciones compartidas de UI. **No importa de ningún otro módulo** excepto `scanner.js`.
- `openCountSheet(product, counts, zona, quickQtys, onResult, onZonaChange, onClose, notes = '')` — usado por **Conteos** y **Lista**. `onClose(notes)` se invoca al cerrar sin confirmar; `notes` se muestra como textarea pre-rellenado si no está vacío, o como botón toggle "📝 Añadir nota…" si está vacío.

### `filters.js`
Exporta `filterProducts()` y `mountFilterBar()`. El botón `#fb-scan` usa icono SVG viewfinder-circle (Heroicons v2).

### `scanner.js`
Escucha `keydown` globalmente. Detecta secuencias rápidas = EAN de pistola HID. Se pausa cuando hay un sheet abierto.

### Cada tab
Exporta `mount()` y `unmount()`. `mount()` renderiza en `#main` y configura botones del nav. `unmount()` limpia.

---

## Iconos SVG (Heroicons v2, MIT, inline)

Todos inline en el HTML/JS, sin CDN. Usan `stroke="currentColor"` para heredar color activo.

| Ubicación | Icono Heroicons |
|-----------|----------------|
| Tab Lista | `queue-list` |
| Tab Conteos | `clipboard-document-list` |
| Tab Pedidos | `shopping-cart` |
| Tab Albaranes | `truck` |
| Tab Resumen | `chart-bar` |
| Buscador `#fb-scan` | `viewfinder-circle` (pistola/teclado) |
| Cámara zona bar / nav Pedidos | `camera` (móvil) |
| Albaranes "Tomar foto" | `camera` |

---

## Actualizar la base de datos

```bash
# 1. Colocar archivos nuevos en C:\Inventario CPB\Inventario CPB\Mejoras App\
# 2. Editar update-db.cjs si hay nuevos archivos fuente
cd "C:\Inventario CPB\Inventario CPB"
node update-db.cjs
# 3. Hacer push (el script ya genera db.json.gz en el git root)
cd "C:\Inventario CPB"
git add db.json.gz db-version.json
git commit -m "chore: actualizar BD YYYY-MM-DD — descripción"
git push origin main
```

**Reglas BD:**
- Usar siempre `zlib.gunzipSync` / `zlib.gzipSync` de Node (NO `require('node_modules/pako')` — falla)
- NUNCA reemplazar con el CSV de PROXIUM directamente — el CSV puede tener menos productos
- Siempre bumpar `db-version.json` para que la app muestre el banner de actualización
- Formato de versión: `YYYY-MM-DD` o `YYYY-MM-DDx` si hay varias en el mismo día

---

## Convenciones de código

- **Sin frameworks.** Vanilla JS puro, ES modules.
- **Sin comentarios** excepto cuando el porqué no es obvio.
- **innerHTML para renderizar listas.** No cambiar a otro enfoque.
- **CSS inline para estados dinámicos.** CSS en components.css para clases reutilizables.
- **No añadir dependencias npm** a producción. Libs externas (xlsx, jsPDF, pako) lazy desde CDN.
- **Commits frecuentes** con mensajes descriptivos, formato `tipo: descripción`.

---

## Mejoras implementadas (histórico)

| Fecha | Mejora |
|-------|--------|
| 2026-05-08 | Soporte multi-EAN, corrección duplicados BD |
| 2026-05-15 | PrecioScan — consulta precios por EAN |
| 2026-05-27 | Actualización BD: +10 artículos, 27 EANs |
| 2026-06-01 | Conteos por zonas Almacén/Tienda |
| 2026-06-01 | Forzar nombre de usuario al inicio |
| 2026-06-01 | Fix bug RTL en panel EAN no encontrado |
| 2026-06-01 | Conteos ordenados por timestamp |
| 2026-06-01 | Artículos nuevos visibles en Conteos |
| 2026-06-01 | Escáner de cámara en Conteos y Pedidos |
| 2026-06-01 | Sonidos: beep scan, jingle 1-up match, error EAN |
| 2026-06-01 | BD: familias saneadas, LUXOTTICA GROUP, VARIOS eliminado |
| 2026-06-02 | Iconos SVG Heroicons v2 en tab bar y controles |
| 2026-06-02 | Fix: cámara se reanuda automáticamente al cerrar sheet (EAN no encontrado o sin confirmar) |
| 2026-06-02 | Notas por artículo en Conteos: toggle → textarea, indicador en lista, columna en Excel |
| 2026-06-02 | Notas se guardan al cerrar panel sin confirmar (si el artículo ya tiene conteo) |
| 2026-06-02 | EAN extra FORR20 — 4030600347584 |
| 2026-06-02 | BD: 6 refs conflictivas resueltas (PPRA264/265/266, PHER54/55/57) + familia PERFUMES |
| 2026-06-02 | Back guard — doble atrás para salir de la PWA (toast de aviso en primera pulsación) |
| 2026-06-02 | Gestionar datos locales — 4 resets independientes con confirmación inline + detección inteligente ia |
| 2026-07-03 | EAN con ceros a la izquierda: `normEan()` en `js/eans.js` — `matchesEan` compara sin ceros iniciales (mismo GTIN, p.ej. Victoria Secret) |
| 2026-07-03 | IVA solo real: limpieza de `db.json.gz` (1.695 con `2100`/`0` → `21`); el fallo venía propagado desde el matcher vía sync |
| 2026-07-14 | Chequeo de seguridad: `esc()` (en `ui.js`, exportada) anti-XSS en innerHTML de todas las vistas (nombres/proveedor/notas) |
| 2026-07-14 | SRI (`integrity`) en pako (CDN); `.gitignore` endurecido (no publicar `*.cjs`/`*.bat`/backups/ruta interna); permisos de carpeta restringidos |
| 2026-07-14 | PENDIENTE (decisión del usuario): la app + `db.json.gz` (costes/márgenes) son PÚBLICAS en GitHub Pages → falta control de acceso (Cloudflare Access u otro) |

---

## Backlog pendiente

1. Estado "Pendiente" seleccionable en Albaranes
2. Export PDF de lista de albaranes completa
