// js/albaranes.js
import { openDB } from './db.js';
import { toast }  from './ui.js';

const TERMINALS = ['D', 'MSC', 'E'];
let _photos = [];
let _lineas = [];

const TERM_COLORS = {
  D:   { bg: '#FF6B00', bgOff: 'rgba(255,107,0,0.1)',   color: '#fff',    colorOff: 'rgba(255,107,0,0.8)'   },
  MSC: { bg: '#FFD60A', bgOff: 'rgba(255,214,10,0.1)',  color: '#1a1a1a', colorOff: 'rgba(255,214,10,0.85)' },
  E:   { bg: '#0A84FF', bgOff: 'rgba(10,132,255,0.1)',  color: '#fff',    colorOff: 'rgba(10,132,255,0.8)'  },
};

// ── IndexedDB helpers ─────────────────────────────────────────────
function idbReq(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function getAll() {
  const db   = await openDB();
  const list = await idbReq(db.transaction('albaranes').objectStore('albaranes').getAll());
  return list.sort((a, b) => b.id - a.id);
}

async function saveAlb(alb) {
  const db = await openDB();
  return idbReq(db.transaction('albaranes', 'readwrite').objectStore('albaranes').put(alb));
}

async function removeAlb(id) {
  const db = await openDB();
  await idbReq(db.transaction('albaranes', 'readwrite').objectStore('albaranes').delete(id));
  await idbReq(db.transaction('albaran_photos', 'readwrite').objectStore('albaran_photos').delete(id));
}

async function getPhoto(id) {
  const db  = await openDB();
  const rec = await idbReq(db.transaction('albaran_photos').objectStore('albaran_photos').get(id));
  if (!rec) return [];
  return Array.isArray(rec.data) ? rec.data : [rec.data]; // backward compat
}

async function savePhoto(id, data) {
  const db = await openDB();
  return idbReq(db.transaction('albaran_photos', 'readwrite').objectStore('albaran_photos').put({ id, data }));
}

// ── Mount / Unmount ───────────────────────────────────────────────
export async function mount() {
  await renderLista();
}

export function unmount() {
  const btn = document.getElementById('btn-nav-left');
  if (btn) { btn.textContent = ''; btn.onclick = null; }
  document.getElementById('nav-title').textContent = 'Inventario CPB';
}

// ── Lista ─────────────────────────────────────────────────────────
async function renderLista() {
  document.getElementById('nav-title').textContent = 'Albaranes';
  const leftBtn = document.getElementById('btn-nav-left');
  leftBtn.textContent = ''; leftBtn.onclick = null;

  const items = await getAll();
  const conf  = items.filter(a => a.estado === 'conforme').length;
  const inc   = items.filter(a => a.estado === 'incidencia').length;
  const pend  = items.filter(a => a.estado === 'pendiente').length;

  document.getElementById('main').innerHTML = `
    <div style="padding:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
        <div style="background:rgba(48,209,88,0.1);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:var(--green)">${conf}</div>
          <div style="font-size:0.58rem;color:var(--green);font-weight:700;letter-spacing:0.04em">CONFORMES</div>
        </div>
        <div style="background:rgba(255,69,58,0.1);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:var(--red)">${inc}</div>
          <div style="font-size:0.58rem;color:var(--red);font-weight:700;letter-spacing:0.04em">INCIDENCIAS</div>
        </div>
        <div style="background:rgba(255,159,10,0.1);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:var(--amber)">${pend}</div>
          <div style="font-size:0.58rem;color:var(--amber);font-weight:700;letter-spacing:0.04em">PENDIENTES</div>
        </div>
      </div>
      ${items.length === 0
        ? `<div class="empty-state"><div class="icon">🚚</div><p>Sin albaranes.<br>Pulsa + para crear uno.</p></div>`
        : `<div class="prod-list">${items.map(albItemHTML).join('')}</div>`}
    </div>
    <button id="fab-alb" style="
      position:fixed;bottom:calc(72px + env(safe-area-inset-bottom));right:20px;
      width:56px;height:56px;border-radius:50%;
      background:var(--accent);color:#fff;font-size:1.8rem;font-weight:300;
      box-shadow:0 4px 20px rgba(10,132,255,0.4);
      display:flex;align-items:center;justify-content:center;z-index:20">+</button>
  `;

  document.querySelectorAll('[data-alb]').forEach(el => {
    el.addEventListener('click', async () => {
      const id  = parseInt(el.dataset.alb);
      const db  = await openDB();
      const alb = await idbReq(db.transaction('albaranes').objectStore('albaranes').get(id));
      _photos   = await getPhoto(id);
      if (alb) renderForm(alb);
    });
  });

  document.getElementById('fab-alb').addEventListener('click', () => {
    _photos = [];
    _lineas = [];
    renderForm(null);
  });
}

function estadoBadge(estado) {
  if (estado === 'conforme')
    return `<span style="background:rgba(48,209,88,0.15);color:var(--green);border-radius:8px;padding:3px 10px;font-size:0.62rem;font-weight:700;white-space:nowrap">✓ Conforme</span>`;
  if (estado === 'incidencia')
    return `<span style="background:rgba(255,69,58,0.15);color:var(--red);border-radius:8px;padding:3px 10px;font-size:0.62rem;font-weight:700;white-space:nowrap">⚠ Incidencia</span>`;
  return `<span style="background:rgba(255,159,10,0.15);color:var(--amber);border-radius:8px;padding:3px 10px;font-size:0.62rem;font-weight:700;white-space:nowrap">· Pendiente</span>`;
}

function albItemHTML(alb) {
  const fecha = new Date(alb.id).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  const incLineas   = (alb.lineas || []).filter(l => l.inc !== null && l.inc !== undefined).length;
  const totalLineas = (alb.lineas || []).length;
  return `
    <div class="prod-item" data-alb="${alb.id}" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="prod-name">Alb. ${alb.numero || '—'}</div>
        <div class="prod-meta">${alb.terminal} · ${alb.nombre} · ${fecha}</div>
        ${alb.proveedor ? `<div class="prod-meta">${alb.proveedor}</div>` : ''}
        ${incLineas > 0
          ? `<div class="prod-meta" style="color:var(--red);margin-top:2px">⚠ ${incLineas} artículo${incLineas > 1 ? 's' : ''} con incidencia</div>`
          : totalLineas > 0
            ? `<div class="prod-meta" style="margin-top:2px">${totalLineas} artículo${totalLineas > 1 ? 's' : ''}</div>`
            : ''}
        ${alb.notas ? `<div class="prod-meta" style="color:var(--amber);margin-top:2px">📝 ${alb.notas}</div>` : ''}
      </div>
      ${estadoBadge(alb.estado)}
    </div>`;
}

// ── Formulario ────────────────────────────────────────────────────
function renderForm(alb) {
  const defTerm   = alb?.terminal || localStorage.getItem('itr') || 'D';
  const defNombre = alb?.nombre   || localStorage.getItem('ic_user') || '';
  let _estado     = alb?.estado   ?? 'conforme';
  let _terminal   = defTerm;
  _lineas = alb?.lineas ? alb.lineas.map(l => ({ ...l })) : [];

  document.getElementById('nav-title').textContent = alb ? `Alb. ${alb.numero || '—'}` : 'Nuevo Albarán';
  const leftBtn = document.getElementById('btn-nav-left');
  leftBtn.textContent = '←';
  leftBtn.onclick     = () => renderLista();

  document.getElementById('main').innerHTML = `
    <div style="padding:16px;padding-bottom:32px">

      <div class="qty-label" style="margin-bottom:8px">DATOS DEL ALBARÁN</div>
      <div style="background:var(--surface);border-radius:var(--radius-md);overflow:hidden;margin-bottom:16px">
        <input id="alb-numero" type="text" placeholder="Nº Albarán *"
          style="width:100%;padding:13px 14px;font-size:0.88rem;color:var(--text);border-bottom:0.5px solid var(--separator)"
          value="${alb?.numero || ''}">
        <input id="alb-nombre" type="text" placeholder="Tu nombre *"
          style="width:100%;padding:13px 14px;font-size:0.88rem;color:var(--text);border-bottom:0.5px solid var(--separator)"
          value="${defNombre}">
        <input id="alb-proveedor" type="text" placeholder="Proveedor (opcional)"
          style="width:100%;padding:13px 14px;font-size:0.88rem;color:var(--text)"
          value="${alb?.proveedor || ''}">
      </div>

      <div class="qty-label" style="margin-bottom:8px">TERMINAL</div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${TERMINALS.map(t => termBtn(t, t === defTerm)).join('')}
      </div>

      <div class="qty-label" style="margin-bottom:8px">PÁGINAS DEL ALBARÁN</div>
      <div id="photos-list" style="margin-bottom:8px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <label style="background:var(--surface);border:1px solid var(--separator);border-radius:var(--radius-md);padding:14px 10px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px">
          <span style="font-size:1.3rem">📁</span>
          <span style="font-size:0.72rem;color:var(--text2);font-weight:600">Subir foto</span>
          <input type="file" accept="image/*" id="inp-gallery" style="display:none">
        </label>
        <label style="background:var(--surface);border:1px solid var(--separator);border-radius:var(--radius-md);padding:14px 10px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:26px;height:26px;color:var(--text2)"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/></svg>
          <span style="font-size:0.72rem;color:var(--text2);font-weight:600">Tomar foto</span>
          <input type="file" accept="image/*" capture="environment" id="inp-camera" style="display:none">
        </label>
      </div>

      <div class="qty-label" style="margin-bottom:8px">ARTÍCULOS DEL ALBARÁN</div>
      <div id="lineas-list" style="margin-bottom:6px"></div>
      <button id="btn-add-linea" style="
        width:100%;padding:11px;border-radius:var(--radius-md);
        background:var(--surface);border:1px dashed var(--separator);
        color:var(--text3);font-size:0.82rem;font-weight:600;margin-bottom:16px">
        + Añadir artículo
      </button>

      <div class="qty-label" style="margin-bottom:8px">ESTADO</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        ${estadoBtn('conforme',   '✅ Conforme',   'var(--green)', 'rgba(48,209,88,0.12)',  _estado === 'conforme')}
        ${estadoBtn('incidencia', '⚠️ Incidencia', 'var(--red)',   'rgba(255,69,58,0.12)',  _estado === 'incidencia')}
      </div>

      <div class="qty-label" style="margin-bottom:8px">NOTAS</div>
      <textarea id="alb-notas" rows="3"
        style="width:100%;background:var(--surface);border-radius:var(--radius-md);padding:12px 14px;color:var(--text);font-size:0.85rem;resize:none;margin-bottom:20px"
        placeholder="Incidencias, observaciones…">${alb?.notas || ''}</textarea>

      <button id="btn-alb-save" style="
        width:100%;padding:15px;border-radius:var(--radius-md);
        background:linear-gradient(135deg,#0A84FF,#5E5CE6);
        color:#fff;font-size:0.9rem;font-weight:800;
        box-shadow:0 4px 20px rgba(10,132,255,0.3);
        margin-bottom:${alb ? '10px' : '0'}">
        📄 ${alb ? 'Guardar y generar PDF' : 'Guardar albarán'}
      </button>
      ${alb ? `
        <button id="btn-alb-pdf" style="
          width:100%;padding:13px;border-radius:var(--radius-md);
          background:rgba(10,132,255,0.1);color:var(--accent);
          font-size:0.82rem;font-weight:700;margin-bottom:10px">
          📄 Solo generar PDF
        </button>
        <button id="btn-alb-delete" style="
          width:100%;padding:12px;border-radius:var(--radius-md);
          background:rgba(255,69,58,0.1);color:var(--red);font-size:0.8rem;font-weight:600">
          🗑 Eliminar albarán
        </button>` : ''}
    </div>
  `;

  // Terminal
  document.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => {
      _terminal = btn.dataset.term;
      document.querySelectorAll('[data-term]').forEach(b => {
        const on = b.dataset.term === _terminal;
        const c  = TERM_COLORS[b.dataset.term];
        b.style.background = on ? c.bg    : c.bgOff;
        b.style.color      = on ? c.color : c.colorOff;
      });
    });
  });

  // Estado
  document.querySelectorAll('[data-estado]').forEach(btn => {
    btn.addEventListener('click', () => {
      _estado = btn.dataset.estado;
      const isConf = _estado === 'conforme';
      const cf = document.querySelector('[data-estado="conforme"]');
      const ic = document.querySelector('[data-estado="incidencia"]');
      setEstadoStyle(cf, isConf,  'var(--green)', 'rgba(48,209,88,0.12)');
      setEstadoStyle(ic, !isConf, 'var(--red)',   'rgba(255,69,58,0.12)');
    });
  });

  // Foto — añadir nueva página
  ['inp-gallery', 'inp-camera'].forEach(inputId => {
    document.getElementById(inputId)?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      const reader = new FileReader();
      reader.onload = ev => { _photos.push(ev.target.result); renderPhotoList(); };
      reader.readAsDataURL(file);
    });
  });

  function renderPhotoList() {
    const container = document.getElementById('photos-list');
    if (!container) return;
    if (_photos.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = _photos.map((src, i) => `
      <div style="background:var(--surface);border-radius:12px;margin-bottom:8px;overflow:hidden">
        <img src="${src}" style="width:100%;max-height:160px;object-fit:cover;display:block">
        <div style="padding:8px 10px;display:flex;align-items:center;gap:6px">
          <span style="font-size:0.68rem;color:var(--text3);font-weight:700">
            Pág. ${i+1} / ${_photos.length}
          </span>
          <div style="display:flex;gap:4px;margin-left:auto">
            ${i > 0 ? `<button data-up="${i}" style="padding:5px 9px;border-radius:8px;background:var(--surface2);color:var(--text2);font-size:0.8rem">↑</button>` : ''}
            ${i < _photos.length-1 ? `<button data-down="${i}" style="padding:5px 9px;border-radius:8px;background:var(--surface2);color:var(--text2);font-size:0.8rem">↓</button>` : ''}
            <button data-adjust="${i}" style="padding:5px 10px;border-radius:8px;background:rgba(10,132,255,0.12);color:var(--accent);font-size:0.75rem;font-weight:700">✂️</button>
            <button data-remove="${i}" style="padding:5px 10px;border-radius:8px;background:rgba(255,69,58,0.1);color:var(--red);font-size:0.75rem">🗑</button>
          </div>
        </div>
      </div>`).join('');

    container.querySelectorAll('[data-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.up;
        [_photos[i-1], _photos[i]] = [_photos[i], _photos[i-1]];
        renderPhotoList();
      });
    });
    container.querySelectorAll('[data-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.down;
        [_photos[i], _photos[i+1]] = [_photos[i+1], _photos[i]];
        renderPhotoList();
      });
    });
    container.querySelectorAll('[data-adjust]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.adjust;
        openCropEditor(_photos[i], corrected => {
          _photos[i] = corrected;
          renderPhotoList();
          toast('Foto ajustada ✓', 'green');
        });
      });
    });
    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        _photos.splice(+btn.dataset.remove, 1);
        renderPhotoList();
      });
    });
  }

  renderPhotoList();

  // Líneas del albarán
  function renderLineas() {
    const container = document.getElementById('lineas-list');
    if (!container) return;
    if (_lineas.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = _lineas.map((ln, i) => {
      const hasInc = ln.inc !== null && ln.inc !== undefined;
      return `
        <div style="
          border-radius:10px;padding:10px 12px;margin-bottom:8px;
          ${hasInc
            ? 'background:rgba(255,69,58,0.13);border:2px solid rgba(255,69,58,0.55);animation:inc-flash 0.35s ease-out'
            : 'background:var(--surface);border:1px solid transparent'}">
          ${hasInc ? `
            <div style="margin-bottom:8px">
              <span style="font-size:0.6rem;font-weight:800;color:var(--red);letter-spacing:0.07em">⚠ INCIDENCIA</span>
            </div>` : ''}
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:${hasInc ? '8px' : '0'}">
            <input data-ln="${i}" data-field="desc" type="text" placeholder="Descripción del artículo *"
              style="flex:1;min-width:0;font-size:0.82rem;font-weight:${hasInc ? '700' : '400'};
                color:${hasInc ? 'var(--red)' : 'var(--text)'};
                background:${hasInc ? 'rgba(255,69,58,0.08)' : 'transparent'};
                border:${hasInc ? '1.5px solid rgba(255,69,58,0.5)' : '0;border-bottom:1px solid var(--separator)'};
                border-radius:${hasInc ? '7px' : '0'};
                padding:${hasInc ? '6px 9px' : '4px 2px'}"
              value="${(ln.desc || '').replace(/"/g, '&quot;')}">
            <input data-ln="${i}" data-field="qty" type="number" inputmode="numeric" placeholder="Cant."
              style="width:58px;font-size:0.82rem;text-align:center;
                color:${hasInc ? 'var(--red)' : 'var(--text)'};
                background:${hasInc ? 'rgba(255,69,58,0.08)' : 'transparent'};
                border:${hasInc ? '1.5px solid rgba(255,69,58,0.5)' : '0;border-bottom:1px solid var(--separator)'};
                border-radius:${hasInc ? '7px' : '0'};
                padding:${hasInc ? '6px 4px' : '4px 2px'}"
              value="${ln.qty != null ? ln.qty : ''}">
            <button data-ln-inc="${i}" style="
              padding:4px 8px;border-radius:8px;font-size:0.8rem;font-weight:700;flex-shrink:0;
              background:${hasInc ? 'rgba(255,69,58,0.25)' : 'var(--surface2)'};
              color:${hasInc ? 'var(--red)' : 'var(--text3)'}">⚠</button>
            <button data-ln-del="${i}" style="
              padding:4px 8px;border-radius:8px;font-size:0.8rem;flex-shrink:0;
              background:${hasInc ? 'rgba(255,69,58,0.15)' : 'var(--surface2)'};
              color:${hasInc ? 'rgba(255,69,58,0.7)' : 'var(--text3)'}">🗑</button>
          </div>
          ${hasInc ? `
            <textarea data-ln="${i}" data-field="inc" rows="2"
              style="width:100%;font-size:0.78rem;color:var(--red);
                background:rgba(255,69,58,0.08);border:1.5px solid rgba(255,69,58,0.45);
                border-radius:8px;padding:6px 8px;resize:none"
              placeholder="Describe la incidencia…">${ln.inc || ''}</textarea>
          ` : ''}
        </div>`;
    }).join('');

    container.querySelectorAll('input[data-ln], textarea[data-ln]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = +inp.dataset.ln;
        const field = inp.dataset.field;
        _lineas[i][field] = field === 'qty' ? (inp.value ? +inp.value : null) : inp.value;
      });
    });

    container.querySelectorAll('[data-ln-inc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.lnInc;
        _lineas[i].inc = (_lineas[i].inc !== null && _lineas[i].inc !== undefined) ? null : '';
        renderLineas();
      });
    });

    container.querySelectorAll('[data-ln-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        _lineas.splice(+btn.dataset.lnDel, 1);
        renderLineas();
      });
    });
  }

  renderLineas();

  document.getElementById('btn-add-linea').addEventListener('click', () => {
    _lineas.push({ desc: '', qty: null, inc: null });
    renderLineas();
    setTimeout(() => {
      const inputs = document.querySelectorAll('#lineas-list input[data-field="desc"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 50);
  });

  // Guardar
  document.getElementById('btn-alb-save').addEventListener('click', async () => {
    const saved = await doSave(alb, _terminal, _estado);
    if (saved) {
      await generatePDF(saved, _photos);
      await renderLista();
    }
  });

  document.getElementById('btn-alb-pdf')?.addEventListener('click', async () => {
    if (!alb) return;
    await generatePDF(alb, _photos);
  });

  document.getElementById('btn-alb-delete')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar el albarán ${alb?.numero}?`)) return;
    await removeAlb(alb.id);
    toast('Albarán eliminado', 'amber');
    await renderLista();
  });
}

function termBtn(t, active) {
  const c = TERM_COLORS[t];
  return `<button data-term="${t}" style="
    flex:1;padding:12px;border-radius:var(--radius-md);font-size:0.85rem;font-weight:800;
    background:${active ? c.bg : c.bgOff};
    color:${active ? c.color : c.colorOff}">
    • Term. ${t}
  </button>`;
}

function estadoBtn(val, label, color, bg, active) {
  return `<button data-estado="${val}" style="
    padding:14px;border-radius:var(--radius-md);font-size:0.85rem;font-weight:700;
    border:2px solid ${active ? color : 'var(--separator)'};
    background:${active ? bg : 'var(--surface)'};
    color:${active ? color : 'var(--text3)'}">
    ${label}
  </button>`;
}

function setEstadoStyle(btn, active, color, bg) {
  btn.style.borderColor = active ? color : 'var(--separator)';
  btn.style.background  = active ? bg    : 'var(--surface)';
  btn.style.color       = active ? color : 'var(--text3)';
}

async function doSave(existing, terminal, estado) {
  const numero    = document.getElementById('alb-numero').value.trim();
  const nombre    = document.getElementById('alb-nombre').value.trim();
  const proveedor = document.getElementById('alb-proveedor').value.trim();
  const notas     = document.getElementById('alb-notas')?.value.trim() || '';

  if (!numero) { toast('Introduce el número de albarán', 'red'); return null; }
  if (!nombre) { toast('Introduce tu nombre', 'red'); return null; }

  const id  = existing?.id || Date.now();
  const lineas = _lineas.filter(l => l.desc?.trim());
  const obj = { id, numero, nombre, proveedor, terminal, estado, notas, lineas, fecha: new Date().toISOString() };

  await saveAlb(obj);
  if (_photos.length) await savePhoto(id, _photos);
  localStorage.setItem('ic_user', nombre);
  localStorage.setItem('itr', terminal);
  toast('Albarán guardado', 'green');
  return obj;
}

// ── PDF ───────────────────────────────────────────────────────────
async function generatePDF(alb, photos) {
  try {
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src    = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
    const W    = doc.internal.pageSize.getWidth();
    const H    = doc.internal.pageSize.getHeight();
    const isInc = alb.estado === 'incidencia';
    const [hR, hG, hB] = isInc ? [255, 69, 58] : [10, 132, 255];

    const drawHeader = (pageNum, total) => {
      doc.setFillColor(hR, hG, hB);
      doc.rect(0, 0, W, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18); doc.setFont(undefined, 'bold');
      doc.text('ALBARÁN CPB', 14, 12);
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      doc.text(`Nº ${alb.numero}${isInc ? '  ⚠ INCIDENCIA' : ''}`, 14, 21);
      doc.text(`${new Date(alb.fecha).toLocaleDateString('es')}  ${pageNum}/${total}`, W - 14, 21, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    };

    const photoList = Array.isArray(photos) ? photos.filter(Boolean) : (photos ? [photos] : []);
    const totalPages = Math.max(1, photoList.length);

    // Pág. 1 — datos del albarán
    drawHeader(1, totalPages);
    let y = 38;
    const campo = (label, val) => {
      doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
      doc.text(label, 14, y);
      doc.setFont(undefined, 'normal');
      doc.text(String(val || '—'), 55, y);
      y += 7;
    };
    campo('Terminal:', `Terminal ${alb.terminal}`);
    campo('Revisado por:', alb.nombre);
    campo('Proveedor:', alb.proveedor || 'No especificado');
    campo('Estado:', isInc ? '⚠ INCIDENCIA' : '✓ CONFORME');
    if (alb.notas) campo('Notas:', alb.notas);

    // Líneas del albarán
    const lineas = (alb.lineas || []).filter(l => l.desc?.trim());
    if (lineas.length) {
      y += 3;
      doc.setFontSize(8.5); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('ARTÍCULOS DEL ALBARÁN:', 14, y); y += 5;
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);
      doc.line(14, y, W - 14, y); y += 4;

      lineas.forEach(ln => {
        if (y > H - 40) return;
        const hasInc = ln.inc !== null && ln.inc !== undefined;
        doc.setTextColor(hasInc ? 255 : 0, hasInc ? 69 : 0, hasInc ? 58 : 0);
        doc.setFont(undefined, hasInc ? 'bold' : 'normal');
        doc.setFontSize(8);
        const qty = ln.qty != null ? `  ×${ln.qty}` : '';
        doc.text(`${hasInc ? '⚠ ' : '• '}${ln.desc}${qty}`, 18, y, { maxWidth: W - 32 });
        y += 5;
        if (hasInc && ln.inc) {
          doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
          doc.text(`    ${ln.inc}`, 18, y, { maxWidth: W - 32 });
          y += 4.5;
        }
      });
      doc.setTextColor(0, 0, 0);
      y += 4;
    }

    // Primera foto en la pág. de datos (si existe)
    if (photoList.length > 0) {
      y += 4;
      try {
        const src  = photoList[0];
        const img  = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const maxW = W - 28;
        const maxH = H - y - 14;
        const ratio = img.naturalHeight / img.naturalWidth;
        const iH    = Math.min(maxW * ratio, maxH);
        const iW    = iH / ratio;
        doc.addImage(src, 'JPEG', 14, y, iW, iH);
      } catch { /* foto no cargó */ }
    }

    // Páginas adicionales — una foto por página
    for (let p = 1; p < photoList.length; p++) {
      doc.addPage();
      drawHeader(p + 1, totalPages);
      try {
        const src  = photoList[p];
        const img  = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const maxW = W - 28;
        const maxH = H - 42;
        const ratio = img.naturalHeight / img.naturalWidth;
        const iH    = Math.min(maxW * ratio, maxH);
        const iW    = iH / ratio;
        doc.addImage(src, 'JPEG', 14, 34, iW, iH);
      } catch { /* foto no cargó */ }
    }

    const d    = new Date(alb.fecha);
    const fecha = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    const nombre = (alb.nombre || '').replace(/\s+/g, '_');
    doc.save(`albaran_${alb.terminal}_${nombre}_${fecha}.pdf`);
    toast('PDF generado ✓', 'green');
  } catch (err) {
    toast('Error al generar PDF', 'red');
    console.error(err);
  }
}

// ── Editor de perspectiva (estilo CamScanner) ─────────────────────────
function openCropEditor(imgSrc, onDone) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:900;display:flex;flex-direction:column;touch-action:none';
  ov.innerHTML = `
    <div style="background:#1C1C1E;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <button id="c-cancel" style="color:#0A84FF;font-size:0.9rem">Cancelar</button>
      <span style="color:#fff;font-size:0.85rem;font-weight:700">Ajustar foto</span>
      <button id="c-apply" style="color:#0A84FF;font-size:0.9rem;font-weight:700">Aplicar</button>
    </div>
    <div id="c-wrap" style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#111">
      <img id="c-img" src="${imgSrc}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;user-select:none">
      <canvas id="c-cvs" style="position:absolute;touch-action:none"></canvas>
    </div>
    <div style="background:#1C1C1E;padding:10px;display:flex;align-items:center;justify-content:center;gap:16px;flex-shrink:0">
      <button id="c-auto" style="color:#0A84FF;font-size:0.78rem;font-weight:700;padding:6px 14px;background:rgba(10,132,255,0.15);border-radius:20px">🔍 Auto-detectar</button>
      <span style="color:#666;font-size:0.68rem">Arrastra las esquinas para ajustar</span>
    </div>`;
  document.body.appendChild(ov);

  const img = ov.querySelector('#c-img');
  const cvs = ov.querySelector('#c-cvs');
  const ctx = cvs.getContext('2d');

  const init = () => {
    const ir = img.getBoundingClientRect();
    const wr = ov.querySelector('#c-wrap').getBoundingClientRect();
    // Position canvas exactly over the image
    cvs.width  = ir.width;
    cvs.height = ir.height;
    cvs.style.cssText = `position:absolute;left:${ir.left - wr.left}px;top:${ir.top - wr.top}px;width:${ir.width}px;height:${ir.height}px;touch-action:none`;

    const pad = 18;
    const corners = [
      { x: pad,            y: pad },
      { x: ir.width - pad, y: pad },
      { x: ir.width - pad, y: ir.height - pad },
      { x: pad,            y: ir.height - pad },
    ];
    const R = 18;
    let drag = -1;

    function draw() {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      // Dim outside quad
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const c of corners) ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Border
      ctx.strokeStyle = '#0A84FF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const c of corners) ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.stroke();
      // Handles
      corners.forEach((c, i) => {
        ctx.fillStyle   = i === drag ? '#ffffff' : '#0A84FF';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    function pt(e) {
      const r = cvs.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function nearest(p) {
      for (let i = 0; i < 4; i++)
        if (Math.hypot(corners[i].x - p.x, corners[i].y - p.y) < R + 8) return i;
      return -1;
    }

    cvs.addEventListener('mousedown',  e => { drag = nearest(pt(e)); draw(); });
    cvs.addEventListener('touchstart', e => { e.preventDefault(); drag = nearest(pt(e)); draw(); }, { passive: false });
    cvs.addEventListener('mousemove',  e => { if (drag < 0) return; Object.assign(corners[drag], pt(e)); draw(); });
    cvs.addEventListener('touchmove',  e => { e.preventDefault(); if (drag < 0) return; Object.assign(corners[drag], pt(e)); draw(); }, { passive: false });
    cvs.addEventListener('mouseup',  () => { drag = -1; draw(); });
    cvs.addEventListener('touchend', () => { drag = -1; draw(); });

    draw();

    ov.querySelector('#c-auto').addEventListener('click', () => {
      const detected = autoDetectCorners(img, ir.width, ir.height);
      detected.forEach((p, i) => { corners[i].x = p.x; corners[i].y = p.y; });
      draw();
    });

    ov.querySelector('#c-apply').addEventListener('click', async () => {
      const btn = ov.querySelector('#c-apply');
      btn.textContent = '…'; btn.disabled = true;
      await new Promise(r => setTimeout(r, 40));
      const scaleX = img.naturalWidth  / ir.width;
      const scaleY = img.naturalHeight / ir.height;
      const result = perspectiveCorrect(img, corners.map(c => [c.x * scaleX, c.y * scaleY]));
      document.body.removeChild(ov);
      onDone(result);
    });
  };

  img.complete ? init() : (img.onload = init);
  ov.querySelector('#c-cancel').addEventListener('click', () => document.body.removeChild(ov));
}

function perspectiveCorrect(img, srcPts) {
  // srcPts: [[x,y] x4] TL,TR,BR,BL in natural image coords
  // Forzar proporción A4 portrait (210:297)
  const detectedW = Math.round(Math.hypot(srcPts[1][0]-srcPts[0][0], srcPts[1][1]-srcPts[0][1]));
  const outW = detectedW;
  const outH = Math.round(detectedW * (297 / 210)); // A4 portrait siempre

  // Cap output to 1600px max for performance
  const maxDim = 1600;
  const outScale = Math.min(1, maxDim / Math.max(outW, outH));
  const finalW = Math.round(outW * outScale);
  const finalH = Math.round(outH * outScale);

  // Scale source to 2000px max for sampling
  const maxSrc = 2000;
  const srcScale = Math.min(1, maxSrc / Math.max(img.naturalWidth, img.naturalHeight));
  const sampW = Math.round(img.naturalWidth  * srcScale);
  const sampH = Math.round(img.naturalHeight * srcScale);

  const srcC = document.createElement('canvas');
  srcC.width = sampW; srcC.height = sampH;
  srcC.getContext('2d').drawImage(img, 0, 0, sampW, sampH);
  const srcD = srcC.getContext('2d').getImageData(0, 0, sampW, sampH).data;

  const scaledSrc = srcPts.map(([x, y]) => [x * srcScale, y * srcScale]);
  const dstPts = [[0,0],[finalW,0],[finalW,finalH],[0,finalH]];
  const H = computeH(dstPts, scaledSrc);

  const outC = document.createElement('canvas');
  outC.width = finalW; outC.height = finalH;
  const outCtx = outC.getContext('2d');
  const outD = outCtx.createImageData(finalW, finalH);

  for (let y = 0; y < finalH; y++) {
    for (let x = 0; x < finalW; x++) {
      const w   = H[6]*x + H[7]*y + H[8];
      const sxf = (H[0]*x + H[1]*y + H[2]) / w;
      const syf = (H[3]*x + H[4]*y + H[5]) / w;
      if (sxf < 0 || syf < 0 || sxf >= sampW - 1 || syf >= sampH - 1) continue;
      const x0 = sxf | 0, y0 = syf | 0;
      const fx = sxf - x0, fy = syf - y0;
      const fx1 = 1 - fx, fy1 = 1 - fy;
      const i00 = (y0       * sampW + x0)     * 4;
      const i10 = (y0       * sampW + x0 + 1) * 4;
      const i01 = ((y0 + 1) * sampW + x0)     * 4;
      const i11 = ((y0 + 1) * sampW + x0 + 1) * 4;
      const di  = (y * finalW + x) * 4;
      outD.data[di]   = (srcD[i00]   * fx1*fy1 + srcD[i10]   * fx*fy1 + srcD[i01]   * fx1*fy + srcD[i11]   * fx*fy + 0.5) | 0;
      outD.data[di+1] = (srcD[i00+1] * fx1*fy1 + srcD[i10+1] * fx*fy1 + srcD[i01+1] * fx1*fy + srcD[i11+1] * fx*fy + 0.5) | 0;
      outD.data[di+2] = (srcD[i00+2] * fx1*fy1 + srcD[i10+2] * fx*fy1 + srcD[i01+2] * fx1*fy + srcD[i11+2] * fx*fy + 0.5) | 0;
      outD.data[di+3] = 255;
    }
  }
  outCtx.putImageData(outD, 0, 0);
  return outC.toDataURL('image/jpeg', 0.88);
}

function computeH(src, dst) {
  // 8x8 DLT homography: maps src points to dst points
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u*x, -u*y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v*x, -v*y]); b.push(v);
  }
  const h = gaussElim(A, b);
  return [...h, 1];
}

// ── Auto-detección de esquinas del documento ──────────────────────
function autoDetectCorners(img, displayW, displayH) {
  // Downscale para procesar rápido
  const S = 600;
  const scale = Math.min(1, S / Math.max(img.naturalWidth, img.naturalHeight));
  const W = (img.naturalWidth  * scale) | 0;
  const H = (img.naturalHeight * scale) | 0;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').drawImage(img, 0, 0, W, H);
  const px = c.getContext('2d').getImageData(0, 0, W, H).data;

  // Grayscale
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++)
    gray[i] = 0.299*px[i*4] + 0.587*px[i*4+1] + 0.114*px[i*4+2];

  // Gaussian 3×3
  const blur = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      blur[y*W+x] = (
        gray[(y-1)*W+(x-1)] + 2*gray[(y-1)*W+x] + gray[(y-1)*W+(x+1)] +
        2*gray[y*W+(x-1)]   + 4*gray[y*W+x]     + 2*gray[y*W+(x+1)] +
        gray[(y+1)*W+(x-1)] + 2*gray[(y+1)*W+x] + gray[(y+1)*W+(x+1)]
      ) / 16;
    }
  }

  // Sobel magnitude
  const edges = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const gx = -blur[(y-1)*W+(x-1)] + blur[(y-1)*W+(x+1)]
                 -2*blur[y*W+(x-1)]   + 2*blur[y*W+(x+1)]
                 -blur[(y+1)*W+(x-1)] + blur[(y+1)*W+(x+1)];
      const gy = -blur[(y-1)*W+(x-1)] - 2*blur[(y-1)*W+x] - blur[(y-1)*W+(x+1)]
                 +blur[(y+1)*W+(x-1)] + 2*blur[(y+1)*W+x] + blur[(y+1)*W+(x+1)];
      edges[y*W+x] = Math.sqrt(gx*gx + gy*gy);
    }
  }

  // Proyecciones (ignorar 5% del borde para evitar el marco de la foto)
  const mX = (W * 0.05) | 0, mY = (H * 0.05) | 0;
  const rowSum = new Float32Array(H);
  const colSum = new Float32Array(W);
  for (let y = mY; y < H-mY; y++)
    for (let x = mX; x < W-mX; x++) {
      rowSum[y] += edges[y*W+x];
      colSum[x] += edges[y*W+x];
    }

  // Pico de cada proyección en su mitad correspondiente
  const peak = (arr, from, to) => {
    let maxV = 0, maxI = from;
    for (let i = from; i < to; i++) if (arr[i] > maxV) { maxV = arr[i]; maxI = i; }
    return maxI;
  };
  const topRow    = peak(rowSum, mY,            (H * 0.50) | 0);
  const bottomRow = peak(rowSum, (H * 0.50)|0,   H - mY);
  const leftCol   = peak(colSum, mX,            (W * 0.50) | 0);
  const rightCol  = peak(colSum, (W * 0.50)|0,   W - mX);

  // Convertir a coordenadas del canvas de visualización
  const sx = displayW / W, sy = displayH / H;
  return [
    { x: leftCol  * sx, y: topRow    * sy },  // TL
    { x: rightCol * sx, y: topRow    * sy },  // TR
    { x: rightCol * sx, y: bottomRow * sy },  // BR
    { x: leftCol  * sx, y: bottomRow * sy },  // BL
  ];
}

function gaussElim(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let max = col;
    for (let r = col+1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[max][col])) max = r;
    [M[col], M[max]] = [M[max], M[col]];
    for (let r = col+1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n-1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i+1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}
