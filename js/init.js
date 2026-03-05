// ═══════════════════════════════════════════════════════════════
// NEXUS HUB v8.3 - INITIALIZATION & INTEGRATION
// ═══════════════════════════════════════════════════════════════

/**
 * Este arquivo integra os novos módulos com o código legado,
 * sobrescrevendo funções críticas com versões aprimoradas.
 */

// ────────────────────────────────────────────────────────────────
// PROTEÇÃO CONTRA TRACKING PREVENTION (localStorage)
// ────────────────────────────────────────────────────────────────
(function initStorageProtection() {
  const memCache = {};
  const originalLS = window.localStorage;

  // Criar proxy que trata erros de Tracking Prevention
  window.localStorage = {
    getItem(key) {
      try {
        return originalLS.getItem(key) || memCache[key] || null;
      } catch (e) {
        return memCache[key] || null;
      }
    },
    setItem(key, value) {
      try {
        originalLS.setItem(key, value);
      } catch (e) {
        // Tracking Prevention: usar cache em memória
      }
      memCache[key] = value;
    },
    removeItem(key) {
      try {
        originalLS.removeItem(key);
      } catch (e) { }
      delete memCache[key];
    },
    clear() {
      try {
        originalLS.clear();
      } catch (e) { }
      Object.keys(memCache).forEach(k => delete memCache[k]);
    },
    get length() {
      return Object.keys(memCache).length;
    },
    key(n) {
      const keys = Object.keys(memCache);
      return keys[n] || null;
    }
  };

  console.log('[NEXUS HUB v8.3] Storage Protection loaded ✓');
})();

// ────────────────────────────────────────────────────────────────
// SOBRESCREVER FUNÇÃO getCalculatedSLA
// ────────────────────────────────────────────────────────────────

// Salvar referência original (caso necessário)
window._originalGetCalculatedSLA = window.getCalculatedSLA;

// Nova versão usando SLACalculator centralizado
window.getCalculatedSLA = function (row, TODAY, TOMORROW) {
  const calc = new SLACalculator(TODAY);
  const result = calc.calculateForRecord(row);
  return {
    prazo: result.prazo,
    slaRaw: result.slaRaw
  };
};

// ────────────────────────────────────────────────────────────────
// SOBRESCREVER FUNÇÃO aggStats
// ────────────────────────────────────────────────────────────────

// Salvar referência original
window._originalAggStats = window.aggStats;

// Nova versão usando SLACalculator
window.aggStats = function (rows) {
  const calc = new SLACalculator();
  const stats = calc.calculateAggregateStats(rows);

  return {
    tot: stats.total,
    atras: stats.atrasado,
    hoje: stats.hoje,
    amanha: stats.amanha,
    nop: stats.noPrazo,
    peso: stats.peso,
    vol: stats.volumes,
    val: stats.valor,
    sla: stats.slaPercent
  };
};

// ────────────────────────────────────────────────────────────────
// MELHORAR FUNÇÃO runPlan
// ────────────────────────────────────────────────────────────────

// Salvar referência original
window._originalRunPlan = window.runPlan;

