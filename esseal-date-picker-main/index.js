/**
 * EssealDatePicker v2.0.0
 * A dependency-free, React-safe date picker.
 */
class EssealDatePicker {
  constructor(target, options = {}) {
    this.input = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.input) throw new Error('EssealDatePicker: Target input not found.');
    
    this.options = {
      mode: 'single',
      locale: navigator.language || 'en-US',
      minDate: null,
      maxDate: null,
      primaryColor: '#3b82f6',
      textColor: '#1f2937',
      zIndex: 9999,
      format: (date) => date.toLocaleDateString('en-CA'),
      onChange: null,
      ...options,
    };

    this.state = {
      viewDate: new Date(),
      selectedDate: null,
      rangeStart: null,
      rangeEnd: null,
      isVisible: false,
      view: 'day',
    };

    if (this.options.minDate) this.options.minDate = this._normalizeDate(this.options.minDate);
    if (this.options.maxDate) this.options.maxDate = this._normalizeDate(this.options.maxDate);

    this._handleInputClick = this._handleInputClick.bind(this);
    this._handleDocumentClick = this._handleDocumentClick.bind(this);
    this._handleResize = this._handleResize.bind(this);

    this._init();
  }

  _init() {
    this._injectStyles();
    this._createDOM();
    this._attachListeners();
  }

  _injectStyles() {
    const styleId = 'esseal-datepicker-styles';
    if (document.getElementById(styleId)) return;

    const css = `
      .dp-container {
        position: fixed;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        font-family: system-ui, -apple-system, sans-serif;
        width: 280px;
        padding: 16px;
        display: none;
        z-index: ${this.options.zIndex};
        color: ${this.options.textColor};
        user-select: none;
      }
      .dp-container.dp-visible { display: block; }
      .dp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .dp-nav-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: inherit; }
      .dp-nav-btn:hover { background: #f3f4f6; }
      .dp-title { font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
      .dp-title:hover { background: #f3f4f6; }
      .dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
      .dp-grid-wide { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .dp-cell { 
        height: 36px; display: flex; align-items: center; justify-content: center; 
        font-size: 0.875rem; cursor: pointer; border-radius: 4px; 
      }
      .dp-label { font-size: 0.75rem; font-weight: 500; color: #9ca3af; cursor: default; }
      .dp-cell:not(.dp-label):not(.dp-disabled):hover { background-color: #f3f4f6; }
      .dp-other-month { color: #d1d5db; }
      .dp-disabled { opacity: 0.3; cursor: not-allowed; text-decoration: line-through; }
      .dp-selected, .dp-range-start, .dp-range-end { color: #fff !important; }
      .dp-in-range { border-radius: 0; }
      .dp-today { border: 1px solid ${this.options.primaryColor}; }
    `;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  _createDOM() {
    this.root = document.createElement('div');
    this.root.className = 'dp-container';
    this.root.setAttribute('role', 'dialog');
    
    // Construct Header
    const header = document.createElement('div');
    header.className = 'dp-header';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'dp-nav-btn';
    prevBtn.dataset.action = 'prev';
    prevBtn.innerHTML = '&lt;';

    const title = document.createElement('span');
    title.className = 'dp-title';
    title.dataset.action = 'switch-view';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'dp-nav-btn';
    nextBtn.dataset.action = 'next';
    nextBtn.innerHTML = '&gt;';

    header.append(prevBtn, title, nextBtn);
    
    const body = document.createElement('div');
    body.className = 'dp-body';

    this.root.append(header, body);
    document.body.appendChild(this.root);

    // Event Delegation
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target.closest('[data-action]') || e.target.closest('.dp-cell');
      if (!target) return;

      if (target.dataset.action) {
        this._handleNavigation(target.dataset.action);
      } else if (target.classList.contains('dp-cell') && !target.classList.contains('dp-disabled') && !target.classList.contains('dp-label')) {
        this._handleSelection(target);
      }
    });
  }

  _attachListeners() {
    this.input.addEventListener('click', this._handleInputClick);
    this.input.addEventListener('focus', this._handleInputClick);
    document.addEventListener('click', this._handleDocumentClick);
    window.addEventListener('resize', this._handleResize);
    window.addEventListener('scroll', this._handleResize, true);
  }

  destroy() {
    this.root.remove();
    this.input.removeEventListener('click', this._handleInputClick);
    this.input.removeEventListener('focus', this._handleInputClick);
    document.removeEventListener('click', this._handleDocumentClick);
    window.removeEventListener('resize', this._handleResize);
    window.removeEventListener('scroll', this._handleResize, true);
  }

  /* ================= Rendering ================= */

  _render() {
    const body = this.root.querySelector('.dp-body');
    const title = this.root.querySelector('.dp-title');
    body.replaceChildren(); // Safe and fast clearing

    if (this.state.view === 'day') this._renderDays(body, title);
    else if (this.state.view === 'month') this._renderMonths(body, title);
    else this._renderYears(body, title);
  }

  _renderDays(container, titleEl) {
    container.className = 'dp-body dp-grid';
    const year = this.state.viewDate.getFullYear();
    const month = this.state.viewDate.getMonth();
    titleEl.textContent = this.state.viewDate.toLocaleString(this.options.locale, { month: 'long', year: 'numeric' });

    const frag = document.createDocumentFragment();

    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
      const el = document.createElement('div');
      el.className = 'dp-cell dp-label';
      el.textContent = d;
      frag.appendChild(el);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'dp-cell dp-other-month';
        frag.appendChild(el);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const ts = date.getTime();
      const el = document.createElement('div');
      el.className = 'dp-cell';
      el.dataset.ts = ts;
      el.textContent = i;

      if ((this.options.minDate && ts < this.options.minDate.getTime()) ||
          (this.options.maxDate && ts > this.options.maxDate.getTime())) {
        el.classList.add('dp-disabled');
      } else {
        if (this.options.mode === 'single' && this.state.selectedDate && ts === this.state.selectedDate.getTime()) {
            el.classList.add('dp-selected');
            el.style.background = this.options.primaryColor;
        }
        if (this.options.mode === 'range' && this.state.rangeStart) {
            const startTs = this.state.rangeStart.getTime();
            if (ts === startTs) {
                el.classList.add('dp-range-start');
                el.style.background = this.options.primaryColor;
            }
            if (this.state.rangeEnd) {
                const endTs = this.state.rangeEnd.getTime();
                if (ts === endTs) {
                    el.classList.add('dp-range-end');
                    el.style.background = this.options.primaryColor;
                }
                if (ts > startTs && ts < endTs) {
                    el.classList.add('dp-in-range');
                    el.style.background = `${this.options.primaryColor}20`;
                }
            }
        }
      }
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  _renderMonths(container, titleEl) {
    container.className = 'dp-body dp-grid-wide';
    titleEl.textContent = this.state.viewDate.getFullYear();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 12; i++) {
      const date = new Date(this.state.viewDate.getFullYear(), i, 1);
      const el = document.createElement('div');
      el.className = 'dp-cell';
      if (i === currentMonth && currentYear === this.state.viewDate.getFullYear()) el.classList.add('dp-today');
      el.dataset.ts = date.getTime();
      el.textContent = date.toLocaleString(this.options.locale, { month: 'short' });
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  _renderYears(container, titleEl) {
    container.className = 'dp-body dp-grid-wide';
    const startYear = Math.floor(this.state.viewDate.getFullYear() / 10) * 10;
    titleEl.textContent = `${startYear} - ${startYear + 9}`;
    const currentYear = new Date().getFullYear();
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 12; i++) {
      const year = startYear - 1 + i;
      const date = new Date(year, 0, 1);
      const el = document.createElement('div');
      el.className = 'dp-cell';
      if (year === currentYear) el.classList.add('dp-today');
      if (i === 0 || i === 11) el.classList.add('dp-other-month');
      el.dataset.ts = date.getTime();
      el.textContent = year;
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  /* ================= Logic & Helpers ================= */

  _updateInput(value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputValueSetter.call(this.input, value);
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _handleSelection(target) {
    const timestamp = parseInt(target.dataset.ts);
    if (isNaN(timestamp)) return;
    const rawDate = new Date(timestamp);

    if (this.state.view !== 'day') {
      if (this.state.view === 'year') {
        this.state.viewDate.setFullYear(rawDate.getFullYear());
        this.state.view = 'month';
      } else {
        this.state.viewDate.setMonth(rawDate.getMonth());
        this.state.view = 'day';
      }
      this._render();
      return;
    }

    if (this.options.mode === 'single') {
      this.state.selectedDate = rawDate;
      this._updateInput(this.options.format(rawDate));
      if (this.options.onChange) this.options.onChange(rawDate);
      this.close();
    } else {
      if (!this.state.rangeStart || (this.state.rangeStart && this.state.rangeEnd)) {
        this.state.rangeStart = rawDate;
        this.state.rangeEnd = null;
        this._updateInput(`${this.options.format(rawDate)} - ...`);
      } else if (rawDate < this.state.rangeStart) {
        this.state.rangeStart = rawDate;
        this._updateInput(`${this.options.format(rawDate)} - ...`);
      } else {
        this.state.rangeEnd = rawDate;
        this._updateInput(`${this.options.format(this.state.rangeStart)} - ${this.options.format(this.state.rangeEnd)}`);
        if (this.options.onChange) this.options.onChange({ start: this.state.rangeStart, end: this.state.rangeEnd });
        this.close();
      }
    }
    this._render();
  }

  _handleNavigation(action) {
    const { view, viewDate } = this.state;
    if (action === 'switch-view') {
      this.state.view = view === 'day' ? 'month' : 'year';
    } else {
      const dir = action === 'next' ? 1 : -1;
      if (view === 'day') viewDate.setMonth(viewDate.getMonth() + dir);
      if (view === 'month') viewDate.setFullYear(viewDate.getFullYear() + dir);
      if (view === 'year') viewDate.setFullYear(viewDate.getFullYear() + (dir * 10));
    }
    this._render();
  }

  _position() {
    if (!this.state.isVisible) return;
    const rect = this.input.getBoundingClientRect();
    this.root.style.top = `${rect.bottom + window.scrollY + 4}px`;
    this.root.style.left = `${rect.left + window.scrollX}px`;
  }

  open() {
    this.state.isVisible = true;
    this.root.classList.add('dp-visible');
    this._position();
    this._render();
  }

  close() {
    this.state.isVisible = false;
    this.root.classList.remove('dp-visible');
  }

  _normalizeDate(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  _handleInputClick(e) {
    e.preventDefault(); 
    this.open();
  }

  _handleDocumentClick(e) {
    if (this.state.isVisible && !this.root.contains(e.target) && e.target !== this.input) {
      this.close();
    }
  }

  _handleResize() {
    if (this.state.isVisible) this._position();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EssealDatePicker;
} else {
  window.EssealDatePicker = EssealDatePicker;
}

