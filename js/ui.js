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

export function openCountSheet(product, counts, zona, quickQtys, onResult, onZonaChange, onClose, notes = '') {
  const c   = counts[product.ref];
  const alm = c?.almacen ?? 0;
  const tie = c?.tienda  ?? 0;
  const tot = alm + tie;

  let _zona   = zona;
  let _qty    = quickQtys[0];
  let _manual = false;
  let _notes  = notes;

  const avatar = (product.family || '?').slice(0, 2).toUpperCase();

  const summaryHTML = tot > 0 ? `
    <div style="background:var(--surface2);border-radius:12px;padding:10px 14px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:var(--text3);font-size:0.72rem">🏪 Almacén</span>
        <span style="font-weight:700;color:${alm > 0 ? 'var(--green)' : 'var(--text3)'}">${alm}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:var(--text3);font-size:0.72rem">🏬 Tienda</span>
        <span style="font-weight:700;color:${tie > 0 ? 'var(--green)' : 'var(--text3)'}">${tie}</span>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--separator);padding-top:6px;margin-top:4px">
        <span style="color:var(--text3);font-size:0.72rem">Total</span>
        <span style="font-weight:800;color:var(--green)">${tot}</span>
      </div>
    </div>` : '';

  function addModeHTML() {
    return `
      <div class="qty-sheet-product">
        <div class="prod-avatar">${avatar}</div>
        <div>
          <div class="qty-sheet-name">${product.name}</div>
          <div class="qty-sheet-meta">${product.ref} · ${product.family}</div>
          <div class="qty-sheet-ean">EAN ${product.ean || '—'} · ${product.proxium || ''}</div>
        </div>
      </div>
      ${summaryHTML}
      <div class="qty-label" style="margin-bottom:8px">Añadir en</div>
      <div style="display:flex;gap:8px;margin-bottom:14px" id="cs-zona-row">
        ${['almacen', 'tienda'].map(z => `
          <button data-zona="${z}" style="
            flex:1;padding:10px;border-radius:10px;font-size:0.82rem;font-weight:700;
            border:2px solid ${_zona === z ? 'var(--accent)' : 'var(--separator)'};
            background:${_zona === z ? 'rgba(10,132,255,0.12)' : 'var(--surface2)'};
            color:${_zona === z ? 'var(--accent)' : 'var(--text3)'}">
            ${z === 'almacen' ? '🏪 Almacén' : '🏬 Tienda'}
          </button>`).join('')}
      </div>
      <div class="qty-label">Cantidad</div>
      <div class="qty-quick" id="cs-quick">
        ${quickQtys.map((q, i) =>
          `<button class="qty-quick-btn${i === 0 && !_manual ? ' active' : ''}" data-q="${q}">×${q}</button>`
        ).join('')}
      </div>
      <div class="numpad-display-row">
        <div class="numpad-display" id="np-display">${_qty}</div>
        <button class="numpad-del" id="np-del">⌫</button>
      </div>
      <div class="numpad">
        ${[1,2,3,4,5,6,7,8,9].map(n =>
          `<button class="np-btn" data-n="${n}">${n}</button>`
        ).join('')}
        <button class="np-btn zero" data-n="0">0</button>
        <button class="np-btn confirm" id="np-ok">✓</button>
      </div>
      <button class="add-btn" id="np-add">Añadir ${_qty} → total ${tot + _qty}</button>
      ${tot > 0 ? `
      <button id="cs-corregir" style="
        width:100%;background:var(--surface2);border-radius:12px;padding:11px;
        color:var(--text2);font-size:0.78rem;font-weight:600;margin-top:6px">
        ✏️ Corregir conteos
      </button>` : ''}
      ${_notes !== ''
        ? `<textarea id="cs-notes" rows="2" placeholder="Nota sobre este conteo…"
             style="width:100%;background:var(--surface2);border-radius:10px;
                    padding:10px 12px;color:var(--text);font-size:0.82rem;
                    border:none;resize:none;box-sizing:border-box;margin-top:8px"></textarea>`
        : `<button id="cs-notes-toggle"
             style="width:100%;background:var(--surface2);border-radius:10px;
                    padding:10px 12px;color:var(--text3);font-size:0.82rem;
                    font-weight:600;text-align:left;margin-top:8px">
             📝 Añadir nota…
           </button>`}`;
  }

  const close = openSheet(addModeHTML(), onClose ? () => onClose(_notes) : null);

  function updateZonaBtns() {
    document.querySelectorAll('#cs-zona-row [data-zona]').forEach(btn => {
      const on = btn.dataset.zona === _zona;
      btn.style.borderColor = on ? 'var(--accent)'            : 'var(--separator)';
      btn.style.background  = on ? 'rgba(10,132,255,0.12)'    : 'var(--surface2)';
      btn.style.color       = on ? 'var(--accent)'            : 'var(--text3)';
    });
  }

  function updateAddBtn() {
    const d = document.getElementById('np-display');
    const b = document.getElementById('np-add');
    if (d) d.textContent = _qty;
    if (b) b.textContent = `Añadir ${_qty} → total ${tot + _qty}`;
  }

  function confirmAdd() {
    if (_qty <= 0) return;
    onResult({ type: 'add', zona: _zona, qty: _qty, notes: _notes });
    close();
  }

  function openCorrectMode() {
    document.getElementById('sheet-content').innerHTML = `
      <div style="font-size:0.9rem;font-weight:700;color:var(--text);margin-bottom:4px">✏️ Corregir conteo</div>
      <div style="font-size:0.65rem;color:var(--text3);margin-bottom:18px">${product.ref} — ${product.name}</div>
      <div style="margin-bottom:12px">
        <div class="qty-label" style="margin-bottom:6px">🏪 Almacén</div>
        <input id="corr-alm" type="number" min="0" inputmode="numeric"
          style="width:100%;background:var(--surface2);border-radius:10px;padding:12px 14px;
                 color:var(--text);font-size:1rem;font-weight:700"
          value="${alm}">
      </div>
      <div style="margin-bottom:20px">
        <div class="qty-label" style="margin-bottom:6px">🏬 Tienda</div>
        <input id="corr-tie" type="number" min="0" inputmode="numeric"
          style="width:100%;background:var(--surface2);border-radius:10px;padding:12px 14px;
                 color:var(--text);font-size:1rem;font-weight:700"
          value="${tie}">
      </div>
      <button id="corr-save" class="add-btn" style="margin-bottom:8px">Guardar corrección</button>
      <button id="corr-zero" style="
        width:100%;background:rgba(255,69,58,0.1);border-radius:12px;padding:11px;
        color:var(--red);font-size:0.78rem;font-weight:600;margin-bottom:8px">
        🗑 Poner a 0 este artículo
      </button>
      <button id="corr-back" style="
        width:100%;background:var(--surface2);border-radius:12px;padding:11px;
        color:var(--text3);font-size:0.78rem;font-weight:600">
        ← Volver
      </button>`;

    document.getElementById('corr-save').addEventListener('click', () => {
      const newAlm = Math.max(0, parseInt(document.getElementById('corr-alm').value) || 0);
      const newTie = Math.max(0, parseInt(document.getElementById('corr-tie').value) || 0);
      onResult({ type: 'correct', almacen: newAlm, tienda: newTie, notes: _notes });
      close();
    });

    document.getElementById('corr-zero').addEventListener('click', () => {
      onResult({ type: 'zero' });
      close();
    });

    document.getElementById('corr-back').addEventListener('click', () => {
      document.getElementById('sheet-content').innerHTML = addModeHTML();
      wireAddMode();
    });
  }

  function wireAddMode() {
    document.getElementById('cs-zona-row').addEventListener('click', e => {
      const btn = e.target.closest('[data-zona]');
      if (!btn) return;
      _zona = btn.dataset.zona;
      if (onZonaChange) onZonaChange(_zona);
      updateZonaBtns();
      updateAddBtn();
    });

    document.getElementById('cs-quick').addEventListener('click', e => {
      const btn = e.target.closest('[data-q]');
      if (!btn) return;
      _qty    = parseInt(btn.dataset.q);
      _manual = false;
      document.querySelectorAll('.qty-quick-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
      updateAddBtn();
    });

    document.querySelector('.numpad').addEventListener('click', e => {
      if (e.target.id === 'np-ok') { confirmAdd(); return; }
      const n = e.target.dataset.n;
      if (n === undefined) return;
      const cur = _manual ? String(_qty) : '';
      _qty    = Math.min(parseInt(cur + n) || 0, 9999);
      _manual = true;
      document.querySelectorAll('.qty-quick-btn').forEach(b => b.classList.remove('active'));
      updateAddBtn();
    });

    document.getElementById('np-del').addEventListener('click', () => {
      _qty    = parseInt(String(_qty).slice(0, -1)) || 0;
      _manual = true;
      updateAddBtn();
    });

    document.getElementById('np-add').addEventListener('click', confirmAdd);
    document.getElementById('cs-corregir')?.addEventListener('click', openCorrectMode);
    const toggleBtn = document.getElementById('cs-notes-toggle');
    toggleBtn?.addEventListener('click', () => {
      const ta  = document.createElement('textarea');
      ta.id   = 'cs-notes';
      ta.rows = 2;
      ta.placeholder = 'Nota sobre este conteo…';
      ta.style.cssText = 'width:100%;background:var(--surface2);border-radius:10px;' +
        'padding:10px 12px;color:var(--text);font-size:0.82rem;' +
        'border:none;resize:none;box-sizing:border-box;margin-top:8px';
      toggleBtn.replaceWith(ta);
      ta.addEventListener('input', e => { _notes = e.target.value; });
      ta.focus();
    });
    const csNotesEl = document.getElementById('cs-notes');
    if (csNotesEl) csNotesEl.value = _notes;
    document.getElementById('cs-notes')?.addEventListener('input', e => { _notes = e.target.value; });
  }

  wireAddMode();
}
