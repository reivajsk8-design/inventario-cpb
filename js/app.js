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
import { toast } from './ui.js';
import { showTutorial } from './tutorial.js';

const TABS = {
  lista:    { mount: mountLista,    unmount: unmountLista,    title: 'Inventario CPB' },
  conteos:  { mount: mountConteos,  unmount: unmountConteos,  title: 'Conteos'        },
  pedidos:  { mount: mountPedidos,  unmount: unmountPedidos,  title: 'Pedidos'        },
  albaranes:{ mount: mountAlbaranes,unmount: unmountAlbaranes,title: 'Albaranes'      },
  resumen:  { mount: mountResumen,  unmount: unmountResumen,  title: 'Resumen'        },
};

let _currentTab = null;

async function init() {
  await openDB();
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
