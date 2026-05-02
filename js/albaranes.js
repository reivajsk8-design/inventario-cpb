// js/albaranes.js
import { openDB } from './db.js';
import { toast }  from './ui.js';

const TERMINALS = ['D', 'MSC', 'E'];
let _photo = null;

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
  return rec?.data ?? null;
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
      _photo    = await getPhoto(id);
      if (alb) renderForm(alb);
    });
  });

  document.getElementById('fab-alb').addEventListener('click', () => {
    _photo = null;
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
  return `
    <div class="prod-item" data-alb="${alb.id}" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="prod-name">Alb. ${alb.numero || '—'}</div>
        <div class="prod-meta">${alb.terminal} · ${alb.nombre} · ${fecha}</div>
        ${alb.proveedor ? `<div class="prod-meta">${alb.proveedor}</div>` : ''}
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

      <div class="qty-label" style="margin-bottom:8px">FOTO DEL ALBARÁN</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <label style="background:var(--surface);border:1px solid var(--separator);border-radius:var(--radius-md);padding:18px 10px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px">
          <span style="font-size:1.5rem">📁</span>
          <span style="font-size:0.72rem;color:var(--text2);font-weight:600">Subir foto</span>
          <input type="file" accept="image/*" id="inp-gallery" style="display:none">
        </label>
        <label style="background:var(--surface);border:1px solid var(--separator);border-radius:var(--radius-md);padding:18px 10px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px">
          <span style="font-size:1.5rem">📷</span>
          <span style="font-size:0.72rem;color:var(--text2);font-weight:600">Tomar foto</span>
          <input type="file" accept="image/*" capture="environment" id="inp-camera" style="display:none">
        </label>
      </div>
      <div id="photo-preview" style="${_photo ? '' : 'display:none'};margin-bottom:6px">
        ${_photo ? `<img src="${_photo}" style="width:100%;border-radius:var(--radius-md);max-height:240px;object-fit:cover">` : ''}
      </div>
      <button id="btn-adjust-photo" style="display:${_photo ? 'block' : 'none'};width:100%;
        background:rgba(10,132,255,0.1);border-radius:10px;padding:9px;
        color:var(--accent);font-size:0.78rem;font-weight:700;margin-bottom:10px">
        ✂️ Ajustar foto (perspectiva)
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
        b.style.borderColor = on ? 'var(--accent)' : 'var(--separator)';
        b.style.background  = on ? 'rgba(10,132,255,0.1)' : 'var(--surface)';
        b.style.color       = on ? 'var(--accent)' : 'var(--text3)';
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

  // Foto
  ['inp-gallery', 'inp-camera'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        _photo = ev.target.result;
        showPhotoPreview(_photo);
      };
      reader.readAsDataURL(file);
    });
  });

  function showPhotoPreview(src) {
    const prev = document.getElementById('photo-preview');
    const adj  = document.getElementById('btn-adjust-photo');
    prev.style.display = '';
    prev.innerHTML = `<img src="${src}" style="width:100%;border-radius:var(--radius-md);max-height:240px;object-fit:cover">`;
    if (adj) adj.style.display = 'block';
  }

  document.getElementById('btn-adjust-photo')?.addEventListener('click', () => {
    if (!_photo) return;
    openCropEditor(_photo, corrected => {
      _photo = corrected;
      showPhotoPreview(_photo);
      toast('Foto ajustada ✓', 'green');
    });
  });

  // Guardar
  document.getElementById('btn-alb-save').addEventListener('click', async () => {
    const saved = await doSave(alb, _terminal, _estado);
    if (saved) {
      await generatePDF(saved, _photo);
      await renderLista();
    }
  });

  document.getElementById('btn-alb-pdf')?.addEventListener('click', async () => {
    if (!alb) return;
    await generatePDF(alb, _photo);
  });

  document.getElementById('btn-alb-delete')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar el albarán ${alb?.numero}?`)) return;
    await removeAlb(alb.id);
    toast('Albarán eliminado', 'amber');
    await renderLista();
  });
}

function termBtn(t, active) {
  return `<button data-term="${t}" style="
    flex:1;padding:12px;border-radius:var(--radius-md);font-size:0.85rem;font-weight:800;
    border:2px solid ${active ? 'var(--accent)' : 'var(--separator)'};
    background:${active ? 'rgba(10,132,255,0.1)' : 'var(--surface)'};
    color:${active ? 'var(--accent)' : 'var(--text3)'}">
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
  const obj = { id, numero, nombre, proveedor, terminal, estado, notas, fecha: new Date().toISOString() };

  await saveAlb(obj);
  if (_photo) await savePhoto(id, _photo);
  localStorage.setItem('ic_user', nombre);
  localStorage.setItem('itr', terminal);
  toast('Albarán guardado', 'green');
  return obj;
}

// ── PDF ───────────────────────────────────────────────────────────
async function generatePDF(alb, photoData) {
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
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W   = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(10, 132, 255);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    doc.text('ALBARÁN CPB', 14, 12);
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text(`Nº ${alb.numero}`, 14, 21);
    doc.setFontSize(10);
    doc.text(new Date(alb.fecha).toLocaleDateString('es'), W - 14, 21, { align: 'right' });

    // Datos
    doc.setTextColor(0, 0, 0);
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
    campo('Estado:', alb.estado === 'conforme' ? '✓ CONFORME' : '⚠ INCIDENCIA');
    if (alb.notas) { campo('Notas:', alb.notas); }

    // Foto
    if (photoData) {
      y += 4;
      try {
        const img   = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = photoData; });
        const maxW  = W - 28;
        const iH    = Math.min(maxW * (img.height / img.width), 160);
        doc.addImage(photoData, 'JPEG', 14, y, maxW, iH);
      } catch { /* foto no cargó */ }
    }

    const fecha = new Date(alb.fecha).toISOString().slice(0, 10);
    doc.save(`albaran_${alb.numero}_${alb.terminal}_${fecha}.pdf`);
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
    <div style="background:#1C1C1E;padding:10px;text-align:center;flex-shrink:0">
      <span style="color:#888;font-size:0.7rem">Arrastra las esquinas para ajustar el documento</span>
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
  const outW = Math.round(Math.hypot(srcPts[1][0]-srcPts[0][0], srcPts[1][1]-srcPts[0][1]));
  const outH = Math.round(Math.hypot(srcPts[3][0]-srcPts[0][0], srcPts[3][1]-srcPts[0][1]));

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
      const w  = H[6]*x + H[7]*y + H[8];
      const sx = Math.round((H[0]*x + H[1]*y + H[2]) / w);
      const sy = Math.round((H[3]*x + H[4]*y + H[5]) / w);
      if (sx < 0 || sy < 0 || sx >= sampW || sy >= sampH) continue;
      const si = (sy * sampW + sx) * 4;
      const di = (y  * finalW + x) * 4;
      outD.data[di]   = srcD[si];
      outD.data[di+1] = srcD[si+1];
      outD.data[di+2] = srcD[si+2];
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
