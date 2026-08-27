// js/tutorial.js
const SLIDES = [
  {
    icon: '🏪',
    accent: '#0A84FF',
    title: 'Inventario CPB',
    body: 'Gestiona conteos, pedidos y albaranes desde el móvil de forma rápida y sin papel.',
  },
  {
    icon: '📋',
    accent: '#0A84FF',
    tab: 'Lista',
    title: 'Lista de productos',
    body: 'Busca por nombre, REF, EAN o familia. Toca un artículo para contarlo o pedirlo.<br><br>Con el botón <strong style="color:#FF9F0A">✦ +</strong> puedes crear artículos nuevos.',
  },
  {
    icon: '🔢',
    accent: '#30D158',
    tab: 'Conteos',
    title: 'Conteos',
    body: 'Selecciona tu terminal (D, MSC o E) y toca los artículos para registrar cuántas unidades hay en almacén.',
  },
  {
    icon: '🛒',
    accent: '#FF9F0A',
    tab: 'Pedidos',
    title: 'Pedidos',
    body: 'Escanea el código de barras o busca en la lista para añadir al pedido. Toca cualquier artículo para cambiar la cantidad.',
  },
  {
    icon: '🚚',
    accent: '#FF453A',
    tab: 'Albaranes',
    title: 'Albaranes',
    body: 'Fotografía el albarán y ajusta la perspectiva. Marca cada línea con incidencias si hay algún problema. Exporta en PDF.',
  },
  {
    icon: '📊',
    accent: '#30D158',
    tab: 'Resumen',
    title: 'Resumen y exports',
    body: 'Consulta las estadísticas y descarga los Excel de inventario, pedidos y artículos nuevos. Aquí también puedes hacer el reset.',
    last: true,
  },
];

const KEY = 'ic_tutorial_done';

export function showTutorial({ force = false } = {}) {
  if (!force && localStorage.getItem(KEY)) return;
  _mount();
}

function _mount() {
  document.getElementById('tutorial-overlay')?.remove();

  let current = 0;
  let startX  = 0;

  const el = document.createElement('div');
  el.id = 'tutorial-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="tut-topbar">
      <button class="tut-skip" aria-label="Saltar tutorial">Saltar</button>
    </div>
    <div class="tut-slides"></div>
    <div class="tut-footer">
      <div class="tut-dots"></div>
      <button class="tut-next"></button>
    </div>
  `;
  document.body.appendChild(el);

  const slidesEl = el.querySelector('.tut-slides');
  const dotsEl   = el.querySelector('.tut-dots');
  const nextBtn  = el.querySelector('.tut-next');

  const draw = () => {
    const s = SLIDES[current];
    el.style.setProperty('--tut-accent', s.accent);

    slidesEl.innerHTML = `
      <div class="tut-slide">
        ${current === 0 ? '<img class="tut-logo" src="icons/cpb-logo.png" alt="Comerciants del Port de Barcelona">' : `<div class="tut-icon-wrap"><span class="tut-icon">${s.icon}</span></div>`}
        ${s.tab ? `<div class="tut-tab-badge">${s.tab}</div>` : ''}
        <div class="tut-title">${s.title}</div>
        <div class="tut-body">${s.body}</div>
      </div>
    `;

    dotsEl.innerHTML = SLIDES.map((_, i) =>
      `<span class="tut-dot${i === current ? ' on' : ''}"></span>`
    ).join('');

    if (s.last) {
      nextBtn.textContent  = '¡Empezar!';
      nextBtn.className    = 'tut-next tut-next--last';
    } else {
      nextBtn.textContent  = 'Siguiente →';
      nextBtn.className    = 'tut-next';
    }
  };

  draw();

  el.querySelector('.tut-skip').addEventListener('click', dismiss);

  nextBtn.addEventListener('click', () => {
    if (current < SLIDES.length - 1) { current++; draw(); }
    else dismiss();
  });

  el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && current < SLIDES.length - 1) { current++; draw(); }
    else if (dx > 0 && current > 0)             { current--; draw(); }
  });

  function dismiss() {
    localStorage.setItem(KEY, '1');
    el.classList.add('tut-exit');
    setTimeout(() => el.remove(), 300);
  }
}
