/**
 * NxMultiSelect — Componente de filtro multi-seleção para Nexus Hub
 * 
 * Uso:
 *   const ms = new NxMultiSelect('estFilial', {
 *     label: 'Filial',
 *     options: ['GRU', 'NAT', 'CPQ'],
 *     onChange: (selectedValues) => renderEst()
 *   });
 *   ms.mount(containerElement);
 *
 *   // Popular dinamicamente após dados carregados:
 *   ms.populate(['GRU', 'NAT', 'CPQ']);
 *
 *   // Ler valores selecionados:
 *   ms.getValues() → [] (vazio = Todos)
 *
 * API global:
 *   window.NxMS           — Map de instâncias por id
 *   getMultiSel(id)       — retorna array de valores selecionados ([] = Todos)
 *   populateMultiSel(id, values) — atualiza opções
 */

'use strict';

class NxMultiSelect {
    /**
     * @param {string} id           Identificador único
     * @param {object} opts
     * @param {string} opts.label   Label exibido no botão trigger
     * @param {string[]} [opts.options]   Opções iniciais (sem "Todos")
     * @param {string[]} [opts.defaults]  Valores pré-selecionados
     * @param {boolean} [opts.allByDefault=true] Se true, inicia com Todos selecionados
     * @param {Function} opts.onChange    Callback(selectedValues[])
     */
    constructor(id, opts = {}) {
        this.id = id;
        this.label = opts.label || id;
        this.options = opts.options || [];
        this.defaults = opts.defaults || [];
        this.allByDefault = opts.allByDefault !== false;
        this.onChange = opts.onChange || (() => { });
        this._selected = new Set(this.defaults);
        this._open = false;
        this._el = null;
        this._dropdown = null;
        this._trigger = null;
        this._badge = null;
        this._bindOutside = this._handleOutside.bind(this);
    }

    // ── Public API ──────────────────────────────────────────────

    /** Returns array of selected values. Empty array means "Todos" */
    getValues() {
        if (this._selected.size === 0 || this._selected.size === this.options.length) return [];
        return [...this._selected];
    }

    /** Replace options and reset selection */
    populate(optionsList, keepSelection = false) {
        const prevSelected = keepSelection ? new Set(this._selected) : null;
        this.options = [...optionsList];
        if (!keepSelection || !prevSelected) {
            this._selected = new Set();
        } else {
            // Keep only values still in new options
            this._selected = new Set([...prevSelected].filter(v => this.options.includes(v)));
        }
        this._rebuildDropdown();
        this._updateTrigger();
    }

    /** Programmatically set selected values */
    setValues(values) {
        this._selected = new Set(values);
        this._rebuildDropdown();
        this._updateTrigger();
    }

    /** Mount component inside containerEl, replacing it or appending */
    mount(containerEl) {
        this._el = this._build();
        if (containerEl) {
            containerEl.innerHTML = '';
            containerEl.appendChild(this._el);
        }
        return this._el;
    }

    /** Mount component after a reference element (insertAdjacentElement) */
    mountAfter(refEl) {
        this._el = this._build();
        refEl.insertAdjacentElement('afterend', this._el);
        return this._el;
    }

    /** Mount component replacing a reference element */
    replace(refEl) {
        this._el = this._build();
        refEl.replaceWith(this._el);
        return this._el;
    }

    /** Destroy and clean up */
    destroy() {
        document.removeEventListener('mousedown', this._bindOutside);
        document.removeEventListener('keydown', this._keyHandler);
        this._el?.remove();
    }

    // ── Build ───────────────────────────────────────────────────

