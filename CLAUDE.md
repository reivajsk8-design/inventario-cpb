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
- **SW:** auto-incrementa `CACHE_NAME` en cada commit vía git pre-commit hook. Última versión: `cpb-v72`

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
    ├── pedidos-core.js     ← Lógica PURA de pedidos: reparto por proveedor, filas Excel, historial, repetir (tests/)
    ├── pedidos-export.js   ← Hojas «⬇ Exportar pedido» (un Excel por proveedor) y «📜 Historial» (repetir/descargar/borrar)
    ├── albaranes.js        ← Tab Albaranes: CRUD + foto + PDF
    ├── resumen.js          ← Tab Resumen: stats + exports Excel + nombre usuario
    ├── tabaco.js           ← Tab Tabaco: setup, inicio, hoja de PIN, salida/entrada/recepción, buscador
    ├── tabaco-core.js      ← Lógica PURA del tabaco: cadena de hashes, stock, descuadres, filas Excel (tests/)
    ├── tabaco-store.js     ← Estado `itab` + eslabón duplicado en IndexedDB (`meta` → `tabaco-cadena`)
    ├── tabaco-inventario.js ← Inventario del almacén + «Cargar desde Excel» (PIN admin)
    ├── tabaco-historico.js ← Stock, descuadres/regularización, histórico/anulación, ajustes y exports
    └── tutorial.js         ← Tutorial de primera vez
└── tests/pedidos-core.test.mjs ← node --test (lógica de pedidos, 7 pruebas)
└── tests/tabaco-core.test.mjs  ← node --test (núcleo del tabaco, 15 pruebas)
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
| `itab` | `{ v:1, terminal, admin:{salt,hash}, personas[], movs[], stock, seq, lastHash, ajustes, …EnCurso }` | Control de tabaco del almacén: personas con PIN (solo salt + hash, nunca en claro), movimientos encadenados por hash (inmutables), stock derivado y borradores de salida/entrada/inventario |

**IndexedDB** (`inventario-cpb`): `products` (keyPath `ref`), `albaranes`, `albaran_photos`, `meta`
En `meta`, la clave **`tabaco-cadena`** guarda `{seq, lastHash, ts}` del último movimiento del tabaco: es la segunda copia del eslabón, la que delata que alguien ha recortado `itab` desde el navegador.

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

### `db.js`
IndexedDB de la app. Además de productos/albaranes/fotos: `getMeta(key)` / `setMeta(key, value)` genéricos sobre el store `meta` (los usa el tabaco para el eslabón `tabaco-cadena` y para el rastro `tabaco-cadena-anterior`).

### `tabaco-core.js`
**Lógica pura, sin DOM** (por eso se prueba con `node --test`): `esTabaco()`, `crearMovimiento()`/`hashDe()`/`verificarCadena()` (cadena SHA-256), `calcularStock()`/`aplicarMovimiento()`, `diferenciasInventario()`, `descuadres()`, `valesPendientes()`/`siguienteVale()`, `estadoMov()` (ANULADA · en camino · recibido · recibido · misma persona), `parseFilasStock()` (Excel de Conteos o de Proxium; las filas **sin cantidad** se saltan y se cuentan en `saltadas`: solo el 0 escrito a propósito es un cero), `filasExcelHistorico()` (**14 columnas**, con `Estado`) / `filasExcelRegularizacion()`, `resumenDia()`, `hashPin()` (**PBKDF2-SHA-256, 60.000 vueltas**) / `pinValido()`.