// Nova versão usando PlanningEngine
function runPlanImproved() {
  const filial = v('pFilial', '') || FILIAL;
  const destSel = typeof getMultiSel === 'function' ? getMultiSel('pDest') : [];
  const tipoSel = typeof getMultiSel === 'function' ? getMultiSel('pTipo') : [];
  const hasDestino = destSel.length > 0;

  const pesoMax = +v('pPeso', 15000) || 15000;
  const valorMax = +v('pValor', 5000000) || 5000000;
  const veiculo = v('pVeic', '') || 'VEÍCULO A';

  if (!filial) {
    alert('Selecione a filial antes de executar o planejamento.');
    return;
  }

  showLoad('Iniciando planejamento...', 20);

  setTimeout(() => {
    try {
      // Obter status elegíveis
      const statusValues = getPlanStatusValues();
      if (statusValues.length === 0) {
        hideLoad();
        alert('Selecione ao menos um status elegível.');
        return;
      }

      showLoad('Filtrando cargas...', 40);

      let pool = DB.filter(r => {
        // STATUS: obrigatório
        if (!statusValues.includes(r.status)) return false;

        // TIPO DE OPERAÇÃO: quando especificado
        if (tipoSel.length > 0 && !tipoSel.includes(r.tipo_op)) return false;

        // DESTINO: quando informado, inclui TODOS os hubs com esse destino
        const keyDest = typeof keyStr === 'function' ? keyStr(r.destino) : (r.destino || '').toUpperCase().trim();
        if (hasDestino) {
          const matchDest = destSel.some(d => {
            const kd = typeof keyStr === 'function' ? keyStr(d) : String(d).toUpperCase().trim();
            return kd === keyDest;
          });
          if (!matchDest) return false;
        }

        // FILIAL/ESTOQUE: só restringe quando NÃO há destino especificado
        // (com destino, o filtro acima já é suficiente e evita excluir Reembarques)
        if (!hasDestino && filial && r.estoque !== filial && r.origem !== filial) return false;

        return true;
      });

      console.log('[PLAN FILTER 1] Após filtro de filial/destino/tipo/status:', {
        filial, destSel, tipoSel, statusValues,
        pool_length: pool.length,
        sample: pool.slice(0, 2).map(r => ({
          ctrc: r.ctrc,
          status: r.status,
          prazo: r.prazo,
          p_oper: r.p_oper,
          vl_nf: r.vl_nf,
          estoque: r.estoque,
          destino: r.destino
        }))
      });

      if (pool.length === 0) {
        hideLoad();
        alert('Nenhuma carga encontrada com os filtros selecionados.');
        return;
      }

      showLoad('Validando capacidade...', 50);

      // ✅ CORREÇÃO CRÍTICA: Agrupar por CTRC (conhecimento)
      // Muitas linhas do mesmo CTRC têm p_oper=0 (linhas de pallet/equipamento)
      // Devemos validar peso/valor no nível do CTRC, não da linha individual
      const ctrcMap = new Map();
      pool.forEach(r => {
        const key = r.ctrc || r.cod;
        if (!ctrcMap.has(key)) {
          ctrcMap.set(key, { linhas: [], p_oper_total: 0, vl_nf_total: 0 });
        }
        const group = ctrcMap.get(key);
        group.linhas.push(r);
        group.p_oper_total += (r.p_oper || 0);
        group.vl_nf_total += (r.vl_nf || 0);
      });

      console.log('[PLAN GROUP] Agrupado por CTRC:', {
        ctrc_count: ctrcMap.size,
        linhas_totais: pool.length,
        media_linhas_por_ctrc: (pool.length / ctrcMap.size).toFixed(1)
      });

      // Filtro: CTRC deve ter peso > 0 OU valor > 0
      let poolValid = [];
      ctrcMap.forEach(group => {
        // Se o CTRC tem peso ou valor válido, mantém TODAS as suas linhas
        if ((group.p_oper_total && group.p_oper_total > 0) ||
          (group.vl_nf_total && group.vl_nf_total > 0)) {
          poolValid.push(...group.linhas);
        }
      });

      // Calcular totais para debug
      const ctrcKept = new Set();
      poolValid.forEach(r => ctrcKept.add(r.ctrc || r.cod));
      const pesoTotalValid = poolValid.reduce((s, r) => s + (r.p_oper || 0), 0);
      const valorTotalValid = poolValid.reduce((s, r) => s + (r.vl_nf || 0), 0);

      console.log('[PLAN FILTER 2] Após validação peso/valor no nível CTRC:', {
        linhas_originais: pool.length,
        linhas_validas: poolValid.length,
        ctrcs_validos: ctrcKept.size,
        peso_total_kg: pesoTotalValid.toFixed(1),
        valor_total: valorTotalValid.toFixed(2)
      });

      // Debug: Ver distribuição de prazos no pool VÁLIDO
      const prazoCount = {};
      poolValid.forEach(r => {
        prazoCount[r.prazo] = (prazoCount[r.prazo] || 0) + 1;
      });
      console.log('[PLAN DEBUG] Pool VÁLIDO prazo distribution:', prazoCount);

      // ⚠ REGRA: Todos os CTEs elegíveis (peso/valor > 0) devem entrar no pool.
      // A priorização ocorre pela ordenação, não pela exclusão por prazo.
      //
      // CORREÇÃO v8.3.3: requireValidWeight/requireValidValue = false porque
      // a validação já foi feita no nível do CTRC acima. Linhas de pallet com
      // p_oper=0 são linhas legítimas de CTRCs válidos e NÃO devem ser filtradas.
      const result = window.planningEngine.plan(
        poolValid,
        { weight: pesoMax, value: valorMax, id: veiculo },
        {
          tipo: tipoSel.includes('Entrega') ? 'Entrega' : 'Outro',
          allowNoPrazo: true,
          allowSemData: true,
          allowPalletBreaking: true,
          requireValidWeight: false,  // Validação feita no nível CTRC — não re-filtrar por linha
          requireValidValue: false    // Validação feita no nível CTRC — não re-filtrar por linha
        }
      );

      showLoad('Finalizando...', 80);

      // ✅ CORREÇÃO: Usar a variável global planResults do main.js
      // A variável está definida em main.js como "let planResults = []"
      // Isso as torna globalmente acessíveis mas ainda são do escopo de main.js
      planResults = result.selected.map(r => ({ ...r, flag: 1 }))
        .concat(result.rejected.map(r => ({ ...r, flag: 0 })));
      planPage = 1;

      console.log('[init.js] planResults atualizado:', {
        total: planResults.length,
        selecionados: planResults.filter(r => r.flag === 1).length,
        rejeitados: planResults.filter(r => r.flag === 0).length
      });

      // Atualizar estatísticas na UI
      const metrics = result.metrics;

      setText('psSel', metrics.totalSelected);
      setText('psNSel', metrics.totalRejected);
      setText('psPeso', fmtNum(metrics.totalWeight, 1) + ' kg');
      setText('psValor', fmtMoeda(metrics.totalValue));
      setText('psVol', fmtNum(metrics.totalVolumes));

      const weightPct = metrics.weightUtilization;
      const valuePct = metrics.valueUtilization;

      setText('mPV', fmtNum(metrics.totalWeight, 1) + ' / ' + fmtNum(pesoMax, 1) + ' kg (' + weightPct.toFixed(1) + '%)');
      setText('mVV', fmtMoeda(metrics.totalValue) + ' / ' + fmtMoeda(valorMax) + ' (' + valuePct.toFixed(1) + '%)');
      setText('mPP', weightPct.toFixed(1) + '%');
      setText('mVP', valuePct.toFixed(1) + '%');

      try {
        document.getElementById('mPF').style.width = weightPct + '%';
        document.getElementById('mVF').style.width = valuePct + '%';
      } catch (_) { }

      setText('planCapPeso', fmtNum(pesoMax, 1));
      setText('planCapValor', fmtMoeda(valorMax));
      setText('planVeic', veiculo || '-');

      hideLoad();

      // Mostrar botões de export
      try {
        const be = document.getElementById('btnExport');
        const bp = document.getElementById('btnPrintPlan');
        if (be) be.style.display = 'flex';
        if (bp) bp.style.display = 'flex';
      } catch (_) { }

      // Renderizar tabela
      renderPlan();

      // Abrir modal com resultado
      openPlanModal({
        filial,
        destino: destSel.length > 0 ? destSel.join(', ') : 'Todos',
        pool: pool.length,
        sel: metrics.totalSelected,
        nsel: metrics.totalRejected,
        forcedSel: metrics.criticalSelected + metrics.scheduledSelected,
        forcedNsel: metrics.criticalRejected + metrics.scheduledRejected,
        normalSel: metrics.totalSelected - (metrics.criticalSelected + metrics.scheduledSelected),
        peso: metrics.totalWeight,
        valor: metrics.totalValue,
        veiculo
      });

      // Toast com resultado
      const type = (metrics.criticalRejected > 0 || metrics.scheduledRejected > 0) ? 'warn' : 'ok';
      let message = fmtNum(metrics.totalSelected) + ' selecionados';

      if (metrics.warnings.length > 0) {
        message += ' · ' + metrics.warnings.length + ' avisos';
      }

      toast('Planejamento concluído', message, type);

      // Avisos importantes
      if (metrics.warnings.length > 0) {
        console.warn('[Planejamento] Avisos:', metrics.warnings);

        // Mostrar aviso se capacidade excedida
        if (weightPct > 100 || valuePct > 100) {
          setTimeout(() => {
            const parts = [];
            if (weightPct > 100) {
              parts.push(`Peso: +${fmtNum(metrics.totalWeight - pesoMax, 1)} kg`);
            }
            if (valuePct > 100) {
              parts.push(`Valor: +${fmtMoeda(metrics.totalValue - valorMax)}`);
            }
            toast(
              '⚠ Capacidade excedida',
              `Itens críticos/agendados excedem limites. ${parts.join(' | ')}`,
              'warn'
            );
          }, 500);
        }
      }

      console.log('[Planejamento] Executado com sucesso:', {
        tempo: result.executionTimeMs + 'ms',
        pool: pool.length,
        selecionados: metrics.totalSelected,
        rejeitados: metrics.totalRejected,
        sla: metrics.slaPercent.toFixed(1) + '%',
        ocupacaoPeso: weightPct.toFixed(1) + '%',
        ocupacaoValor: valuePct.toFixed(1) + '%'
      });

    } catch (e) {
      hideLoad();
      console.error('[Planejamento] Erro:', e);
      alert('Erro no planejamento: ' + (e.message || e));
    }
  }, 80);
};

