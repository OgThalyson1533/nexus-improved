// ────────────────────────────────────────────────────────────────
// 1. SANITIZATION (XSS Protection)
// ────────────────────────────────────────────────────────────────
function sanitizeHTML(str) {
  if (!str) return '';
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeHTML(obj) : obj;
  }
  const sanitized = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    sanitized[key] = sanitizeObject(obj[key]);
  }
  return sanitized;
}

// ────────────────────────────────────────────────────────────────
// 2. FILE VALIDATION
// ────────────────────────────────────────────────────────────────
const FILE_VALIDATION = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ],
  ALLOWED_EXTENSIONS: ['.xls', '.xlsx', '.csv']
};

function validateFile(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado');
  if (file.size > FILE_VALIDATION.MAX_SIZE) {
    throw new Error(`Arquivo muito grande. Máximo: ${FILE_VALIDATION.MAX_SIZE / 1024 / 1024}MB`);
  }
  if (file.size === 0) throw new Error('Arquivo vazio');
  if (!FILE_VALIDATION.ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Tipo não permitido: ${file.type}`);
  }
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!FILE_VALIDATION.ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Extensão não permitida: ${ext}`);
  }
  return true;
}

function validateCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const dangerous = ['=', '@', '+', '-', '\t', '\r'];
    if (dangerous.some(char => value.startsWith(char))) {
      console.warn(`Célula perigosa neutralizada: ${value}`);
      return "'" + value;
    }
  }
  return value;
}

// ────────────────────────────────────────────────────────────────
// 3. SECURE STORAGE (Encryption)
// ────────────────────────────────────────────────────────────────
class SecureStorage {
  constructor() {
    this.STORAGE_VERSION = '2.0';
    this.DATA_EXPIRY_HOURS = 24;
    // Chave estática base para derivação (em um app real deveria vir de um backend/KMS)
    this.salt = "nexus_hub_v8_salt_2025";
  }

  async _getKey() {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.salt),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("nexus_sec_storage"),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  async encrypt(data) {
    try {
      const key = await this._getKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(data));
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded
      );

      // Convert to base64 for storage
      const encryptedArray = Array.from(new Uint8Array(encryptedBuffer));
      const ivArray = Array.from(iv);

      return btoa(JSON.stringify({
        iv: ivArray,
        data: encryptedArray
      }));
    } catch (error) {
      console.error('Erro ao criptografar:', error);
      throw new Error('Falha na criptografia');
    }
  }

  async decrypt(encryptedStr) {
    try {
      const key = await this._getKey();
      const parsed = JSON.parse(atob(encryptedStr));
      const iv = new Uint8Array(parsed.iv);
      const encryptedData = new Uint8Array(parsed.data);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encryptedData
      );

      const decoded = new TextDecoder().decode(decryptedBuffer);
      return JSON.parse(decoded);
    } catch (error) {
      console.error('Erro ao descriptografar:', error);
      throw new Error('Falha na descriptografia');
    }
  }

  async generateHash(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async save(key, data) {
    try {
      const encrypted = await this.encrypt(data);
      const hash = await this.generateHash(encrypted);
      const envelope = {
        version: this.STORAGE_VERSION,
        timestamp: Date.now(),
        hash: hash,
        data: encrypted
      };
      localStorage.setItem(key, JSON.stringify(envelope));
      localStorage.setItem(`${key}_backup`, JSON.stringify(envelope));
      return true;
    } catch (error) {
      console.error('Erro ao salvar:', error);
      return false;
    }
  }

  async load(key) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      const envelope = JSON.parse(stored);

      // Se for v1.0 (base64 antigo), limpar e retornar nulo para forçar recarga
      if (envelope.version === '1.0') {
        this.remove(key);
        return null;
      }

      const ageHours = (Date.now() - envelope.timestamp) / (1000 * 60 * 60);
      if (ageHours > this.DATA_EXPIRY_HOURS) {
        this.remove(key);
        return null;
      }
      const currentHash = await this.generateHash(envelope.data);
      if (currentHash !== envelope.hash) {
        console.error('Dados corrompidos! Usando backup...');
        return await this.loadBackup(key);
      }
      return await this.decrypt(envelope.data);
    } catch (error) {
      console.error('Erro ao carregar:', error);
      return await this.loadBackup(key);
    }
  }

  async loadBackup(key) {
    try {
      const backup = localStorage.getItem(`${key}_backup`);
      if (!backup) return null;
      const envelope = JSON.parse(backup);
      if (envelope.version === '1.0') return null;
      return await this.decrypt(envelope.data);
    } catch (error) {
      return null;
    }
  }

  remove(key) {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}_backup`);
  }
}

const secureStorage = new SecureStorage();

// ────────────────────────────────────────────────────────────────
// 4. INPUT VALIDATION
// ────────────────────────────────────────────────────────────────
const Validators = {
  date(value) {
    if (!value) return { valid: false, error: 'Data obrigatória' };
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) {
      return { valid: false, error: 'Formato inválido (use YYYY-MM-DD)' };
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Data inválida' };
    }
    const minDate = new Date('2020-01-01');
    const maxDate = new Date('2030-12-31');
    if (date < minDate || date > maxDate) {
      return { valid: false, error: 'Data fora do range permitido' };
    }
    return { valid: true, value: date };
  },

  docNumber(value) {
    if (!value) return { valid: false, error: 'Documento obrigatório' };
    const cleaned = String(value)?.trim();
    if (cleaned.length === 0) return { valid: false, error: 'Documento vazio' };
    if (cleaned.length > 50) return { valid: false, error: 'Documento muito longo' };
    if (!/^[a-zA-Z0-9\-_\/]+$/.test(cleaned)) {
      return { valid: false, error: 'Documento contém caracteres inválidos' };
    }
    return { valid: true, value: cleaned };
  },

  volume(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return { valid: false, error: 'Volume deve ser um número' };
    if (num < 0) return { valid: false, error: 'Volume não pode ser negativo' };
    if (num > 200) return { valid: false, error: 'Volume muito grande (máx: 200m³)' };
    return { valid: true, value: num };
  }
};

function validateDocument(doc) {
  const errors = {};
  const fields = {
    doc: Validators.docNumber(doc.doc),
    m3: Validators.volume(doc.m3)
  };
  for (const [field, result] of Object.entries(fields)) {
    if (!result.valid) errors[field] = result.error;
  }
  return { valid: Object.keys(errors).length === 0, errors: errors };
}

