// ═══════════════════════════════════════════════════════════════
// NEXUS HUB v8.2 - CONSTANTS
// ═══════════════════════════════════════════════════════════════
const CRITICAL_CLIENTS = ['ACHE', 'LABOFARMA', 'SANOFI', 'OPELLA', 'BOSCH', 'BOTICARIO', 'ABBOTT', 'SANDOZ', 'CASIO', 'VEGAN', 'MEDLEY'];

// ────────────────────────────────────────────────────────────────
// 5. UTILITY FUNCTIONS (Bug Fixes)
// ────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeAverage(total, count) {
  return count > 0 ? total / count : 0;
}

function safePercentage(part, total) {
  return total > 0 ? (part / total) * 100 : 0;
}

function calculateDelay(dataSaida, dataEntrega) {
  if (!dataSaida || !dataEntrega) return 0;
  const saida = new Date(dataSaida);
  const entrega = new Date(dataEntrega);
  if (isNaN(saida.getTime()) || isNaN(entrega.getTime())) return 0;
  if (saida > entrega) {
    const diffTime = Math.abs(saida - entrega);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return 0;
}

// ────────────────────────────────────────────────────────────────
// 6. PERFORMANCE (Cache & Debounce)
// ────────────────────────────────────────────────────────────────
class SmartCache {
  constructor(maxSize = 50) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    if (this.cache.has(key)) {
      this.hits++;
      const item = this.cache.get(key);
      if (item.expires && Date.now() > item.expires) {
        this.cache.delete(key);
        this.misses++;
        return null;
      }
      // Re-insertar para manter no final do Map (LRU real)
      this.cache.delete(key);
      this.cache.set(key, item);
      return item.value;
    }
    this.misses++;
    return null;
  }

  set(key, value, ttl = 60000) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value: value,
      expires: ttl ? Date.now() + ttl : null,
      created: Date.now()
    });
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: safePercentage(this.hits, total),
      size: this.cache.size
    };
  }
}

const cache = new SmartCache();

function debounce(func, wait = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function throttle(func, limit = 100) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ────────────────────────────────────────────────────────────────
// 7. OPTIMIZED LOAD PLANNING (FFD Algorithm)
// ────────────────────────────────────────────────────────────────
function optimizedLoadPlanning(docs, options = {}) {
  const { capacity = 170, maxWeight = 15000, groupByDestination = true } = options;

  if (!Array.isArray(docs) || docs.length === 0) return [];

  const prepared = docs.map(doc => ({
    ...doc,
    volume: parseFloat(doc.m3) || 0,
    weight: parseFloat(doc.peso) || 0
  })).filter(doc => doc.volume > 0);

  let groups = {};
  if (groupByDestination) {
    prepared.forEach(doc => {
      const dest = doc.dest || 'SEM_DESTINO';
      if (!groups[dest]) groups[dest] = [];
      groups[dest].push(doc);
    });
  } else {
    groups['ALL'] = prepared;
  }

  const allTrucks = [];
  let truckCounter = 1;

  for (const [destination, groupDocs] of Object.entries(groups)) {
    const sorted = [...groupDocs].sort((a, b) => b.volume - a.volume);
    const trucks = [];

    for (const doc of sorted) {
      let placed = false;
      for (const truck of trucks) {
        if (truck.usedVolume + doc.volume <= capacity &&
          truck.usedWeight + doc.weight <= maxWeight) {
          truck.docs.push(doc);
          truck.usedVolume += doc.volume;
          truck.usedWeight += doc.weight;
          placed = true;
          break;
        }
      }

      if (!placed) {
        trucks.push({
          id: truckCounter++,
          destination,
          docs: [doc],
          usedVolume: doc.volume,
          usedWeight: doc.weight,
          capacity,
          maxWeight
        });
      }
    }

    trucks.forEach(truck => {
      truck.utilizationVolume = safePercentage(truck.usedVolume, capacity);
      truck.utilizationWeight = safePercentage(truck.usedWeight, maxWeight);
      truck.efficiency = Math.min(truck.utilizationVolume, truck.utilizationWeight);
    });

    allTrucks.push(...trucks);
  }

  return allTrucks;
}

console.log('[NEXUS HUB v7] Security & Performance layer loaded ✓');