// ────────────────────────────────────────────────────────────────
// WRAPPER: manter compatibilidade com código existente
// ────────────────────────────────────────────────────────────────

// Permitir usar versão aprimorada ou original
window.runPlan = function () {
  // Detectar se PlanningEngine está disponível
  if (typeof PlanningEngine !== 'undefined' && window.planningEngine) {
    console.log('[NEXUS] Usando Planning Engine aprimorado v8.3');
    return runPlanImproved();
  } else {
    console.warn('[NEXUS] Planning Engine não disponível, usando versão original');
    return window._originalRunPlan ? window._originalRunPlan() : null;
  }
};

// ────────────────────────────────────────────────────────────────
// INTEGRAR FILTROS GLOBAIS (se disponível)
// ────────────────────────────────────────────────────────────────

if (typeof GlobalFilters !== 'undefined' && window.globalFilters) {
  console.log('[NEXUS] Global Filters disponível - integrando...');

  // Observer para atualizar header quando filtros mudarem
  window.globalFilters.subscribe((key, newValue, oldValue) => {
    console.log(`[GlobalFilters] ${key}: ${oldValue} → ${newValue}`);

    // Se mudou dashboard type, re-renderizar header
    if (key === 'dashboardType') {
      if (typeof updateHeaderCounters === 'function') {
        updateHeaderCounters();
      }
    }
  });
}

