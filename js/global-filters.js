// ═══════════════════════════════════════════════════════════════
// NEXUS HUB v8.3 - GLOBAL FILTERS (Centralized State)
// ═══════════════════════════════════════════════════════════════

/**
 * Gerenciador centralizado de filtros que mantém consistência entre todas as telas.
 * Implementa padrão Observer para notificar mudanças.
 */
class GlobalFilters {
  constructor() {
    this.filters = {
      filial: null,
      destino: null,
      origem: null,
      prazo: null,
      risco: null,
      status: null,
      tipoOp: null,
      periodo: { inicio: null, fim: null },
      busca: '',
      dashboardType: null // null, 'COLETA', 'REEMBARQUE', 'ENTREGA'
    };

    this.observers = [];
    this._loadFromStorage();
  }

  /**
   * Registra um observer para mudanças de filtros
   * @param {Function} callback - Callback(filterKey, newValue, oldValue)
   */
  subscribe(callback) {
    this.observers.push(callback);
    return () => {
      this.observers = this.observers.filter(cb => cb !== callback);
    };
  }

  /**
   * Define um filtro específico
   * @param {string} key - Nome do filtro
   * @param {*} value - Valor do filtro
   * @param {boolean} persist - Se deve persistir no localStorage
   */
  set(key, value, persist = true) {
    const oldValue = this.filters[key];

    // Normalizar valor vazio
    if (value === '' || value === 'all' || value === 'Todos') {
      value = null;
    }

    this.filters[key] = value;

    // Persistir se solicitado
    if (persist) {
      this._saveToStorage();
    }

    // Notificar observers apenas se o valor mudou
    if (oldValue !== value) {
      this._notifyObservers(key, value, oldValue);
    }
  }

  /**
   * Obtém um filtro específico
   * @param {string} key - Nome do filtro
   * @returns {*} Valor do filtro
   */
  get(key) {
    return this.filters[key];
  }

  /**
   * Define múltiplos filtros de uma vez
   * @param {Object} filters - Objeto com múltiplos filtros
   */
  setMultiple(filters) {
    Object.entries(filters).forEach(([key, value]) => {
      this.set(key, value, false);
    });
    this._saveToStorage();
  }

  /**
   * Limpa todos os filtros
   */
  clear() {
    const oldFilters = { ...this.filters };

    this.filters = {
      filial: null,
      destino: null,
      origem: null,
      prazo: null,
      risco: null,
      status: null,
      tipoOp: null,
      periodo: { inicio: null, fim: null },
      busca: '',
      dashboardType: null
    };

    this._saveToStorage();
    this._notifyObservers('*', this.filters, oldFilters);
  }

  /**
   * Aplica filtros a um dataset
   * @param {Array} data - Array de registros
   * @param {Object} options - Opções de filtro
   * @returns {Array} Dados filtrados
   */
  apply(data, options = {}) {
    if (!data || data.length === 0) return [];

    let filtered = [...data];

    // Filtro: Dashboard Type (afeta base de dados)
    if (this.filters.dashboardType) {
      const typeMap = {
        'COLETA': 'Embarque',
        'REEMBARQUE': 'Reembarque',
        'ENTREGA': 'Entrega'
      };
      const targetType = typeMap[this.filters.dashboardType];
      if (targetType) {
        filtered = filtered.filter(r => r.tipo_op === targetType);
      }
    }

    // Filtro: Filial (com opção de incluir origem)
    if (this.filters.filial) {
      const includeOrigem = options.matchOrigem !== false;
      filtered = filtered.filter(r => {
        if (r.estoque === this.filters.filial) return true;
        if (includeOrigem && r.origem === this.filters.filial) return true;
        return false;
      });
    }

    // Filtro: Destino
    if (this.filters.destino) {
      filtered = filtered.filter(r => r.destino === this.filters.destino);
    }

    // Filtro: Origem
    if (this.filters.origem) {
      filtered = filtered.filter(r => r.origem === this.filters.origem);
    }

    // Filtro: Prazo
    if (this.filters.prazo) {
      filtered = filtered.filter(r => r.prazo === this.filters.prazo);
    }

    // Filtro: Risco
    if (this.filters.risco) {
      filtered = filtered.filter(r => r.risco === this.filters.risco);
    }

    // Filtro: Status
    if (this.filters.status) {
      filtered = filtered.filter(r => r.status === this.filters.status);
    }

    // Filtro: Tipo Operação
    if (this.filters.tipoOp) {
      filtered = filtered.filter(r => r.tipo_op === this.filters.tipoOp);
    }

    // Filtro: Período
    if (this.filters.periodo.inicio || this.filters.periodo.fim) {
      filtered = filtered.filter(r => {
        const dataEmissao = this._parseDate(r.emissao || r.data);
        if (!dataEmissao) return true; // Sem data: não filtrar

        if (this.filters.periodo.inicio) {
          const inicio = this._parseDate(this.filters.periodo.inicio);
          if (inicio && dataEmissao < inicio) return false;
        }

        if (this.filters.periodo.fim) {
          const fim = this._parseDate(this.filters.periodo.fim);
          if (fim && dataEmissao > fim) return false;
        }

        return true;
      });
    }

    // Filtro: Busca textual
    if (this.filters.busca && this.filters.busca.trim()) {
      const termo = this.filters.busca.toLowerCase().trim();
      filtered = filtered.filter(r => this._matchSearch(r, termo));
    }

    return filtered;
  }

