// ═══════════════════════════════════════════════════════════════
// NEXUS HUB v8.3 - PLANNING ENGINE (Optimized Algorithm)
// ═══════════════════════════════════════════════════════════════

/**
 * Engine de planejamento de cargas otimizado com priorização em tiers.
 * Corrige problemas identificados na auditoria:
 * - Elegibilidade por prazo controlada
 * - Priorização multifatorial
 * - Melhor aproveitamento de capacidade
 */
class PlanningEngine {
  constructor(slaCalculator = null) {
    this.slaCalculator = slaCalculator || new SLACalculator();
    this.cache = new Map();
    this.cacheMaxSize = 100;
  }

  /**
   * Executa o planejamento de cargas
   * @param {Array} pool - Pool de cargas disponíveis
   * @param {Object} vehicleCapacity - {weight, value, id}
   * @param {Object} options - Opções de planejamento
   * @returns {Object} Resultado do planejamento
   */
  plan(pool, vehicleCapacity, options = {}) {
    const startTime = Date.now();

    try {
      // Validação de entrada
      this._validateInputs(pool, vehicleCapacity);

      // Criar chave de cache
      const cacheKey = this._getCacheKey(pool, vehicleCapacity, options);
      if (this.cache.has(cacheKey)) {
        // Mover para o final para manter a ordem do LRU
        const cached = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cached);
        console.log('[PlanningEngine] Cache hit', Date.now() - startTime, 'ms');
        return cached;
      }

      // Filtrar pool elegível
      const eligiblePool = this._filterEligiblePool(pool, options);

      if (eligiblePool.length === 0) {
        return this._emptyResult('Nenhuma carga elegível no pool');
      }

      // Separar pallets e carga solta
      const { pallets, loose } = this._separatePalletsAndLoose(eligiblePool);

      // Ordenar por prioridade
      this._sortByPriority(pallets, loose, options);

      // Executar alocação
      const result = this._allocate(pallets, loose, vehicleCapacity, options);

      // Calcular métricas
      result.metrics = this._calculateMetrics(result, vehicleCapacity);
      result.executionTimeMs = Date.now() - startTime;

      // Cachear resultado
      this._cacheResult(cacheKey, result);

      return result;

    } catch (error) {
      console.error('[PlanningEngine] Error:', error);
      return this._errorResult(error);
    }
  }

  /**
   * Filtra pool de cargas elegíveis
   * @private
   *
   * CORREÇÃO (v8.3.3): Um único CTRC pode gerar múltiplas linhas no banco.
   * A linha principal tem p_oper > 0, mas linhas de equipamento/pallet
   * associadas têm p_oper = 0 E vl_nf = 0. Filtrar por registro individual
   * causava a exclusão dessas linhas, reduzindo drasticamente o pool.
   *
   * Quando requireValidWeight = false E requireValidValue = false (padrão),
   * toda a validação já foi feita no nível do CTRC pelo caller (runPlanImproved)
   * e o pool é retornado integralmente sem re-filtrar.
   */
  _filterEligiblePool(pool, options) {
    const {
      requireValidWeight = false,  // Desativado por padrão (validação feita no CTRC)
      requireValidValue = false    // Desativado por padrão (validação feita no CTRC)
    } = options;

    // Modo pass-through: pool já validado no nível CTRC pelo caller
    // NÃO re-filtrar por linha individual — preserva linhas de pallet (p_oper=0, vl_nf=0)
    if (!requireValidWeight && !requireValidValue) {
      return [...pool]; // retorna todos (cópia defensiva)
    }

    // Modo estrito (ambos os flags ativos): aplica AND clássico
    if (requireValidWeight && requireValidValue) {
      return pool.filter(record =>
        (record.p_oper && record.p_oper > 0) &&
        (record.vl_nf && record.vl_nf > 0)
      );
    }

    // Modo misto: OR — mantém se tiver peso OU valor válido
    return pool.filter(record => {
      const hasWeight = record.p_oper && record.p_oper > 0;
      const hasValue = record.vl_nf && record.vl_nf > 0;
      return hasWeight || hasValue;
    });
  }

  /**
   * Separa pallets de carga solta
   * @private
   */
  _separatePalletsAndLoose(pool) {
    const palletMap = new Map();
    const loose = [];

    pool.forEach(record => {
      if (record.equipamento && record.equipamento > 0) {
        const key = String(record.equipamento);
        const group = palletMap.get(key) || [];
        if (group.length === 0) palletMap.set(key, group);
        group.push(record);
      } else {
        loose.push(record);
      }
    });

    // Converter pallets em objetos agregados
    const pallets = Array.from(palletMap.entries()).map(([id, records]) => {
      const peso = records.reduce((sum, r) => sum + (r.p_oper || 0), 0);
      const valor = records.reduce((sum, r) => sum + (r.vl_nf || 0), 0);

      // Prioridade por contágio: se UM item é crítico, todo pallet é crítico
      const isCritical = records.some(r => r.is_critico);
      const isScheduled = records.some(r => r.is_agend);

      // Prazo mínimo do pallet
      const prazoOrder = { 'Atrasado': 0, 'Hoje': 1, 'Amanhã': 2, 'No Prazo': 3, 'Sem Data': 4 };
      const minPrazo = records.reduce((best, r) => {
        const currentOrder = prazoOrder[r.prazo] ?? 4;
        const bestOrder = prazoOrder[best] ?? 4;
        return currentOrder < bestOrder ? r.prazo : best;
      }, 'Sem Data');

      return {
        id,
        records,
        peso,
        valor,
        isCritical,
        isScheduled,
        prazo: minPrazo,
        count: records.length
      };
    });

    return { pallets, loose };
  }

  /**
   * Ordena pallets e carga solta por prioridade
   * @private
   */
  _sortByPriority(pallets, loose, options) {
    const comparePriority = (a, b) => {
      // 1. Críticos primeiro
      if (a.isCritical !== b.isCritical) {
        return a.isCritical ? -1 : 1;
      }

      // 2. Agendados segundo
      if (a.isScheduled !== b.isScheduled) {
        return a.isScheduled ? -1 : 1;
      }

      // 3. Por prazo (Atrasado > Hoje > Amanhã > No Prazo)
      const prazoOrder = { 'Atrasado': 0, 'Hoje': 1, 'Amanhã': 2, 'No Prazo': 3, 'Sem Data': 4 };
      const prazoA = prazoOrder[a.prazo] ?? 4;
      const prazoB = prazoOrder[b.prazo] ?? 4;

      if (prazoA !== prazoB) {
        return prazoA - prazoB;
      }

      // 4. FIFO para Entrega (se mesmo prazo)
      if (options.tipo === 'Entrega') {
        const dateA = this._getTargetDate(a);
        const dateB = this._getTargetDate(b);
        if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
          return dateA - dateB;
        }
      }

      // 5. Maior valor por kg (densidade)
      const densityA = (a.valor || 0) / Math.max(a.peso || 1, 1);
      const densityB = (b.valor || 0) / Math.max(b.peso || 1, 1);
      return densityB - densityA;
    };

    pallets.sort(comparePriority);
    loose.sort(comparePriority);
  }

  /**
   * Executa alocação de cargas
   * @private
   */
  _allocate(pallets, loose, capacity, options) {
    const selected = [];
    const rejected = [];

    let remainingWeight = capacity.weight;
    let remainingValue = capacity.value;

    // FASE 1: Alocar pallets completos
    pallets.forEach(pallet => {
      if (pallet.peso <= remainingWeight && pallet.valor <= remainingValue) {
        // Pallet cabe: embarcar todos os itens
        pallet.records.forEach(r => {
          selected.push({
            ...r,
            flag: 1,
            _group: 'pallet',
            _palletId: pallet.id
          });
        });

        remainingWeight -= pallet.peso;
        remainingValue -= pallet.valor;
      } else {
        // Pallet NÃO cabe
        // Verificar se deve quebrar (apenas para críticos/agendados)
        const breakThreshold = options.palletBreakThreshold !== undefined ? options.palletBreakThreshold : 0.3;
        const shouldBreak = (pallet.isCritical || pallet.isScheduled) &&
          options.allowPalletBreaking &&
          remainingWeight >= (pallet.peso * breakThreshold);

        if (shouldBreak) {
          // Tentar embarcar itens críticos/agendados do pallet
          pallet.records.forEach(r => {
            if ((r.is_critico || r.is_agend) &&
              r.p_oper <= remainingWeight &&
              r.vl_nf <= remainingValue) {
              selected.push({
                ...r,
                flag: 1,
                _group: 'pallet-broken',
                _palletId: pallet.id,
                _warning: 'Pallet quebrado para embarcar item prioritário'
              });
              remainingWeight -= r.p_oper;
              remainingValue -= r.vl_nf;
            } else {
              rejected.push({
                ...r,
                flag: 0,
                _group: 'pallet',
                _palletId: pallet.id,
                _reason: 'Pallet não coube completo'
              });
            }
          });
        } else {
          // Não quebrar: rejeitar pallet completo
          pallet.records.forEach(r => {
            rejected.push({
              ...r,
              flag: 0,
              _group: 'pallet',
              _palletId: pallet.id,
              _reason: pallet.peso > capacity.weight ? 'Pallet excede capacidade do veículo' : 'Capacidade insuficiente'
            });
          });
        }
      }
    });

    // FASE 2: Completar com carga solta
    loose.forEach(record => {
      if (record.p_oper <= remainingWeight && record.vl_nf <= remainingValue) {
        selected.push({
          ...record,
          flag: 1,
          _group: 'loose'
        });
        remainingWeight -= record.p_oper;
        remainingValue -= record.vl_nf;
      } else {
        rejected.push({
          ...record,
          flag: 0,
          _group: 'loose',
          _reason: record.p_oper > capacity.weight ? 'Item excede capacidade do veículo' : 'Capacidade insuficiente'
        });
      }
    });

    return {
      selected,
      rejected,
      capacity: {
        weight: capacity.weight,
        value: capacity.value,
        usedWeight: capacity.weight - remainingWeight,
        usedValue: capacity.value - remainingValue,
        remainingWeight,
        remainingValue
      }
    };
  }

  /**
   * Calcula métricas do planejamento
   * @private
   */
  _calculateMetrics(result, capacity) {
    const { selected, rejected } = result;

    // Contadores básicos
    const totalSelected = selected.length;
    const totalRejected = rejected.length;
    const totalPool = totalSelected + totalRejected;

    // Contadores por tipo (consolidados para performance)
    const metricsAcc = selected.reduce((acc, r) => {
      if (r.is_critico) acc.criticalSelected++;
      if (r.is_agend) acc.scheduledSelected++;
      return acc;
    }, { criticalSelected: 0, scheduledSelected: 0 });

    const rejMetricsAcc = rejected.reduce((acc, r) => {
      if (r.is_critico) acc.criticalRejected++;
      if (r.is_agend) acc.scheduledRejected++;
      return acc;
    }, { criticalRejected: 0, scheduledRejected: 0 });

    const criticalSelected = metricsAcc.criticalSelected;
    const scheduledSelected = metricsAcc.scheduledSelected;
    const criticalRejected = rejMetricsAcc.criticalRejected;
    const scheduledRejected = rejMetricsAcc.scheduledRejected;

    // Peso e valor
    const totalWeight = selected.reduce((sum, r) => sum + (r.p_oper || 0), 0);
    const totalValue = selected.reduce((sum, r) => sum + (r.vl_nf || 0), 0);
    const totalVolumes = selected.reduce((sum, r) => sum + (r.qtd_vol || 0), 0);

    // Ocupação
    const weightUtilization = (totalWeight / capacity.weight) * 100;
    const valueUtilization = (totalValue / capacity.value) * 100;

    // SLA estimado (baseado em cargas selecionadas)
    const stats = this.slaCalculator.calculateAggregateStats(selected);

    // Avisos
    const warnings = [];
    if (criticalRejected > 0) {
      warnings.push(`${criticalRejected} cargas críticas não embarcadas`);
    }
    if (scheduledRejected > 0) {
      warnings.push(`${scheduledRejected} agendamentos não embarcados`);
    }
    if (weightUtilization > 100) {
      warnings.push(`Peso excede capacidade em ${(totalWeight - capacity.weight).toFixed(0)} kg`);
    }
    if (valueUtilization > 100) {
      warnings.push(`Valor excede capacidade em R$ ${((totalValue - capacity.value) / 1000).toFixed(0)}k`);
    }
    const brokenPallets = selected.filter(r => r._group === 'pallet-broken').length;
    if (brokenPallets > 0) {
      warnings.push(`${brokenPallets} itens de pallets quebrados embarcados`);
    }

    return {
      totalPool,
      totalSelected,
      totalRejected,
      criticalSelected,
      criticalRejected,
      scheduledSelected,
      scheduledRejected,
      totalWeight,
      totalValue,
      totalVolumes,
      weightUtilization: Math.min(100, weightUtilization),
      valueUtilization: Math.min(100, valueUtilization),
      slaPercent: stats.slaPercent,
      atrasadosSelected: stats.atrasado,
      hojeSelected: stats.hoje,
      amanhaSelected: stats.amanha,
      warnings
    };
  }

  /**
   * Valida entradas
   * @private
   */
  _validateInputs(pool, capacity) {
    if (!Array.isArray(pool)) {
      throw new Error('Pool deve ser um array');
    }
    if (!capacity || typeof capacity !== 'object') {
      throw new Error('Capacidade do veículo inválida');
    }
    if (!capacity.weight || capacity.weight <= 0) {
      throw new Error('Peso máximo do veículo deve ser maior que zero');
    }
    if (!capacity.value || capacity.value <= 0) {
      throw new Error('Valor máximo do veículo deve ser maior que zero');
    }
  }

  /**
   * Gera chave de cache
   * @private
   */
  _getCacheKey(pool, capacity, options) {
    const poolIds = pool.map(r => r.ctrc || r.cod).sort().join(',');
    // Garantir ordem determinística das chaves no JSON
    const sortedOptions = Object.keys(options || {}).sort().reduce((o, k) => {
      o[k] = options[k];
      return o;
    }, {});
    const optionsStr = JSON.stringify(sortedOptions);
    return `${poolIds}_${capacity.weight}_${capacity.value}_${optionsStr}`;
  }

  /**
   * Cacheia resultado
   * @private
   */
  _cacheResult(key, result) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.cacheMaxSize) {
      // Remover entrada mais antiga (LRU Real)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
  }

  /**
   * Obtém data alvo de um item
   * @private
   */
  _getTargetDate(item) {
    const records = item.records || [item];
    const dates = records
      .map(r => this.slaCalculator._getTargetDate(r))
      .filter(d => d);

    if (dates.length === 0) return null;
    return new Date(Math.min(...dates.map(d => d.getTime())));
  }

  /**
   * Resultado vazio
   * @private
   */
  _emptyResult(reason) {
    return {
      selected: [],
      rejected: [],
      capacity: { usedWeight: 0, usedValue: 0 },
      metrics: {
        totalPool: 0,
        totalSelected: 0,
        totalRejected: 0,
        warnings: [reason]
      },
      executionTimeMs: 0
    };
  }

  /**
   * Resultado de erro
   * @private
   */
  _errorResult(error) {
    return {
      error: true,
      message: error.message,
      selected: [],
      rejected: [],
      capacity: { usedWeight: 0, usedValue: 0 },
      metrics: {
        totalPool: 0,
        totalSelected: 0,
        totalRejected: 0,
        warnings: ['Erro no planejamento: ' + error.message]
      },
      executionTimeMs: 0
    };
  }

  /**
   * Limpa cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.PlanningEngine = PlanningEngine;
}

console.log('[NEXUS HUB v8.3] Planning Engine loaded ✓');