// ────────────────────────────────────────────────────────────────
// LOGS DE INICIALIZAÇÃO
// ────────────────────────────────────────────────────────────────

console.log('%c╔══════════════════════════════════════════════════════════════╗', 'color: #10a37f');
console.log('%c║  NEXUS HUB v8.3 IMPROVED                                     ║', 'color: #10a37f; font-weight: bold');
console.log('%c╠══════════════════════════════════════════════════════════════╣', 'color: #10a37f');
console.log('%c║  Módulos Carregados:                                         ║', 'color: #10a37f');
console.log('%c║  ✓ SLA Calculator (Centralizado)                             ║', 'color: #10a37f');
console.log('%c║  ✓ Global Filters (Sincronizado)                             ║', 'color: #10a37f');
console.log('%c║  ✓ Planning Engine (Otimizado)                               ║', 'color: #10a37f');
console.log('%c║                                                              ║', 'color: #10a37f');
console.log('%c║  Correções Aplicadas:                                        ║', 'color: #10a37f');
console.log('%c║  • Demo mode removido                                        ║', 'color: #10a37f');
console.log('%c║  • Cálculo de SLA unificado                                  ║', 'color: #10a37f');
console.log('%c║  • Algoritmo de planejamento aprimorado                      ║', 'color: #10a37f');
console.log('%c║  • Filtros sincronizados entre telas                         ║', 'color: #10a37f');
console.log('%c╚══════════════════════════════════════════════════════════════╝', 'color: #10a37f');

