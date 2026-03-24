/**
 * js/ui/navigation.js
 * Lógica de navegação: abas, sidebar, bottom sheet e painel 'Mais'.
 */

import { state, saveState } from '../state.js';
import { NAV_LABELS, NAV_ICONS, NAV_HASHES } from '../config.js';
import { clamp } from '../utils/math.js';
import { renderCards } from './cards-ui.js';

export function hashToTab(hash) {
  const clean = String(hash).replace(/^#/, '');
  const idx = NAV_HASHES.indexOf(clean);
  return idx >= 0 ? idx : 0;
}
import { renderCashflow } from './cashflow-ui.js';
import { renderInvestments, renderSimulator } from './investments-ui.js';
import { renderMarketTab } from './market-ui.js';

export function syncActiveViewLabel(index = 0) {
  // FIX: HTML uses id="current-view-chip" (combined icon+text pill)
  // Previous code targeted non-existent 'active-view-label' and 'active-view-icon' IDs.
  const chip = document.getElementById('current-view-chip');
  if (chip) {
    const icon = NAV_ICONS[index] || 'fa-house';
    const label = NAV_LABELS[index] || 'GrokFin';
    chip.innerHTML = `<i class="fa-solid ${icon} text-cyan-300"></i> ${label}`;
  }

  const dot = document.getElementById('mais-active-dot');
  const maisBtn = document.getElementById('mais-btn');
  const isMoreTab = index >= 6 && index <= 8;
  if (dot && maisBtn) {
    if (isMoreTab) {
      dot.classList.remove('hidden');
      maisBtn.classList.add('active');
    } else {
      dot.classList.add('hidden');
      maisBtn.classList.remove('active');
    }
  }
}

export function syncLocationHash(index) {
  const hash = NAV_HASHES[clamp(Number(index) || 0, 0, NAV_HASHES.length - 1)];
  if (!hash) return;
  if (location.hash !== `#${hash}`) {
    history.replaceState(null, '', `#${hash}`);
  }
}

export function switchTab(index, { force = false, skipHistory = false } = {}) {
  const target = clamp(Number(index) || 0, 0, 9);
  if (!force && state.ui.activeTab === target) return;

  state.ui.activeTab = target;
  // [FIX #2] saveState() agora funciona sem argumento (usa o state do módulo)
  saveState();
  if (!skipHistory) syncLocationHash(target);

  // [FIX #1a] Ocultar todas as abas: a classe correta no HTML é 'tab-panel',
  // não 'app-view' como estava antes — causava as abas nunca ocultarem/exibirem.
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));

  // [FIX #1b] Exibir a aba destino: os IDs no HTML são 'tab-0', 'tab-1', etc.,
  // não 'view-home' ou 'view-0' como estava antes.
  const targetEl = document.getElementById(`tab-${target}`);
  if (targetEl) targetEl.classList.add('active');

  // Atualizar sidebar UI (Desktop)
  document.querySelectorAll('.sidebar-link, .nav-rail-button').forEach(link => {
    link.classList.toggle('active', parseInt(link.dataset.tab) === target);
  });

  // [FIX #4] Atualizar bottom nav (Mobile): classe correta é 'bottom-nav-button',
  // não 'bottom-nav-btn' como estava — causava highlight do bottom nav nunca atualizar.
  const legacyIdx = {0:0, 1:1, 2:2, 3:3, 4:4, 5:4, 6:1, 7:1, 8:1}[target] || 0;
  document.querySelectorAll('.bottom-nav-button').forEach((btn, i) => {
    const icon = btn.querySelector('i');
    if (!icon) return;
    if (i === legacyIdx) {
      btn.classList.add('text-cyan-400');
      btn.classList.remove('text-white/40');
      icon.classList.remove('fa-beat-fade');
      void icon.offsetWidth;
      icon.classList.add('fa-beat-fade');
      setTimeout(() => icon.classList.remove('fa-beat-fade'), 800);
    } else {
      btn.classList.remove('text-cyan-400');
      btn.classList.add('text-white/40');
    }
  });

  syncActiveViewLabel(target);

  // Fechar o painel 'Mais' em telas menores, se aplicável
  const mwContainer = document.getElementById('main-workspace');
  if (mwContainer && window.innerWidth < 1024) mwContainer.scrollTo(0, 0);
  closeSidebar();
  
  // Tratar abas que exigem render no mount
  if (target === 6) requestAnimationFrame(renderCards);
  if (target === 7) requestAnimationFrame(renderCashflow);
  if (target === 8) { requestAnimationFrame(renderInvestments); requestAnimationFrame(renderSimulator); }
  if (target === 9) requestAnimationFrame(() => renderMarketTab(false));
}

export function openSidebar() {
  const o = document.getElementById('sidebar-overlay');
  if (o) o.classList.remove('hidden');
}

export function closeSidebar() {
  const o = document.getElementById('sidebar-overlay');
  if (o) o.classList.add('hidden');
}

export function openMaisSheet() {
  const sheet = document.getElementById('mais-sheet');
  const panel = document.getElementById('mais-sheet-panel');
  if (!sheet || !panel) return;
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => { panel.style.transform = 'translateY(0)'; });
  
  document.querySelectorAll('.mais-tab-btn').forEach(btn => {
    const t = Number(btn.dataset.tab);
    btn.style.borderColor = t === state.ui.activeTab ? 'rgba(0,245,255,.3)' : '';
    btn.style.background = t === state.ui.activeTab ? 'rgba(0,245,255,.08)' : '';
  });
}

export function closeMaisSheet() {
  const sheet = document.getElementById('mais-sheet');
  const panel = document.getElementById('mais-sheet-panel');
  if (!sheet || !panel) return;
  panel.style.transform = 'translateY(100%)';
  setTimeout(() => sheet.classList.add('hidden'), 290);
}

export function bindNavigationEvents() {
  document.querySelectorAll('.sidebar-link, .nav-rail-button, .bottom-nav-button:not(#mais-btn)').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(parseInt(link.dataset.tab));
    });
  });

  window.addEventListener('hashchange', () => {
    const target = hashToTab(location.hash);
    if (target !== undefined) switchTab(target, { skipHistory: true });
  });

  document.getElementById('mobile-menu-btn')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'sidebar-overlay') closeSidebar();
  });

  document.getElementById('mais-btn')?.addEventListener('click', openMaisSheet);
  document.getElementById('mais-sheet-close')?.addEventListener('click', closeMaisSheet);
  document.getElementById('mais-sheet')?.addEventListener('click', (e) => {
    if (e.target.id === 'mais-sheet') closeMaisSheet();
  });
  
  document.querySelectorAll('.mais-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(Number(btn.dataset.tab));
      closeMaisSheet();
    });
  });
}

// [FIX #3] Expor funções de navegação no escopo global (window).
// O app.html usa onclick inline nos botões do painel 'Mais' e no mais-btn
// (e.g. onclick="switchTab(6)", onclick="openMaisSheet()"). Como o código usa
// ES modules, essas funções não estão disponíveis no escopo global por padrão,
// causando ReferenceError ao clicar. Expor aqui resolve sem alterar o HTML.
window.switchTab    = switchTab;
window.openMaisSheet  = openMaisSheet;
window.closeMaisSheet = closeMaisSheet;