  /**
   * Sincroniza filtros de um formulário HTML
   * @param {string} prefix - Prefixo dos IDs dos inputs (ex: 'est', 'pat', 'atr')
   */
  syncFromForm(prefix) {
    const getValue = (id) => {
      const el = document.getElementById(prefix + id);
      return el ? el.value : null;
    };

    this.setMultiple({
      filial: getValue('Filial'),
      destino: getValue('Dest'),
      origem: getValue('Origem'),
      prazo: getValue('Prazo'),
      risco: getValue('Risco'),
      status: getValue('Status'),
      busca: getValue('Srch')
    });
  }

  /**
   * Atualiza formulário HTML com valores dos filtros
   * @param {string} prefix - Prefixo dos IDs dos inputs
   */
  syncToForm(prefix) {
    const setValue = (id, value) => {
      const el = document.getElementById(prefix + id);
      if (el) el.value = value || '';
    };

    setValue('Filial', this.filters.filial);
    setValue('Dest', this.filters.destino);
    setValue('Origem', this.filters.origem);
    setValue('Prazo', this.filters.prazo);
    setValue('Risco', this.filters.risco);
    setValue('Status', this.filters.status);
    setValue('Srch', this.filters.busca);
  }

  /**
   * Retorna resumo textual dos filtros ativos
   * @returns {string}
   */
  getSummary() {
    const active = [];

    if (this.filters.filial) active.push(`Filial: ${this.filters.filial}`);
    if (this.filters.destino) active.push(`Destino: ${this.filters.destino}`);
    if (this.filters.prazo) active.push(`Prazo: ${this.filters.prazo}`);
    if (this.filters.risco) active.push(`Risco: ${this.filters.risco}`);
    if (this.filters.status) active.push(`Status: ${this.filters.status}`);
    if (this.filters.busca) active.push(`Busca: "${this.filters.busca}"`);

    return active.length > 0 ? active.join(' · ') : 'Sem filtros ativos';
  }

  /**
   * Notifica todos os observers
   * @private
   */
  _notifyObservers(key, newValue, oldValue) {
    this.observers.forEach(callback => {
      try {
        callback(key, newValue, oldValue);
      } catch (e) {
        console.error('[GlobalFilters] Error in observer:', e);
      }
    });
  }

  /**
   * Salva filtros no localStorage
   * @private
   */
  _saveToStorage() {
    try {
      localStorage.setItem('nexus_global_filters', JSON.stringify(this.filters));
    } catch (e) {
      console.warn('[GlobalFilters] Cannot save to localStorage:', e);
    }
  }

  /**
   * Carrega filtros do localStorage
   * @private
   */
  _loadFromStorage() {
    try {
      const saved = localStorage.getItem('nexus_global_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.filters = { ...this.filters, ...parsed };
      }
    } catch (e) {
      console.warn('[GlobalFilters] Cannot load from localStorage:', e);
    }
  }

  /**
   * Parse de data
   * @private
   */
  _parseDate(str) {
    if (!str) return null;
    const s = String(str).trim().slice(0, 10);

    // DD/MM/YYYY
    let match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(year, parseInt(match[2], 10) - 1, parseInt(match[1], 10));
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // YYYY-MM-DD
    match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const d = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
      d.setHours(0, 0, 0, 0);
      return d;
    }

    return null;
  }

  /**
   * Busca textual em registro
   * @private
   */
  _matchSearch(record, termo) {
    const searchable = [
      record.ctrc,
      record.cod,
      record.remetente,
      record.destinatario,
      record.cidade,
      record.origem,
      record.destino,
      record.estoque,
      record.status,
      record.prazo,
      record.risco
    ].filter(v => v).join(' ').toLowerCase();

    return searchable.includes(termo);
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.GlobalFilters = GlobalFilters;

  // Criar instância global
  if (!window.globalFilters) {
    window.globalFilters = new GlobalFilters();
  }
}

console.log('[NEXUS HUB v8.3] Global Filters loaded ✓');