// ────────────────────────────────────────────────────────────────
// REMOVER REFERÊNCIAS AO DEMO (caso existam no código legado)
// ────────────────────────────────────────────────────────────────

if (typeof useDemoData !== 'undefined') {
  window.useDemoData = function () {
    alert('Modo demonstração não está mais disponível.\n\nPor favor, importe um arquivo XLSX real.');
  };
}

if (typeof loadDemoData !== 'undefined') {
  window.loadDemoData = async function () {
    throw new Error('Demo data não está mais disponível. Importe um arquivo XLSX.');
  };
}

// Substituir referência à variável demoMode (se existir)
if (typeof demoMode !== 'undefined') {
  Object.defineProperty(window, 'demoMode', {
    get: function () { return false; },
    set: function (value) {
      console.warn('[NEXUS] demoMode foi removido na v8.3');
    }
  });
}

// ────────────────────────────────────────────────────────────────
// INICIALIZAR NxTagInput — Filtros multi-valor com tags/chips
// ────────────────────────────────────────────────────────────────

(function initTagInputs() {
  function setup() {
    if (typeof nxTagCreate !== 'function') {
      console.warn('[NEXUS] NxTagInput não disponível');
      return;
    }

    // Estoque
    const estEl = document.getElementById('estTagSearch');
    if (estEl && !window.NxTags?.has('estTag')) {
      nxTagCreate('estTag', {
        placeholder: '🔍 CTRC, destinatário, cidade...',
        legacyId: 'estSrch',
        onChange: () => { try { renderEst(); } catch (e) { console.warn(e); } }
      }, estEl);
    }

    // Pátio
    const patEl = document.getElementById('patTagSearch');
    if (patEl && !window.NxTags?.has('patTag')) {
      nxTagCreate('patTag', {
        placeholder: '🔍 CTRC, destinatário...',
        legacyId: 'patSrch',
        onChange: () => { try { renderPat(); } catch (e) { console.warn(e); } }
      }, patEl);
    }

    // Atrasados
    const atrEl = document.getElementById('atrTagSearch');
    if (atrEl && !window.NxTags?.has('atrTag')) {
      nxTagCreate('atrTag', {
        placeholder: '🔍 CTRC, destinatário...',
        legacyId: 'atrSrch',
        onChange: () => { try { renderAtras(); } catch (e) { console.warn(e); } }
      }, atrEl);
    }

    // Planejamento
    const planEl = document.getElementById('planTagSearch');
    if (planEl && !window.NxTags?.has('planTag')) {
      nxTagCreate('planTag', {
        placeholder: '🔍 buscar...',
        legacyId: 'planSrch',
        onChange: () => { try { renderPlan(); } catch (e) { console.warn(e); } }
      }, planEl);
    }

    // Etapa
    const etapaEl = document.getElementById('etapaTagSearch');
    if (etapaEl && !window.NxTags?.has('etapaTag')) {
      nxTagCreate('etapaTag', {
        placeholder: '🔎 buscar em status/rota...',
        legacyId: 'etapaSrch',
        onChange: () => { try { etapaApplySearch(); } catch (e) { console.warn(e); } }
      }, etapaEl);
    }

    // Descarga (novo — anteriormente sem busca text)
    const descEl = document.getElementById('descTagSearch');
    if (descEl && !window.NxTags?.has('descTag')) {
      nxTagCreate('descTag', {
        placeholder: '🔍 buscar na descarga...',
        onChange: () => { try { if (typeof renderDescCards === 'function') renderDescCards(); } catch (e) { console.warn(e); } }
      }, descEl);
    }

    // Dashboard (novo — anteriormente sem busca text)
    const dashEl = document.getElementById('dashTagSearch');
    if (dashEl && !window.NxTags?.has('dashTag')) {
      nxTagCreate('dashTag', {
        placeholder: '🔍 filtrar dashboard...',
        onChange: () => { try { if (typeof updateDash === 'function') updateDash(); } catch (e) { console.warn(e); } }
      }, dashEl);
    }

    console.log('[NEXUS] NxTagInput inicializados ✓', window.NxTags?.size || 0, 'instâncias');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(setup, 200));
  } else {
    setTimeout(setup, 200);
  }
})();

console.log('[NEXUS HUB v8.3] Inicialização completa ✓');
