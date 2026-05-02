// js/ui.js
import { pauseScanner, resumeScanner } from './scanner.js';

let _toastTimer = null;

export function toast(msg, type = '', ms = 2200) {
  const el = document.getElementById('toast');
  clearTimeout(_toastTimer);
  el.textContent = msg;
  el.className   = `toast ${type}`;
  _toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

export function openSheet(html, onClose) {
  pauseScanner();
  const overlay = document.getElementById('sheet-overlay');
  const content = document.getElementById('sheet-content');
  content.innerHTML = html;
  overlay.classList.remove('hidden');

  function close() {
    overlay.classList.add('hidden');
    content.innerHTML = '';
    resumeScanner();
    if (onClose) onClose();
  }

  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay._close  = close;
  return close;
}

export function closeSheet() {
  const overlay = document.getElementById('sheet-overlay');
  if (overlay._close) overlay._close();
}

export function openQtySheet(product, quickQtys, actionLabel, onConfirm) {
  let currentQty   = quickQtys[0];
  let _manualInput = false;

  const sheetHTML = `
    <div class="qty-sheet-product">
      <div class="prod-avatar">${(product.family || '?').slice(0, 2).toUpperCase()}</div>
      <div>
        <div class="qty-sheet-name">${product.name}</div>
        <div class="qty-sheet-meta">${product.ref} · ${product.family}</div>
        <div class="qty-sheet-ean">EAN ${product.ean || '—'} · ${product.proxium || ''}</div>
      </div>
    </div>
    <div class="qty-label">Cantidad</div>
    <div class="qty-quick">
      ${quickQtys.map((q, i) =>
        `<button class="qty-quick-btn${i === 0 ? ' active' : ''}" data-q="${q}">×${q}</button>`
      ).join('')}
    </div>
    <div class="numpad-display-row">
      <div class="numpad-display" id="np-display">${currentQty}</div>
      <button class="numpad-del" id="np-del">⌫</button>
    </div>
    <div class="numpad">
      ${[1,2,3,4,5,6,7,8,9].map(n =>
        `<button class="np-btn" data-n="${n}">${n}</button>`
      ).join('')}
      <button class="np-btn zero" data-n="0">0</button>
      <button class="np-btn confirm" id="np-ok">✓</button>
    </div>
    <button class="add-btn" id="np-add">${actionLabel.replace('{n}', currentQty)}</button>
  `;

  const close = openSheet(sheetHTML, null);

  const getDisplay = () => document.getElementById('np-display');
  const getAddBtn  = () => document.getElementById('np-add');

  const updateUI = () => {
    getDisplay().textContent = currentQty;
    getAddBtn().textContent  = actionLabel.replace('{n}', currentQty);
  };

  document.querySelector('.qty-quick').addEventListener('click', e => {
    const btn = e.target.closest('[data-q]');
    if (!btn) return;
    currentQty   = parseInt(btn.dataset.q);
    _manualInput = false;
    document.querySelectorAll('.qty-quick-btn').forEach(b =>
      b.classList.toggle('active', b === btn));
    updateUI();
  });

  document.querySelector('.numpad').addEventListener('click', e => {
    if (e.target.id === 'np-ok') { confirm(); return; }
    const n = e.target.dataset.n;
    if (n === undefined) return;
    const cur  = _manualInput ? String(currentQty) : '';
    const next = parseInt(cur + n) || 0;
    currentQty   = Math.min(next, 9999);
    _manualInput = true;
    document.querySelectorAll('.qty-quick-btn').forEach(b => b.classList.remove('active'));
    updateUI();
  });

  document.getElementById('np-del').addEventListener('click', () => {
    const s    = String(currentQty).slice(0, -1);
    currentQty   = parseInt(s) || 0;
    _manualInput = true;
    updateUI();
  });

  const confirm = () => {
    if (currentQty <= 0) return;
    onConfirm(currentQty);
    close();
  };

  document.getElementById('np-add').addEventListener('click', confirm);
}
