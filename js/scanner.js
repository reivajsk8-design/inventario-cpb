// js/scanner.js
const THRESHOLD_MS = 80;
const MIN_EAN_LEN  = 8;

let buffer      = '';
let lastKeyTime = 0;
let _onScan     = null;
let _active     = false;

function onKeyDown(e) {
  if (!_active || !_onScan) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  const now = Date.now();
  if (now - lastKeyTime > THRESHOLD_MS) buffer = '';
  lastKeyTime = now;

  if (e.key === 'Enter') {
    if (buffer.length >= MIN_EAN_LEN && /^\d+$/.test(buffer)) {
      _onScan(buffer);
    }
    buffer = '';
    return;
  }

  if (e.key.length === 1 && /\d/.test(e.key)) {
    buffer += e.key;
  }
}

export function startScanner(onScan) {
  _onScan = onScan;
  _active = true;
  if (!window._scannerListenerAdded) {
    document.addEventListener('keydown', onKeyDown);
    window._scannerListenerAdded = true;
  }
}

export function pauseScanner()  { _active = false; }
export function resumeScanner() { _active = true;  }