    _build() {
        const wrap = document.createElement('div');
        wrap.className = 'nx-msel';
        wrap.id = 'nx-msel-' + this.id;

        // Trigger button
        this._trigger = document.createElement('button');
        this._trigger.type = 'button';
        this._trigger.className = 'nx-msel-trigger';
        this._trigger.setAttribute('aria-haspopup', 'listbox');
        this._trigger.setAttribute('aria-expanded', 'false');

        const trigLabel = document.createElement('span');
        trigLabel.className = 'nx-msel-label';
        trigLabel.textContent = this.label + ':';

        this._badge = document.createElement('span');
        this._badge.className = 'nx-msel-val';

        const arrow = document.createElement('span');
        arrow.className = 'nx-msel-arrow';
        arrow.textContent = '▾';

        this._trigger.appendChild(trigLabel);
        this._trigger.appendChild(this._badge);
        this._trigger.appendChild(arrow);
        this._trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggle();
        });

        // Dropdown panel
        this._dropdown = document.createElement('div');
        this._dropdown.className = 'nx-msel-dropdown';
        this._dropdown.setAttribute('role', 'listbox');
        this._dropdown.setAttribute('aria-multiselectable', 'true');

        this._rebuildDropdown();

        wrap.appendChild(this._trigger);
        wrap.appendChild(this._dropdown);

        this._updateTrigger();
        return wrap;
    }

    _rebuildDropdown() {
        if (!this._dropdown) return;
        this._dropdown.innerHTML = '';

        // -- Add Search Input --
        if (this.options.length > 0) {
            const searchWrap = document.createElement('div');
            searchWrap.className = 'nx-msel-search';

            const searchIcon = document.createElement('span');
            searchIcon.className = 'nx-msel-search-icon';
            searchIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`;

            this._searchInput = document.createElement('input');
            this._searchInput.type = 'text';
            this._searchInput.className = 'nx-msel-search-input';
            this._searchInput.placeholder = 'Buscar ou marcar...';
            this._searchInput.autocomplete = 'off';

            this._searchInput.addEventListener('input', (e) => {
                const term = e.target.value.trim().toLowerCase();
                const items = this._dropdown.querySelectorAll('.nx-msel-item');
                items.forEach(item => {
                    if (item.dataset.isAll === 'true') return; // Do not hide 'Todos'
                    const label = item.textContent.toLowerCase();
                    const val = item.querySelector('input').value.toLowerCase();
                    if (term === '' || label.includes(term) || val.includes(term)) {
                        item.classList.remove('hidden');
                    } else {
                        item.classList.add('hidden');
                    }
                });
            });

            this._searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const term = this._searchInput.value.trim().toLowerCase();
                    if (!term) return;

                    const items = this._dropdown.querySelectorAll('.nx-msel-item:not(.hidden)');
                    let foundItem = null;

                    // Exact match first
                    for (const item of items) {
                        if (item.dataset.isAll === 'true') continue;
                        const label = item.textContent.trim().toLowerCase();
                        const val = item.querySelector('input').value.toLowerCase();
                        if (label === term || val === term) {
                            foundItem = item; break;
                        }
                    }

                    // First visible if no exact match
                    if (!foundItem && items.length > 0) {
                        const first = items[0];
                        if (first.dataset.isAll !== 'true') foundItem = first;
                        else if (items.length > 1) foundItem = items[1];
                    }

                    if (foundItem) {
                        const input = foundItem.querySelector('input');
                        input.checked = true;
                        this._handleOption(input.value, foundItem);

                        foundItem.classList.add('highlight');
                        setTimeout(() => foundItem.classList.remove('highlight'), 600);

                        this._searchInput.value = '';
                        this._searchInput.dispatchEvent(new Event('input')); // reset filter

                        foundItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        setTimeout(() => this._searchInput.focus(), 10);
                    }
                }
            });

            searchWrap.appendChild(searchIcon);
            searchWrap.appendChild(this._searchInput);
            this._dropdown.appendChild(searchWrap);
        }

        // "Todos" option
        const todosItem = this._makeItem('__all__', 'Todos',
            this._selected.size === 0 || this._selected.size === this.options.length
        );
        todosItem.dataset.isAll = 'true';
        todosItem.addEventListener('change', () => this._handleTodos(todosItem));
        this._dropdown.appendChild(todosItem);

        // Separator
        if (this.options.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'nx-msel-sep';
            this._dropdown.appendChild(sep);
        }

        // Individual options
        this.options.forEach(opt => {
            const item = this._makeItem(opt, opt, this._selected.has(opt));
            item.addEventListener('change', () => this._handleOption(opt, item));
            this._dropdown.appendChild(item);
        });
    }

    _makeItem(value, label, checked) {
        const wrap = document.createElement('label');
        wrap.className = 'nx-msel-item' + (checked ? ' nx-msel-item--checked' : '');
        wrap.setAttribute('role', 'option');
        wrap.setAttribute('aria-selected', checked);

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = value;
        input.checked = checked;

        const box = document.createElement('span');
        box.className = 'nx-msel-box';

        const lbl = document.createElement('span');
        lbl.className = 'nx-msel-item-label';
        lbl.textContent = label;

        wrap.appendChild(input);
        wrap.appendChild(box);
        wrap.appendChild(lbl);
        return wrap;
    }

    // ── Interaction ─────────────────────────────────────────────

    _handleTodos(todosItem) {
        const checked = todosItem.querySelector('input').checked;
        if (checked) {
            // Select all
            this._selected = new Set(this.options);
        } else {
            this._selected = new Set();
        }
        this._rebuildDropdown();
        this._updateTrigger();
        this._emit();
    }

    _handleOption(value, itemEl) {
        const checked = itemEl.querySelector('input').checked;
        if (checked) {
            this._selected.add(value);
        } else {
            this._selected.delete(value);
        }
        // Sync checked state visual
        itemEl.classList.toggle('nx-msel-item--checked', checked);
        itemEl.setAttribute('aria-selected', checked);
        // Sync Todos checkbox
        this._syncTodos();
        this._updateTrigger();
        this._emit();
    }

    _syncTodos() {
        const todosItem = this._dropdown?.querySelector('.nx-msel-item');
        if (!todosItem) return;
        const input = todosItem.querySelector('input');
        const allSelected = this._selected.size === this.options.length;
        const noneSelected = this._selected.size === 0;
        input.checked = allSelected || noneSelected;
        input.indeterminate = !allSelected && !noneSelected;
        todosItem.classList.toggle('nx-msel-item--checked', allSelected || noneSelected);
    }

    _toggle() {
        if (this._open) {
            this._close();
        } else {
            this._openDropdown();
        }
    }

    _openDropdown() {
        // Close any other open dropdowns
        document.querySelectorAll('.nx-msel.nx-msel--open').forEach(el => {
            if (el !== this._el) {
                const inst = NxMS.get(el.id.replace('nx-msel-', ''));
                inst?._close();
            }
        });
        this._open = true;
        this._el.classList.add('nx-msel--open');
        this._trigger.setAttribute('aria-expanded', 'true');
        // Position dropdown above toolbar if near bottom
        const rect = this._el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        this._dropdown.classList.toggle('nx-msel-dropdown--up', spaceBelow < 280);
        document.addEventListener('mousedown', this._bindOutside);

        // Focus search input
        if (this._searchInput) {
            setTimeout(() => this._searchInput.focus(), 50);
        }
    }

    _close() {
        this._open = false;
        this._el?.classList.remove('nx-msel--open');
        this._trigger?.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', this._bindOutside);
    }

    _handleOutside(e) {
        if (!this._el?.contains(e.target)) {
            this._close();
        }
    }

    // ── State helpers ────────────────────────────────────────────

    _updateTrigger() {
        if (!this._badge) return;
        const count = this._selected.size;
        const total = this.options.length;

        if (count === 0 || count === total) {
            this._badge.textContent = 'Todos';
            this._badge.removeAttribute('data-count');
        } else if (count === 1) {
            this._badge.textContent = [...this._selected][0];
            this._badge.removeAttribute('data-count');
        } else {
            // Show first selected + count badge
            const first = [...this._selected][0];
            this._badge.textContent = first;
            this._badge.setAttribute('data-count', '+' + (count - 1));
        }
        this._trigger.classList.toggle('nx-msel-trigger--active', count > 0 && count < total);
    }

    _emit() {
        const vals = this.getValues();
        try { this.onChange(vals); } catch (e) { console.warn('[NxMS] onChange error:', e); }
    }
}

// ── Global registry & helpers ─────────────────────────────────

/** Registry: id → NxMultiSelect instance */
const NxMS = new Map();
window.NxMS = NxMS;

/**
 * Register a new NxMultiSelect and mount it replacing a <select> or container
 * @param {string} id
 * @param {object} opts  See NxMultiSelect constructor
 * @param {string|Element} mountTarget  CSS selector or element to replace
 * @returns {NxMultiSelect}
 */
function nxMselCreate(id, opts, mountTarget) {
    const inst = new NxMultiSelect(id, opts);
    NxMS.set(id, inst);

    if (typeof mountTarget === 'string') {
        const el = document.querySelector(mountTarget);
        if (el) inst.replace(el);
        else console.warn('[NxMS] mountTarget not found:', mountTarget);
    } else if (mountTarget instanceof Element) {
        inst.replace(mountTarget);
    }

    return inst;
}
window.nxMselCreate = nxMselCreate;

/**
 * Get selected values for a registered NxMultiSelect
 * @returns {string[]}  Empty array means "Todos" (no filter)
 */
function getMultiSel(id) {
    return NxMS.get(id)?.getValues() ?? [];
}
window.getMultiSel = getMultiSel;

/**
 * Populate a registered NxMultiSelect with dynamic values from DB
 * @param {string} id
 * @param {string[]} values
 */
function populateMultiSel(id, values) {
    NxMS.get(id)?.populate(values, true);
}
window.populateMultiSel = populateMultiSel;

/**
 * Helper to match a record field against a multi-select filter
 * @param {string} val   Record field value
 * @param {string[]} sel Selected values array (empty = all)
 * @returns {boolean}
 */
function matchMultiSel(val, sel) {
    return sel.length === 0 || sel.includes(val);
}
window.matchMultiSel = matchMultiSel;