### `tabaco-store.js`
Persistencia del módulo: `cargar()`/`guardar()` sobre `itab`, `crear()`, `registrar()` (crea el movimiento encadenado, recalcula el stock, guarda y **duplica el eslabón en IndexedDB**), `verificarIntegridad()`, personas (`altaPersona` —nombre único entre activas, «Administrador» reservado—, `cambiarPinPersona`, `bajaPersona`, `buscarPersonaPorPin`, `esAdminPin`), `exportarCopia()`, `borrarModulo()`, `registroAnterior()`.
- **Dos ventanas a la vez** (la app instalada + una pestaña del navegador): `guardar()` mira lo que hay en el disco antes de escribir y, si va por delante (más `seq`, o el mismo `seq` con otro `lastHash`), **no pisa nada**: lanza «El control de tabaco se ha usado en otra ventana. Recarga la app para seguir.». `registrar()` guarda una copia con el movimiento dentro y solo toca el estado de la pantalla si el guardado salió bien.
- `verificarIntegridad()` devuelve `{ ok, problemas, avisos, n }`: `problemas` = el registro no cuadra (banda **roja**); `avisos` = no se pudo **leer o guardar** la segunda copia del eslabón, o sea que la detección de borrados está apagada en ese móvil (aviso **ámbar**; el registro sigue dándose por bueno).
- Borrar el módulo o rehacer el setup apunta antes en IndexedDB (`tabaco-cadena-anterior`) cuántos movimientos había y cuándo fue el último; ese rastro sale en el inicio, en el setup y en Ajustes.

### `tabaco.js`
La pestaña: `mount/unmount`, setup de primera vez, inicio con la banda de integridad, hoja de PIN (numpad; 5 fallos = 30 s de espera, **guardada en `ajustes.pinBloqueoHasta`** para que aguante la recarga), salida a tienda con vale y tope de stock (revalidado **al confirmar**), entrada, recepción en tienda y buscador de artículos de tabaco. Expone `ctx` (estado, `pedirPin`, `refrescar`, `setOnEan`, `guardar`…) a los otros dos módulos.
- Escucha el evento **`storage`**: si otra ventana cambia `itab`, recarga el estado, avisa y repinta. Todo guardado de la interfaz pasa por `guardaAviso`/`ctx.guardar`, que avisa con un toast en vez de dejar la pantalla a medias.
- `mount()` es asíncrono: lleva número de montaje (`_gen`) y se abandona tras cada `await` si ya se cambió de pestaña (si no, pintaba encima de Lista y volvía a coger la pistola).
- El `stock` guardado es solo una **caché**: si no cuadra con los movimientos, la pantalla usa el recalculado (así no se «crea» stock editando `itab` a mano).

### `tabaco-inventario.js`
Inventario del almacén (cada lectura SUMA, tocar una línea fija el número, completo/parcial, borrador con PIN) y **«Cargar desde Excel»** (PIN admin; solo entra el tabaco, avisa de lo que ignora y de las filas sin cantidad).

### `tabaco-historico.js`
Stock, descuadres + regularización (PIN admin, barco y Excel para Proxium), histórico con filtros + detalle + anulación (contramovimiento; **no** se anula lo que dejaría el almacén en negativo: «ese tabaco ya ha salido del almacén»), resumen del día para WhatsApp, ajustes (personas, terminal, avisos, PIN admin, copia JSON, borrar el módulo) y los helpers compartidos `ensureXLSX`/`descargaExcel`/`compartirTexto`. El histórico pinta **300 movimientos** como máximo, con botón «Mostrar más».

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


### 2026-08-27 — Marca CPB: splash + logo en barra + tutorial + iconos PWA
- `index.html`: `#splash` (logo `icons/cpb-logo.png` + barra de progreso) antes de `#app`; favicon PNG y apple-touch-icon PNG.
- `js/app.js`: `hideSplash()` (mín. 400 ms) llamado tras `openDB()` (antes de `ensureUserName`, que espera al usuario) y en el `.finally` de `init()`.
- `js/ui.js`: `export function setNavTitle(t)` — en 'Inventario CPB' pinta el logo (`.nav-logo`); **usar siempre este helper**, no `nav-title.textContent`.
- `js/tutorial.js`: primera pantalla con `.tut-logo` en vez del icono.
- `icons/`: `cpb-logo.png`, `icon-192/512/180.png`, `favicon-32.png`, `icon.svg` (paleta azul marino de la suite); `manifest.json` con PNGs; `sw.js` PRECACHE ampliado.
- Pruebas: Chrome headless por CDP (tiempo real); `--virtual-time-budget` no vale (IndexedDB no avanza).

