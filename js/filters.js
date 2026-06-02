// js/filters.js
import { getExtraEans } from './eans.js';

function norm(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function filterProducts(products, query, filterType, families) {
  const q = norm(query.trim());
  return products.filter(p => {
    if (families.length > 0 && !families.includes(p.family)) return false;
    if (!q) return true;
    if (filterType === 'ean')     return (p.ean ?? '').includes(q) || getExtraEans(p.ref).some(e => e.includes(q));
    if (filterType === 'ref')     return norm(p.ref).includes(q);
    if (filterType === 'family')  return norm(p.family).includes(q);
    if (filterType === 'proxium') return norm(p.proxium).includes(q);
    return norm(p.name).includes(q) ||
           norm(p.ref).includes(q)  ||
           (p.ean ?? '').includes(q) ||
           getExtraEans(p.ref).some(e => e.includes(q)) ||
           norm(p.family).includes(q) ||
           norm(p.proxium).includes(q);
  });
}

const FILTER_TYPES = [
  { id: 'all',     label: 'Todo'    },
  { id: 'ean',     label: 'EAN'     },
  { id: 'ref',     label: 'REF'     },
  { id: 'family',  label: 'Familia' },
  { id: 'proxium', label: 'PROXIUM' },
];

export function mountFilterBar(families, onChange) {
  const el = document.getElementById('filter-bar');
  el.classList.remove('hidden');

  let state = { query: '', filterType: 'all', families: [] };
  const emit = () => onChange({ ...state });

  el.innerHTML = `
    <div class="search-input-wrap">
      <span class="search-icon">🔍</span>
      <input id="fb-input" type="search" autocomplete="off" autocorrect="off"
             spellcheck="false" placeholder="EAN · REF · Familia · PROXIUM…">
      <span class="search-scan" id="fb-scan" title="Escanear EAN"><!-- Heroicons v2 MIT: viewfinder-circle -->
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;display:block">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
        </svg>
      </span>
    </div>
    <div class="filter-type-tabs" id="fb-types">
      ${FILTER_TYPES.map(t =>
        `<button class="ftt-item${t.id==='all'?' active':''}" data-type="${t.id}">${t.label}</button>`
      ).join('')}
    </div>
    <div class="chip-row" id="fb-chips">
      <button class="chip on" data-fam="">Todos</button>
      ${families.map(f =>
        `<button class="chip off" data-fam="${f}">${f}</button>`
      ).join('')}
    </div>
  `;

  el.querySelector('#fb-input').addEventListener('input', e => {
    state.query = e.target.value;
    emit();
  });

  el.querySelector('#fb-types').addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.filterType = btn.dataset.type;
    el.querySelectorAll('.ftt-item').forEach(b => b.classList.toggle('active', b === btn));
    emit();
  });

  el.querySelector('#fb-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-fam]');
    if (!btn) return;
    const fam = btn.dataset.fam;
    if (fam === '') {
      state.families = [];
      el.querySelectorAll('[data-fam]').forEach(b => {
        b.classList.toggle('on',  b.dataset.fam === '');
        b.classList.toggle('off', b.dataset.fam !== '');
      });
    } else {
      if (state.families.includes(fam)) {
        state.families = state.families.filter(f => f !== fam);
      } else {
        state.families = [...state.families, fam];
      }
      el.querySelector('[data-fam=""]').classList.toggle('on',  state.families.length === 0);
      el.querySelector('[data-fam=""]').classList.toggle('off', state.families.length > 0);
      btn.classList.toggle('on',  state.families.includes(fam));
      btn.classList.toggle('off', !state.families.includes(fam));
    }
    emit();
  });

  return {
    setQuery(q) { el.querySelector('#fb-input').value = q; state.query = q; emit(); },
    hide() { el.classList.add('hidden'); },
    show() { el.classList.remove('hidden'); },
  };
}

export function unmountFilterBar() {
  const el = document.getElementById('filter-bar');
  el.classList.add('hidden');
  el.innerHTML = '';
}
