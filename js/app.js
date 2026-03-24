/**
 * js/app.js — GrokFin Elite v6
 * Orquestrador central da aplicação modular.
 */

import { loadState, saveState, state } from './state.js';
import { initAuth } from './services/auth.js';
import { isSupabaseConfigured } from './services/supabase.js';
import { syncFromSupabase } from './services/sync.js';
import { bindNavigationEvents, syncLocationHash, syncActiveViewLabel, switchTab } from './ui/navigation.js';
import { bindDashboardEvents, renderDashboard, renderHeaderMeta, renderReport } from './ui/dashboard-ui.js';
import { renderCharts } from './ui/charts.js';
import { bindTxEvents, renderTransactions } from './ui/transactions-ui.js';
import { bindGoalEvents, renderGoals } from './ui/goals-ui.js';
import { bindCardEvents, renderCards } from './ui/cards-ui.js';
import { bindCashflowEvents, renderCashflow } from './ui/cashflow-ui.js';
import { bindInvestmentEvents, renderInvestments } from './ui/investments-ui.js';
import { bindChatEvents } from './ui/chat-ui.js';
import { bindProfileEvents, renderProfile } from './ui/profile-ui.js';
import { calculateAnalytics, processRecurrences } from './analytics/engine.js';
import { showToast } from './utils/dom.js';
import { initOnboarding } from './ui/onboarding.js';

let renderAnimationFrame = null;

window.renderAll = function() {
  if (renderAnimationFrame) cancelAnimationFrame(renderAnimationFrame);
  
  renderAnimationFrame = requestAnimationFrame(() => {
    const analytics = calculateAnalytics(state);
    
    renderHeaderMeta(analytics);
    renderProfile(analytics);
    renderDashboard(analytics);
    renderReport(analytics);   // Aba Diagnóstico acoplada
    renderCharts(analytics);
    renderTransactions();
    renderGoals(analytics);
    renderCards();
    renderCashflow();
    renderInvestments();
    
    renderAnimationFrame = null;
  });
}

window.appRenderAll = window.renderAll;
window.renderHeaderMeta = renderHeaderMeta;

async function initApp() {
  // 0. Autenticação restrita (bloquear se Supabase estiver configurado e o usuário não existir)
  const user = await initAuth();
  if (isSupabaseConfigured && !user) {
    window.location.replace('./index.html');
    return;
  }

  // 1. Carrega dados do localStorage ou gera banco inicial
  const loadedState = loadState();
  Object.assign(state, loadedState);

  // 1.2 Resgata da nuvem e mescla/sobrescreve o local (multi-device)
  if (isSupabaseConfigured && user) {
    const success = await syncFromSupabase(state);
    if (success) {
      saveState();
    }
  }

  // 1.5 Roda o Cron-Job Local de Recorrências Fixas
  const cronDidChanges = processRecurrences(state);
  if (cronDidChanges) {
    saveState();
  }

  // 2. Configura a Chart.js global
  if (window.Chart) {
    Chart.defaults.color = 'rgba(255,255,255,.58)';
    Chart.defaults.font.family = 'Inter';
  }

  // 3. Aplica bind de eventos de todos os módulos de UI
  bindNavigationEvents();
  bindDashboardEvents();
  bindTxEvents();
  bindGoalEvents();
  bindCardEvents();
  bindCashflowEvents();
  bindInvestmentEvents();
  bindChatEvents();
  bindProfileEvents();

  // 4. Render Inicial Pleno
  window.renderAll();
  
  // 5. Restaura a Tab ativa 
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash) {
     window.dispatchEvent(new Event('hashchange'));
  } else {
     switchTab(state.ui.activeTab || 0, { noScroll: true, skipHistory: true });
     syncLocationHash(state.ui.activeTab || 0);
     syncActiveViewLabel(state.ui.activeTab || 0);
  }

  // 6. Inicia Onboarding de Novos Usuários
  initOnboarding();

  console.info('[GrokFin] Aplicação inicializada de forma modular.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
