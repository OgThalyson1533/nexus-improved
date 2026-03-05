// ═══════════════════════════════════════════════════════════════
// NEXUS HUB v8.3 - SLA CALCULATOR (Centralized)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculadora centralizada de SLA para garantir consistência entre todas as telas.
 * Esta é a ÚNICA fonte de verdade para cálculos de prazo e SLA.
 */
class SLACalculator {
  constructor(referenceDate = null) {
    this.today = referenceDate ? new Date(referenceDate) : new Date();
    this.today.setHours(0, 0, 0, 0);
    
    this.tomorrow = new Date(this.today);
    this.tomorrow.setDate(this.today.getDate() + 1);
  }

  /**
   * Calcula SLA para um registro individual
   * @param {Object} record - Registro com dt_prev, dt_entrega, tipo_op
   * @returns {Object} { prazo, slaRaw, diasAtraso, targetDate }
   */
  calculateForRecord(record) {
    const targetDate = this._getTargetDate(record);
    
    if (!targetDate) {
      // Sem data: usa situacao_prev como fallback ou "Sem Data"
      if (record.situacao_prev && record.tipo_op !== 'Entrega') {
        const prazo = record.situacao_prev;
        return {
          prazo,
          slaRaw: this._getSlaRawFromPrazo(prazo),
          diasAtraso: 0,
          targetDate: null
        };
      }
      
      return {
        prazo: 'Sem Data',
        slaRaw: 1,
        diasAtraso: 0,
        targetDate: null
      };
    }

    const diffMs = targetDate - this.today;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    let prazo;
    const targetStr = targetDate.toDateString();
    const todayStr = this.today.toDateString();
    const tomorrowStr = this.tomorrow.toDateString();
    
    if (targetStr === todayStr) {
      prazo = 'Hoje';
    } else if (targetStr === tomorrowStr) {
      prazo = 'Amanhã';
    } else if (targetDate > this.tomorrow) {
      prazo = 'No Prazo';
    } else {
      prazo = 'Atrasado';
    }
    
    return {
      prazo,
      slaRaw: diffDays,
      diasAtraso: Math.max(0, -diffDays),
      targetDate
    };
  }

  /**
   * Calcula SLA agregado para um conjunto de registros
   * @param {Array} records - Array de registros
   * @returns {Object} Estatísticas agregadas
   */
  calculateAggregateStats(records) {
    if (!records || records.length === 0) {
      return {
        total: 0,
        atrasado: 0,
        hoje: 0,
        amanha: 0,
        noPrazo: 0,
        semData: 0,
        slaPercent: 0,
        peso: 0,
        valor: 0,
        volumes: 0
      };
    }

    let atrasado = 0, hoje = 0, amanha = 0, noPrazo = 0, semData = 0;
    let peso = 0, valor = 0, volumes = 0;

    for (const r of records) {
      // Contar por prazo
      switch (r.prazo) {
        case 'Atrasado': atrasado++; break;
        case 'Hoje': hoje++; break;
        case 'Amanhã': amanha++; break;
        case 'No Prazo': noPrazo++; break;
        case 'Sem Data': semData++; break;
      }

      // Agregar valores
      peso += (r.p_oper || 0);
      valor += (r.vl_nf || 0);
      volumes += (r.qtd_vol || 0);
    }

    const total = records.length;
    // SLA = (total - atrasados) / total * 100
    const slaPercent = total > 0 ? ((total - atrasado) / total * 100) : 0;

    return {
      total,
      atrasado,
      hoje,
      amanha,
      noPrazo,
      semData,
      slaPercent,
      peso,
      valor,
      volumes
    };
  }

  /**
   * Obtém a data alvo baseada no tipo de operação
   * @private
   */
  _getTargetDate(record) {
    const dateStr = (record.tipo_op === 'Entrega') 
      ? record.dt_entrega 
      : record.dt_prev;
    
    return this._parseDate(dateStr);
  }

  /**
   * Parse de data com múltiplos formatos suportados
   * @private
   */
  _parseDate(str) {
    if (!str) return null;
    
    const s = String(str).trim().slice(0, 10);
    
    // Formato: DD/MM/YYYY ou DD-MM-YYYY
    let match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      let year = parseInt(match[3], 10);
      
      // Ano com 2 dígitos: assumir 20XX
      if (year < 100) year += 2000;
      
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
    
    // Formato: YYYY-MM-DD
    match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
    
    return null;
  }

  /**
   * Converte prazo textual em slaRaw numérico
   * @private
   */
  _getSlaRawFromPrazo(prazo) {
    switch (prazo) {
      case 'Atrasado': return -1;
      case 'Hoje':
      case 'Amanhã': return 0;
      case 'No Prazo': return 1;
      case 'Sem Data': return 1;
      default: return 1;
    }
  }

  /**
   * Valida se um registro está elegível para planejamento baseado em prazo
   * @param {Object} record - Registro a validar
   * @param {Object} options - Opções de elegibilidade
   * @returns {boolean}
   */
  isEligibleForPlanning(record, options = {}) {
    const {
      allowNoPrazo = false,
      allowSemData = false,
      forceIfCritical = true,
      forceIfScheduled = true
    } = options;

    // Críticos e agendados sempre elegíveis
    if (forceIfCritical && record.is_critico) return true;
    if (forceIfScheduled && record.is_agend) return true;

    // Baseado no prazo
    switch (record.prazo) {
      case 'Atrasado':
      case 'Hoje':
      case 'Amanhã':
        return true;
      
      case 'No Prazo':
        return allowNoPrazo;
      
      case 'Sem Data':
        return allowSemData;
      
      default:
        return false;
    }
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.SLACalculator = SLACalculator;
}

console.log('[NEXUS HUB v8.3] SLA Calculator loaded ✓');
