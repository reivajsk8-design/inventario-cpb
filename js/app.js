// js/app.js
import { openDB, getAllProducts, loadProductsFromNetwork,
         saveProductsToDB, getStoredDBVersion,
         setStoredDBVersion, fetchRemoteVersion } from './db.js';
import { loadEansExtra } from './eans.js';
import { mount as mountLista,    unmount as unmountLista    } from './lista.js';
import { mount as mountConteos,  unmount as unmountConteos  } from './conteos.js';
import { mount as mountPedidos,  unmount as unmountPedidos  } from './pedidos.js';
import { mount as mountResumen,   unmount as unmountResumen   } from './resumen.js';
import { mount as mountAlbaranes, unmount as unmountAlbaranes } from './albaranes.js';
import { toast, closeSheet } from './ui.js';
import { closeCamera } from './camera-scanner.js';
import { showTutorial } from './tutorial.js';

const TABS = {
  lista:    { mount: mountLista,    unmount: unmountLista,    title: 'Inventario CPB' },
  conteos:  { mount: mountConteos,  unmount: unmountConteos,  title: 'Conteos'        },
  pedidos:  { mount: mountPedidos,  unmount: unmountPedidos,  title: 'Pedidos'        },
  albaranes:{ mount: mountAlbaranes,unmount: unmountAlbaranes,title: 'Albaranes'      },
  resumen:  { mount: mountResumen,  unmount: unmountResumen,  title: 'Resumen'        },
};

let _currentTab = null;

function ensureUserName() {
  return new Promise(resolve => {
    const saved = (localStorage.getItem('ic_user') || '').trim();
    if (saved) { resolve(); return; }

    const el = document.createElement('div');
    el.id = 'welcome-overlay';
    el.style.setProperty('--tut-accent', '#0A84FF');
    el.innerHTML = `
      <div class="tut-slides">
        <div class="tut-slide">
          <div class="tut-icon-wrap"><span class="tut-icon">👤</span></div>
          <div class="tut-title">¿Cómo te llamas?</div>
          <div class="tut-body">Tu nombre quedará registrado en los exports de conteos, pedidos y albaranes.</div>
          <input id="welcome-name" type="text" autocomplete="name" autocapitalize="words"
            placeholder="Tu nombre…"
            style="width:100%;background:var(--surface2);border-radius:14px;
                   padding:14px 16px;color:var(--text);font-size:1rem;font-weight:600;
                   text-align:center;margin-top:8px">
        </div>
      </div>
      <div class="tut-footer">
        <div></div>
        <button id="welcome-ok" class="tut-next tut-next--last"
          style="opacity:0.4" disabled>Continuar →</button>
      </div>
    `;
    document.body.appendChild(el);

    const inp = document.getElementById('welcome-name');
    const btn = document.getElementById('welcome-ok');

    inp.addEventListener('input', () => {
      const ok = inp.value.trim().length > 0;
      btn.disabled      = !ok;
      btn.style.opacity = ok ? '1' : '0.4';
    });

    const confirm = () => {
      const name = inp.value.trim();
      if (!name) return;
      localStorage.setItem('ic_user', name);
      el.classList.add('tut-exit');
      setTimeout(() => { el.remove(); resolve(); }, 300);
    };

    btn.addEventListener('click', confirm);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    setTimeout(() => inp.focus(), 100);
  });
}

function initBackGuard() {
  const _guardUrl = location.pathname + location.search + '#_bg';
  history.pushState({ backGuard: true }, '', _guardUrl);
  let _pending = false;
  let _timer   = null;
  let _exiting = false;

  window.addEventListener('popstate', () => {
    if (_exiting) return;

    if (!document.getElementById('cam-scanner-overlay').classList.contains('hidden')) {
      closeCamera();
      history.pushState({ backGuard: true }, '', _guardUrl);
      return;
    }
    if (!document.getElementById('sheet-overlay').classList.contains('hidden')) {
      closeSheet();
      history.pushState({ backGuard: true }, '', _guardUrl);
      return;
    }

    if (_pending) {
      _pending = false;
      clearTimeout(_timer);
      _exiting = true;
      setTimeout(() => history.go(-1), 0);
      return;
    }

    _pending = true;
    clearTimeout(_timer);
    _timer = setTimeout(() => { _pending = false; }, 2000);
    toast('Pulsa atrás de nuevo para salir', '', 2000);
    history.pushState({ backGuard: true }, '', _guardUrl);
  });
}

async function init() {
  await openDB();
  await ensureUserName();
  await loadEansExtra();

  const products = await getAllProducts();
  if (products.length === 0) {
    showLoading('Cargando base de datos…');
    await loadAndSaveDB();
    hideLoading();
  }

  checkDBVersion().catch(err => console.warn('checkDBVersion failed:', err));

  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  document.getElementById('btn-update-db').addEventListener('click', async () => {
    document.getElementById('update-banner').classList.add('hidden');
    showLoading('Actualizando base de datos…');
    await loadAndSaveDB();
    hideLoading();
    toast('Base de datos actualizada', 'green');
    if (_currentTab) TABS[_currentTab]?.mount();
  });

  const helpBtn = document.getElementById('btn-nav-right');
  helpBtn.textContent      = '?';
  helpBtn.title            = 'Ver tutorial';
  helpBtn.onclick          = () => showTutorial({ force: true });
  helpBtn._tutorialHandler = helpBtn.onclick;

  switchTab('lista');
  showTutorial();
  initBackGuard();
}

function switchTab(tab) {
  if (!TABS[tab]) { console.warn('Unknown tab:', tab); return; }
  if (_currentTab === tab) return;
  if (_currentTab && TABS[_currentTab]) TABS[_currentTab].unmount();

  _currentTab = tab;
  document.querySelectorAll('.tab-item').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('nav-title').textContent = TABS[tab].title;

  TABS[tab].mount();
}

async function loadAndSaveDB() {
  const products = await loadProductsFromNetwork();
  await saveProductsToDB(products);
  const ver = await fetchRemoteVersion();
  if (ver) await setStoredDBVersion(ver);
}

async function checkDBVersion() {
  const [stored, remote] = await Promise.all([getStoredDBVersion(), fetchRemoteVersion()]);
  if (remote && stored && remote !== stored) {
    document.getElementById('update-banner').classList.remove('hidden');
  }
}

function showLoading(msg) {
  document.getElementById('main').innerHTML = `
    <div class="empty-state">
      <div class="icon" style="animation:spin 1s linear infinite">⏳</div>
      <p>${msg}</p>
    </div>`;
}
function hideLoading() {
  document.getElementById('main').innerHTML = '';
}

function renderStub(icon, title, msg) {
  document.getElementById('main').innerHTML = `
    <div class="empty-state">
      <div class="icon">${icon}</div>
      <p style="font-weight:700;font-size:0.9rem;color:var(--text)">${title}</p>
      <p>${msg}</p>
    </div>`;
}

const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);

init().catch(err => {
  document.getElementById('main').innerHTML =
    `<div class="empty-state"><div class="icon">⚠️</div><p>Error al arrancar: ${err.message}</p></div>`;
  console.error(err);
});