### 2026-09-01 — Limpieza: PrecioScan viejo eliminado del repo
- Quitado el botón "🌐 PrecioScan" de Resumen (su buscador necesitaba un servidor local muerto; la función vive ahora en el Matcher, botón 🌐 Precio de mercado).
- Borrados del repo: precio-scan.html/-server.js, start-servidor.bat, cpb-tarifa-2026-ean.json, netlify.toml, package*.json (el sync no usa npm).
- docs/ fuera del repo público (untracked + .gitignore), se conserva en local. Copias de todo en Downloads\ANTERIOR\inventario-restos-2026-09-01.

### 2026-09-02 — Stock de conteos: acepta también el export de RÉGIMEN GENERAL
- `js/stock.js`: la cabecera puede ser "Artículo + Cantidad" (depósito fiscal) o "Código + Stock/Disponible" (régimen general, "Detalle del stock" de Proxium).
- `js/conteos.js`: cargar un archivo SUMA al stock ya cargado (permite DF + general en dos archivos); "Eliminar stock cargado" vacía todo. Toast muestra nuevos y total.

### 2026-09-26 — Control de tabaco del almacén (pestaña Tabaco)
- **Por qué:** en la Terminal E desaparecen unos 6 cartones a la semana y no queda constancia de quién saca qué. Pedido por Jose.
- Pestaña nueva **🚬 Tabaco** (la 6ª de la barra): salida a tienda con **vale numerado** y PIN de quien la hace, recepción en tienda con PIN (las diferencias quedan como descuadre de tránsito), entradas al almacén, inventario (pistola/cámara o **Excel** de conteos), stock, descuadres + regularización por barco con Excel para Proxium, histórico con anulación (contramovimiento: nunca se borra nada) y ajustes (personas, terminal, copia JSON).
- **Registro inalterable:** cada movimiento lleva `prevHash + hash` (SHA-256) y el último eslabón se duplica en IndexedDB (`meta` → `tabaco-cadena`). Al abrir la pestaña se comprueban cadena, stock y eslabón: si alguien ha tocado o recortado los datos sale la banda roja «⚠ Registro alterado: …» y el Excel del histórico lo marca. Los PIN se guardan solo como `salt + hash`.
- Ficheros: `js/tabaco-core.js` (puro), `js/tabaco-store.js`, `js/tabaco.js`, `js/tabaco-inventario.js`, `js/tabaco-historico.js`; `getMeta/setMeta` en `js/db.js`; estilos `.tb-*` en `css/components.css`; pestaña en `index.html` / `js/app.js` / `sw.js`.
- Datos en `localStorage.itab` (solo en ese móvil). Siguiente paso previsto: volcado a la nube (spec §9).
- **Tanda de arreglos tras la revisión final (2026-09-26):** los PIN pasan a **PBKDF2-SHA-256 (60.000 vueltas)**; **dos ventanas abiertas ya no se pisan el registro** (`guardar()` no escribe si el disco va por delante y la pestaña escucha el evento `storage`); el Excel del histórico lleva la columna **«Estado»** (14 columnas, `estadoMov()` en el núcleo); una **celda de cantidad vacía** en el Excel ya no cuenta como 0; la salida **revalida el tope de stock al confirmar** y la pantalla usa el **stock recalculado**, no la caché; no se anula una entrada cuyo tabaco **ya salió**; si IndexedDB no deja leer/guardar la segunda copia del eslabón sale un **aviso ámbar** (`avisos`) en vez de callarse; **borrar o recrear el módulo deja rastro** (`tabaco-cadena-anterior`); el histórico pinta **300** movimientos con «Mostrar más»; no hay **dos personas activas con el mismo nombre** ni «Administrador»; el **bloqueo por 5 fallos** aguanta la recarga; y el montaje asíncrono de la pestaña ya no pinta encima de otra.
- **Al usarlo:** una sola ventana a la vez (si se usan dos, la app avisa y hay que recargar); y el PIN de administrador **no sirve para picar salidas** — Jose tiene que estar también de alta como persona.
- Pruebas: `node --test tests/tabaco-core.test.mjs` (15) y la prueba de pantalla por CDP `humo_tabaco.mjs` del scratchpad (216 comprobaciones, con el Excel real de Jose, las dos ventanas y la manipulación del registro).
