// ═══════════════════════════════════════════════════════════════
// NEXUS HUB v8.4 - SLA CALCULATOR (Centralized + Urgency Score)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculadora centralizada de SLA + análise de cenário de embarque.
 * Versão 8.4 adiciona:
 *   - getUrgencyScore(record): score numérico 0–200
 *   - evaluateScenario(selected, rejected): análise qualitativa do cenário
 *   - projectSLAImpact(selected, allPool): projeção de impacto no SLA global
 */
class SLACalculator {
  constructor(referenceDate = null) {
    this.today    = referenceDate ? new Date(referenceDate) : new Date();
    this.today.setHours(0, 0, 0, 0);

    this.tomorrow = new Date(this.today);
    this.tomorrow.setDate(this.today.getDate() + 1);

    // Mapa de urgência base por prazo
    this.URGENCY_BASE = {
      'Atrasado': 100,
      'Hoje':      70,
      'Amanhã':    40,
      'No Prazo':  15,
      'Sem Data':   5
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CÁLCULO INDIVIDUAL DE SLA
  // ─────────────────────────────────────────────────────────────

  /**
   * Calcula SLA para um registro individual.
   * @param {Object} record
   * @returns {{ prazo, slaRaw, diasAtraso, targetDate }}
   */
  calculateForRecord(record) {
    const targetDate = this._getTargetDate(record);

    if (!targetDate) {
      if (record.situacao_prev && record.tipo_op !== 'Entrega') {
        const prazo = record.situacao_prev;
        return {
          prazo,
          slaRaw: this._getSlaRawFromPrazo(prazo),
          diasAtraso: 0,
          targetDate: null
        };
      }
      return { prazo: 'Sem Data', slaRaw: 1, diasAtraso: 0, targetDate: null };
    }

    const diffMs   = targetDate - this.today;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const todayStr    = this.today.toDateString();
    const tomorrowStr = this.tomorrow.toDateString();
    const targetStr   = targetDate.toDateString();

    let prazo;
    if      (targetStr === todayStr)    prazo = 'Hoje';
    else if (targetStr === tomorrowStr) prazo = 'Amanhã';
    else if (targetDate > this.tomorrow) prazo = 'No Prazo';
    else                                 prazo = 'Atrasado';

    return {
      prazo,
      slaRaw:     diffDays,
      diasAtraso: Math.max(0, -diffDays),
      targetDate
    };
  }

  // ─────────────────────────────────────────────────────────────
  // SCORE DE URGÊNCIA (novo v8.4)
  // ─────────────────────────────────────────────────────────────

  /**
   * Retorna um score numérico de urgência para um registro (0–200).
   * Quanto maior, mais urgente.
   *
   * Composição:
   *   prazo base (0–100)
   *   + is_critico (+30)
   *   + is_agend   (+20)
   *   + dias_atraso × 2 (até +50)
   *
   * @param {Object} record
   * @returns {number}
   */
  getUrgencyScore(record) {
    const sla = this.calculateForRecord(record);
    let score = this.URGENCY_BASE[sla.prazo] ?? 5;

    if (record.is_critico) score += 30;
    if (record.is_agend)   score += 20;

    score += Math.min((sla.diasAtraso || 0) * 2, 50);

    return Math.min(score, 200);
  }

  // ─────────────────────────────────────────────────────────────
  // ESTATÍSTICAS AGREGADAS
  // ─────────────────────────────────────────────────────────────

  /**
   * Calcula estatísticas agregadas para um conjunto de registros.
   * @param {Array} records
   * @returns {Object}
   */
  calculateAggregateStats(records) {
    if (!records || records.length === 0) {
      return {
        total: 0, atrasado: 0, hoje: 0, amanha: 0,
        noPrazo: 0, semData: 0, slaPercent: 0,
        peso: 0, valor: 0, volumes: 0
      };
    }

    let atrasado = 0, hoje = 0, amanha = 0, noPrazo = 0, semData = 0;
    let peso = 0, valor = 0, volumes = 0;

    for (const r of records) {
      switch (r.prazo) {
        case 'Atrasado': atrasado++; break;
        case 'Hoje':     hoje++;     break;
        case 'Amanhã':   amanha++;   break;
        case 'No Prazo': noPrazo++;  break;
        case 'Sem Data': semData++;  break;
      }
      peso    += (r.p_oper  || 0);
      valor   += (r.vl_nf   || 0);
      volumes += (r.qtd_vol || 0);
    }

    const total      = records.length;
    const slaPercent = total > 0 ? ((total - atrasado) / total * 100) : 0;

    return { total, atrasado, hoje, amanha, noPrazo, semData, slaPercent, peso, valor, volumes };
  }

  // ─────────────────────────────────────────────────────────────
  // AVALIAÇÃO DE CENÁRIO (novo v8.4)
  // ─────────────────────────────────────────────────────────────

  /**
   * Avalia qualitativamente o resultado de um cenário de embarque.
   *
   * @param {Array}  selected - CTEs selecionados para embarque
   * @param {Array}  rejected - CTEs não selecionados
   * @param {Object} capacity - { weight, value }
   * @returns {{
   *   slaGain: number,
   *   criticalCoverage: number,
   *   scheduledCoverage: number,
   *   atrasadosLeft: number,
   *   scenarioScore: number,
   *   label: string
   * }}
   */
  evaluateScenario(selected, rejected, capacity) {
    const allRecords = [...selected, ...rejected];
    const total      = allRecords.length;
    if (total === 0) {
      return { slaGain: 0, criticalCoverage: 100, scheduledCoverage: 100, atrasadosLeft: 0, scenarioScore: 0, label: 'Vazio' };
    }

    // Cobertura de críticos
    const critTotal = allRecords.filter(r => r.is_critico).length;
    const critSel   = selected.filter(r => r.is_critico).length;
    const criticalCoverage = critTotal > 0 ? (critSel / critTotal) * 100 : 100;

    // Cobertura de agendados
    const agendTotal = allRecords.filter(r => r.is_agend).length;
    const agendSel   = selected.filter(r => r.is_agend).length;
    const scheduledCoverage = agendTotal > 0 ? (agendSel / agendTotal) * 100 : 100;

    // SLA Gain: quantos atrasados saem do inventário no embarque
    const atrasadosSel  = selected.filter(r => r.prazo === 'Atrasado').length;
    const atrasadosRej  = rejected.filter(r => r.prazo === 'Atrasado').length;
    const atrasadosLeft = atrasadosRej;
    const slaGain       = atrasadosSel;

    // Utilização de peso
    const usedWeight  = selected.reduce((s, r) => s + (r.p_oper || 0), 0);
    const utilization = capacity.weight > 0 ? Math.min(usedWeight / capacity.weight, 1) : 0;

    // Score geral do cenário (0–100)
    const scenarioScore = Math.round(
      criticalCoverage  * 0.40
    + scheduledCoverage * 0.20
    + utilization * 100  * 0.25
    + (total > 0 ? (selected.length / total) * 100 : 0) * 0.15
    );

    let label;
    if      (scenarioScore >= 90) label = 'Excelente';
    else if (scenarioScore >= 75) label = 'Bom';
    else if (scenarioScore >= 55) label = 'Razoável';
    else                          label = 'Crítico';

    return {
      slaGain,
      criticalCoverage: parseFloat(criticalCoverage.toFixed(1)),
      scheduledCoverage: parseFloat(scheduledCoverage.toFixed(1)),
      atrasadosLeft,
      scenarioScore,
      label
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PROJEÇÃO DE IMPACTO NO SLA GLOBAL (novo v8.4)
  // ─────────────────────────────────────────────────────────────

  /**
   * Projeta o impacto que o embarque terá no SLA global da filial.
   *
   * @param {Array} selected  - CTEs que vão embarcar
   * @param {Array} allPool   - Todos os CTEs disponíveis (pool total)
   * @returns {{
   *   slaAntes: number,
   *   slaDepois: number,
   *   ganho: number,
   *   atrasadosRemovidos: number,
   *   interpretation: string
   * }}
   */
  projectSLAImpact(selected, allPool) {
    if (!allPool || allPool.length === 0) {
      return { slaAntes: 0, slaDepois: 0, ganho: 0, atrasadosRemovidos: 0, interpretation: 'Sem dados' };
    }

    const statsAntes  = this.calculateAggregateStats(allPool);
    const selectedIds = new Set(selected.map(r => r.ctrc || r.cod));
    const remaining   = allPool.filter(r => !selectedIds.has(r.ctrc || r.cod));
    const statsDepois = this.calculateAggregateStats(remaining);

    const slaAntes  = parseFloat(statsAntes.slaPercent.toFixed(1));
    const slaDepois = parseFloat(statsDepois.slaPercent.toFixed(1));
    const ganho     = parseFloat((slaDepois - slaAntes).toFixed(1));

    const atrasadosRemovidos = statsAntes.atrasado - statsDepois.atrasado;

    let interpretation;
    if      (ganho >= 10) interpretation = `Embarque impacta muito positivamente o SLA (+${ganho}%)`;
    else if (ganho >= 3)  interpretation = `Embarque melhora o SLA em ${ganho}%`;
    else if (ganho >= 0)  interpretation = `Embarque mantém o nível de SLA (${ganho >= 0 ? '+' : ''}${ganho}%)`;
    else                  interpretation = `Atenção: embarque piora o SLA em ${Math.abs(ganho)}%`;

    return { slaAntes, slaDepois, ganho, atrasadosRemovidos, interpretation };
  }

  // ─────────────────────────────────────────────────────────────
  // ELEGIBILIDADE PARA PLANEJAMENTO
  // ─────────────────────────────────────────────────────────────

  /**
   * @param {Object} record
   * @param {Object} options
   * @returns {boolean}
   */
  isEligibleForPlanning(record, options = {}) {
    const {
      allowNoPrazo    = false,
      allowSemData    = false,
      forceIfCritical  = true,
      forceIfScheduled = true
    } = options;

    if (forceIfCritical  && record.is_critico) return true;
    if (forceIfScheduled && record.is_agend)   return true;

    switch (record.prazo) {
      case 'Atrasado':
      case 'Hoje':
      case 'Amanhã':  return true;
      case 'No Prazo': return allowNoPrazo;
      case 'Sem Data': return allowSemData;
      default:         return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNOS
  // ─────────────────────────────────────────────────────────────

  _getTargetDate(record) {
    const dateStr = (record.tipo_op === 'Entrega')
      ? record.dt_entrega
      : record.dt_prev;
    return this._parseDate(dateStr);
  }

  _parseDate(str) {
    if (!str) return null;
    const s = String(str).trim().slice(0, 10);

    let match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const year  = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day   = parseInt(match[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  _getSlaRawFromPrazo(prazo) {
    switch (prazo) {
      case 'Atrasado': return -1;
      case 'Hoje':
      case 'Amanhã':   return 0;
      default:         return 1;
    }
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.SLACalculator = SLACalculator;
}

console.log('[NEXUS HUB v8.4] SLA Calculator loaded ✓ (+ Urgency Score + Scenario Eval + SLA Impact)');
