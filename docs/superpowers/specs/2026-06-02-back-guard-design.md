# Back Guard — Design Spec

**Date:** 2026-06-02  
**Status:** Approved

---

## Goal

Evitar que el botón atrás de Android cierre la app accidentalmente. Primera pulsación muestra un toast de confirmación; segunda pulsación dentro de 2s sale normalmente.

---

## Contexto

La app es una PWA mobile-first instalada en Android (modo full-screen). El botón atrás del sistema dispara el evento `popstate` cuando no hay historial real de navegación. Actualmente no hay ningún guard → la primera pulsación cierra la app.

La app usa `history.pushState` / `popstate` únicamente a través de este guard (no hay router basado en historial).

---

## Comportamiento

El listener `popstate` comprueba en este orden:

1. **Cámara abierta** (`#cam-overlay` visible) → `closeCamera()`, re-push guard. Sin toast.
2. **Sheet abierto** (`#sheet-overlay` visible) → `closeSheet()`, re-push guard. Sin toast.
3. **Primera pulsación libre** → toast "Pulsa atrás de nuevo para salir" (2 s), `_pending = true`, re-push guard.
4. **Segunda pulsación dentro de 2 s** (`_pending === true`) → no re-push, el navegador sale normalmente.

Si pasan 2 s sin segunda pulsación, `_pending` vuelve a `false`.

---

## Arquitectura

**Un único archivo modificado:** `js/app.js`

### Imports añadidos

```js
import { toast, closeSheet } from './ui.js';          // closeSheet se añade al import existente
import { closeCamera } from './camera-scanner.js';    // import nuevo
```

### Función `initBackGuard()`

```js
function initBackGuard() {
  history.pushState({ backGuard: true }, '');
  let _pending = false;
  let _timer   = null;

  window.addEventListener('popstate', () => {
    if (!document.getElementById('cam-overlay').classList.contains('hidden')) {
      closeCamera();
      history.pushState({ backGuard: true }, '');
      return;
    }
    if (!document.getElementById('sheet-overlay').classList.contains('hidden')) {
      closeSheet();
      history.pushState({ backGuard: true }, '');
      return;
    }
    if (_pending) return;
    _pending = true;
    clearTimeout(_timer);
    _timer = setTimeout(() => { _pending = false; }, 2000);
    toast('Pulsa atrás de nuevo para salir', '', 2000);
    history.pushState({ backGuard: true }, '');
  });
}
```

### Llamada en `init()`

Al final de `init()`, justo antes o después de `showTutorial()`:

```js
initBackGuard();
```

---

## Fuera de scope

- Soporte iOS (ningún navegador iOS tiene botón atrás hardware equivalente)
- Animación de salida o overlay de confirmación visual (el toast es suficiente)
- Integración con el historial de navegación por tabs (la app no usa hash routing)
