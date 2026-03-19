// ═══════════════════════════════════════════════════════════════
// NEXUS HUB v8.3.2 - MELHORIAS ADICIONAIS
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  console.log('[NEXUS v8.3.2] Carregando melhorias...');

  // ═══════════════════════════════════════════════════════════════
  // MELHORIA #1: (Removida - Migrada para o main.js para suporte correto ao Tabulator)
  // MELHORIA #2: (Removida - Migrada para o main.js para consolidação unificada de PDFs)
  // MELHORIA #3: DEBUG APRIMORADO PLANEJAMENTO
  // ═══════════════════════════════════════════════════════════════

  if (window.PlanningEngine && window.PlanningEngine.prototype._filterEligiblePool) {
    const _origFilter = window.PlanningEngine.prototype._filterEligiblePool;

    window.PlanningEngine.prototype._filterEligiblePool = function (pool, options) {
      console.log(`[v8.3.2 PLAN] Pool: ${pool.length} registros`);

      const eligible = _origFilter.call(this, pool, options);

      console.log(`[v8.3.2 PLAN] Elegíveis: ${eligible.length}`);

      const prazoCount = {};
      pool.forEach(r => prazoCount[r.prazo] = (prazoCount[r.prazo] || 0) + 1);
      console.log(`[v8.3.2 PLAN] Prazos no pool:`, prazoCount);

      if (options.allowNoPrazo) {
        const noPrazoPool = pool.filter(r => r.prazo === 'No Prazo').length;
        const noPrazoEligible = eligible.filter(r => r.prazo === 'No Prazo').length;
        console.log(`[v8.3.2 PLAN] "No Prazo": ${noPrazoEligible}/${noPrazoPool} incluídos`);

        if (noPrazoPool > 0 && noPrazoEligible === 0) {
          console.warn('[v8.3.2 PLAN] ⚠ "No Prazo" no pool mas não elegíveis!');
        }
      }

      return eligible;
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ═══════════════════════════════════════════════════════════════

  function init() {
    // Inicialização original mantida para as outras lógicas, caso haja
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

  console.log('%c[NEXUS v8.3.2] ✓ Melhorias carregadas', 'color: #10a37f; font-weight: bold');

})();