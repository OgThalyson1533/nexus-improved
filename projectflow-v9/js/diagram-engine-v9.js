// ============================================================
//  ProjectFlow V9 — diagram-engine-v9.js
//  Editor de Diagramas profissional usando Fabric.js
//  Substitui completamente o diagram-engine.js baseado em SVG manual
// ============================================================
'use strict';

window.DiagramEngineV9 = (function () {

  // ── Estado interno ─────────────────────────────────────────
  let _canvas    = null;   // instância Fabric.Canvas
  let _pid       = null;   // project_id atual
  let _taskId    = null;   // task_id vinculado (rastreabilidade)
  let _ready     = false;
  let _history   = [];
  let _histIdx   = -1;
  const MAX_HIST = 60;

  // Paleta de nós
  const PALETTE = {
    process:  { label: 'Processo',   fill: '#DBEAFE', stroke: '#2563EB', text: '#1e3a8a', shape: 'rect' },
    decision: { label: 'Decisão',    fill: '#FEF3C7', stroke: '#D97706', text: '#78350f', shape: 'diamond' },
    database: { label: 'Banco',      fill: '#D1FAE5', stroke: '#059669', text: '#064e3b', shape: 'cylinder' },
    io:       { label: 'E/S Dados',  fill: '#EDE9FE', stroke: '#7C3AED', text: '#3b0764', shape: 'parallelogram' },
    actor:    { label: 'Ator',       fill: '#FCE7F3', stroke: '#DB2777', text: '#831843', shape: 'ellipse' },
    start:    { label: 'Início',     fill: '#D1FAE5', stroke: '#059669', text: '#064e3b', shape: 'circle' },
    end:      { label: 'Fim',        fill: '#FEE2E2', stroke: '#DC2626', text: '#7f1d1d', shape: 'circle' },
    note:     { label: 'Nota',       fill: '#FFFBEB', stroke: '#D97706', text: '#78350f', shape: 'rect' },
    cloud:    { label: 'Serviço',    fill: '#F0F9FF', stroke: '#0EA5E9', text: '#0c4a6e', shape: 'rect' },
    custom:   { label: 'Custom',     fill: '#F8FAFC', stroke: '#64748B', text: '#1e293b', shape: 'rect' },
  };

  // ── Carregar Fabric.js ─────────────────────────────────────
  async function _loadFabric() {
    if (typeof fabric !== 'undefined') return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Fabric.js não carregou'));
      document.head.appendChild(s);
    });
  }

  // ── Inicialização ──────────────────────────────────────────
  async function init(containerId, projectId, taskId) {
    _pid    = projectId;
    _taskId = taskId || null;

    if (!_pid) {
      showToast('Selecione um Projeto antes de abrir o Editor de Diagramas', true);
      return;
    }

    const outer = document.getElementById(containerId);
    if (!outer) return;

    document.getElementById('dg-empty-state')?.remove();

    // FIX tela preta: destrói canvas anterior antes de recriar
    if (_canvas) {
      try { _canvas.dispose(); } catch(e) {}
      _canvas = null;
    }
    _ready = false;
    _history = [];
    _histIdx = -1;

    // Monta layout do editor
    let root = document.getElementById('dgv9-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'dgv9-root';
    root.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;height:100%;position:relative;';
    outer.appendChild(root);

    _injectCSS();
    root.innerHTML = _buildHTML();

    await _loadFabric();
    _initCanvas(root);
    _bindKeyboard();
    _bindToolbar();
    _bindDragPalette(root);
    _hist0();
    _ready = true;

    // Carrega dados salvos
    await _loadFromStorage();
    _updateBadge();
    showToast('Editor de Diagramas V9 carregado — Fabric.js ativo');
  }

  // ── HTML do editor ────────────────────────────────────────
  function _buildHTML() {
    const palItems = Object.entries(PALETTE).map(([key, cfg]) => `
      <div class="dgv9-pal-item" draggable="true" data-type="${key}" title="${cfg.label}">
        <div class="dgv9-pal-preview" style="background:${cfg.fill};border-color:${cfg.stroke}">
          ${_shapePreviewSVG(cfg.shape, cfg.fill, cfg.stroke)}
        </div>
        <span>${cfg.label}</span>
      </div>`).join('');

    return `
    <!-- Toolbar principal -->
    <div class="dgv9-toolbar" id="dgv9-toolbar">
      <div class="dgv9-tb-group">
        <button class="dgv9-btn dgv9-btn--active" id="dgv9-tool-select" title="Selecionar (V)" onclick="DiagramEngineV9.setTool('select')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 1l10 5-5 2-2 5z"/></svg> Selecionar
        </button>
        <button class="dgv9-btn" id="dgv9-tool-text" title="Texto (T)" onclick="DiagramEngineV9.addText()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2 2h10v2H9v8H5V4H2V2z"/></svg> Texto
        </button>
        <button class="dgv9-btn" id="dgv9-tool-line" title="Linha (L)" onclick="DiagramEngineV9.startLineTool()">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="2" fill="none"><line x1="2" y1="12" x2="12" y2="2"/></svg> Linha
        </button>
        <button class="dgv9-btn" id="dgv9-tool-arrow" title="Seta (A)" onclick="DiagramEngineV9.startArrowTool()">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="2" fill="none"><line x1="2" y1="12" x2="12" y2="2"/><path d="M8 2l4 0 0 4"/></svg> Seta
        </button>
      </div>
      <div class="dgv9-tb-sep"></div>
      <div class="dgv9-tb-group">
        <button class="dgv9-btn" title="Desfazer Ctrl+Z" onclick="DiagramEngineV9.undo()">↩ Desfazer</button>
        <button class="dgv9-btn" title="Refazer Ctrl+Y" onclick="DiagramEngineV9.redo()">↪ Refazer</button>
      </div>
      <div class="dgv9-tb-sep"></div>
      <div class="dgv9-tb-group">
        <button class="dgv9-btn" title="Apagar seleção Del" onclick="DiagramEngineV9.deleteSelected()">🗑 Apagar</button>
        <button class="dgv9-btn" title="Selecionar tudo Ctrl+A" onclick="DiagramEngineV9.selectAll()">⊞ Tudo</button>
        <button class="dgv9-btn" title="Encaixar tela" onclick="DiagramEngineV9.fitView()">⊡ Fit</button>
        <button class="dgv9-btn" onclick="DiagramEngineV9.zoomOut()">−</button>
        <span class="dgv9-zoom" id="dgv9-zoom-lbl">100%</span>
        <button class="dgv9-btn" onclick="DiagramEngineV9.zoomIn()">+</button>
      </div>
      <div class="dgv9-tb-sep"></div>
      <div class="dgv9-tb-group">
        <button class="dgv9-btn" onclick="DiagramEngineV9.autoLayout()">⚡ Auto Layout</button>
        <button class="dgv9-btn" onclick="DiagramEngineV9.clearAll()">🧹 Limpar</button>
      </div>
      <div class="dgv9-tb-sep"></div>
      <div class="dgv9-tb-group">
        <button class="dgv9-btn dgv9-btn--save" onclick="DiagramEngineV9.save()">💾 Salvar</button>
        <button class="dgv9-btn" onclick="DiagramEngineV9.exportPNG()">↓ PNG</button>
        <button class="dgv9-btn" onclick="DiagramEngineV9.exportSVG()">↓ SVG</button>
      </div>
    </div>

    <!-- Vínculo Projeto/Tarefa (Regra Global) -->
    <div id="dgv9-traceability" style="padding:6px 14px;background:var(--ac-bg);border-bottom:1px solid var(--ac)30;font-size:12px;color:var(--ac);display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 1h10v10H1z"/><path d="M4 4h4M4 7h2"/></svg>
      <span id="dgv9-trace-text">Vinculado ao projeto: <strong id="dgv9-proj-name">—</strong></span>
      <select id="dgv9-task-sel" class="field-input" style="font-size:11px;padding:2px 8px;height:24px;min-width:180px" onchange="DiagramEngineV9.setLinkedTask(this.value)">
        <option value="">— Vincular a uma tarefa (opcional) —</option>
      </select>
    </div>

    <!-- Corpo: paleta | canvas | propriedades -->
    <div style="flex:1;display:flex;overflow:hidden;">

      <!-- Paleta lateral -->
      <div class="dgv9-palette" id="dgv9-palette">${palItems}</div>

      <!-- Canvas Fabric.js -->
      <div class="dgv9-canvas-wrap" id="dgv9-canvas-wrap">
        <canvas id="dgv9-canvas"></canvas>
      </div>

      <!-- Painel de propriedades -->
      <div class="dgv9-props" id="dgv9-props">
        <div class="dgv9-props-title">Propriedades</div>
        <div id="dgv9-props-body"><p class="dgv9-hint">Clique num elemento para editar</p></div>
      </div>
    </div>

    <!-- Statusbar -->
    <div class="dgv9-status">
      <span id="dgv9-status-objects">0 objetos</span>
      <span>·</span>
      <span id="dgv9-status-sel">Nada selecionado</span>
      <div style="flex:1"></div>
      <span class="dgv9-hint">V=Selecionar · T=Texto · Del=Apagar · Ctrl+Z/Y · Scroll=Zoom</span>
    </div>`;
  }

  function _shapePreviewSVG(shape, fill, stroke) {
    const s = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`;
    if (shape === 'diamond')      return `<svg viewBox="0 0 40 24"><polygon points="20,2 38,12 20,22 2,12" ${s}/></svg>`;
    if (shape === 'ellipse')      return `<svg viewBox="0 0 40 24"><ellipse cx="20" cy="12" rx="17" ry="9" ${s}/></svg>`;
    if (shape === 'circle')       return `<svg viewBox="0 0 40 24"><circle cx="20" cy="12" r="10" ${s}/></svg>`;
    if (shape === 'cylinder')     return `<svg viewBox="0 0 40 24"><ellipse cx="20" cy="6" rx="16" ry="5" ${s}/><rect x="4" y="6" width="32" height="14" fill="${fill}" stroke="none"/><line x1="4" y1="6" x2="4" y2="20" stroke="${stroke}" stroke-width="1.5"/><line x1="36" y1="6" x2="36" y2="20" stroke="${stroke}" stroke-width="1.5"/><ellipse cx="20" cy="20" rx="16" ry="5" ${s}/></svg>`;
    if (shape === 'parallelogram') return `<svg viewBox="0 0 40 24"><polygon points="6,22 14,2 34,2 26,22" ${s}/></svg>`;
    return `<svg viewBox="0 0 40 24"><rect x="2" y="4" width="36" height="16" rx="3" ${s}/></svg>`;
  }

  // ── Canvas Fabric ─────────────────────────────────────────
  function _initCanvas(root) {
    const wrap = root.querySelector('#dgv9-canvas-wrap');
    const canvasEl = root.querySelector('#dgv9-canvas');
    const w = wrap.clientWidth || 900;
    const h = wrap.clientHeight || 600;

    _canvas = new fabric.Canvas('dgv9-canvas', {
      width: w, height: h,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim() || '#fafaf8',
      selection: true,
      preserveObjectStacking: true,
    });

    // Grid de fundo
    _drawGrid();

    // Redimensionamento
    const ro = new ResizeObserver(() => {
      if (!_canvas) return;
      _canvas.setWidth(wrap.clientWidth);
      _canvas.setHeight(wrap.clientHeight);
      _drawGrid();
      _canvas.renderAll();
    });
    ro.observe(wrap);

    // Eventos
    _canvas.on('object:modified', () => { _hist0(); _updateStatus(); });
    _canvas.on('object:added',    () => { _updateStatus(); });
    _canvas.on('object:removed',  () => { _updateStatus(); });
    _canvas.on('selection:created', _onSelectionChange);
    _canvas.on('selection:updated', _onSelectionChange);
    _canvas.on('selection:cleared', () => { _renderProps(null); _updateStatus(); });
    _canvas.on('mouse:wheel', _onWheel);

    // Populate task selector
    _populateTaskSel();
    const projName = (window.mockProjects||[]).find(p=>p.id===_pid)?.name || _pid;
    const el = document.getElementById('dgv9-proj-name');
    if (el) el.textContent = projName;
  }

  function _drawGrid() {
    if (!_canvas) return;
    const GRID = 20;
    const w = _canvas.width;
    const h = _canvas.height;
    const lines = [];
    for (let x = 0; x <= w; x += GRID)
      lines.push(new fabric.Line([x,0,x,h], {stroke:'rgba(0,0,0,.05)',selectable:false,evented:false,excludeFromExport:true}));
    for (let y = 0; y <= h; y += GRID)
      lines.push(new fabric.Line([0,y,w,y], {stroke:'rgba(0,0,0,.05)',selectable:false,evented:false,excludeFromExport:true}));
    const grid = new fabric.Group(lines, {selectable:false,evented:false,excludeFromExport:true,id:'__grid__'});
    // Remove old grid
    const old = _canvas.getObjects().find(o=>o.id==='__grid__');
    if (old) _canvas.remove(old);
    _canvas.add(grid);
    _canvas.sendToBack(grid);
  }

  function _onWheel(opt) {
    opt.e.preventDefault();
    const delta = opt.e.deltaY;
    let zoom = _canvas.getZoom();
    zoom *= (delta > 0 ? 0.9 : 1.1);
    zoom = Math.max(0.2, Math.min(5, zoom));
    _canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    _updateZoomLabel();
  }

  function _updateZoomLabel() {
    const lbl = document.getElementById('dgv9-zoom-lbl');
    if (lbl && _canvas) lbl.textContent = Math.round(_canvas.getZoom() * 100) + '%';
  }

  function _onSelectionChange(e) {
    const obj = e.selected?.[0] || _canvas.getActiveObject();
    _renderProps(obj);
    _updateStatus();
  }

  // ── Adicionar nós ─────────────────────────────────────────
  function addNode(type, x, y) {
    if (!_canvas) return;
    const cfg   = PALETTE[type] || PALETTE.custom;
    const cx    = x ?? _canvas.width  / 2 - 80;
    const cy    = y ?? _canvas.height / 2 - 30;
    const snap  = v => Math.round(v / 20) * 20;

    let group;

    if (cfg.shape === 'diamond') {
      const w = 140, h = 80;
      const poly = new fabric.Polygon([
        {x: w/2, y: 0}, {x: w, y: h/2}, {x: w/2, y: h}, {x: 0, y: h/2}
      ], { fill: cfg.fill, stroke: cfg.stroke, strokeWidth: 1.5, objectCaching: false });
      const txt = new fabric.Text(cfg.label, {
        left: w/2, top: h/2, originX:'center', originY:'center',
        fontSize: 12, fill: cfg.text, fontFamily: 'system-ui', fontWeight:'600',
      });
      group = new fabric.Group([poly, txt], { left: snap(cx), top: snap(cy), subTargetCheck: false });

    } else if (cfg.shape === 'ellipse' || cfg.shape === 'circle') {
      const rx = cfg.shape === 'circle' ? 32 : 65, ry = 32;
      const ell = new fabric.Ellipse({ rx, ry, fill: cfg.fill, stroke: cfg.stroke, strokeWidth: 1.5 });
      const txt = new fabric.Text(cfg.label, {
        left: rx, top: ry, originX:'center', originY:'center',
        fontSize: 11, fill: cfg.text, fontFamily:'system-ui', fontWeight:'600',
      });
      group = new fabric.Group([ell, txt], { left: snap(cx), top: snap(cy) });

    } else if (cfg.shape === 'parallelogram') {
      const pts = [{x:12,y:0},{x:160,y:0},{x:148,y:60},{x:0,y:60}];
      const para = new fabric.Polygon(pts, { fill: cfg.fill, stroke: cfg.stroke, strokeWidth: 1.5, objectCaching: false });
      const txt = new fabric.Text(cfg.label, {
        left: 80, top: 30, originX:'center', originY:'center',
        fontSize: 12, fill: cfg.text, fontFamily:'system-ui', fontWeight:'600',
      });
      group = new fabric.Group([para, txt], { left: snap(cx), top: snap(cy) });

    } else {
      // Rect padrão
      const W = 160, H = 60;
      const rect = new fabric.Rect({ width:W, height:H, fill:cfg.fill, stroke:cfg.stroke, strokeWidth:1.5, rx:6, ry:6 });
      const txt  = new fabric.Text(cfg.label, {
        left: W/2, top: H/2, originX:'center', originY:'center',
        fontSize: 12, fill: cfg.text, fontFamily:'system-ui', fontWeight:'600',
        width: W-12, splitByGrapheme: false,
      });
      group = new fabric.Group([rect, txt], { left: snap(cx), top: snap(cy) });
    }

    group._pf_type  = type;
    group._pf_label = cfg.label;
    group._pf_node  = true;
    group.id = 'node_' + Date.now() + '_' + Math.random().toString(36).slice(2,4);

    // Duplo clique para renomear
    group.on('mousedblclick', () => _promptRename(group));

    _canvas.add(group);
    _canvas.setActiveObject(group);
    _canvas.renderAll();
    _hist0();
  }

  async function _promptRename(obj) {
    const cur = obj._pf_label || '';
    const lbl = await PFModal.prompt({ title: 'Editar label', label: 'Texto', value: cur });
    if (lbl === null) return;
    obj._pf_label = lbl;
    // Atualiza texto dentro do grupo
    const txtObj = obj.getObjects?.('text')?.[0];
    if (txtObj) { txtObj.set('text', lbl); _canvas.renderAll(); }
    _hist0();
  }

  // ── Texto livre ───────────────────────────────────────────
  function addText(x, y) {
    if (!_canvas) return;
    const txt = new fabric.IText('Texto aqui', {
      left: x ?? 200, top: y ?? 200,
      fontSize: 14, fill: 'var(--tx-1, #1a1a18)',
      fontFamily: 'system-ui', editable: true,
    });
    txt._pf_type = 'text';
    txt.id = 'txt_' + Date.now();
    _canvas.add(txt);
    _canvas.setActiveObject(txt);
    txt.enterEditing();
    _canvas.renderAll();
    _hist0();
  }

  // ── Linha e Seta ─────────────────────────────────────────
  let _lineMode = null;
  let _lineStart = null;
  let _lineTemp  = null;

  function startLineTool(withArrow) {
    _lineMode = withArrow ? 'arrow' : 'line';
    _canvas.defaultCursor = 'crosshair';
    _canvas.selection = false;
    _setToolActive(withArrow ? 'dgv9-tool-arrow' : 'dgv9-tool-line');

    const _md = (opt) => {
      const p = _canvas.getPointer(opt.e);
      _lineStart = { x: p.x, y: p.y };
      _lineTemp = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: '#64748B', strokeWidth: 2,
        selectable: false, evented: false,
      });
      _canvas.add(_lineTemp);
    };
    const _mm = (opt) => {
      if (!_lineStart || !_lineTemp) return;
      const p = _canvas.getPointer(opt.e);
      _lineTemp.set({ x2: p.x, y2: p.y });
      _canvas.renderAll();
    };
    const _mu = (opt) => {
      if (!_lineStart) return;
      const p = _canvas.getPointer(opt.e);
      _canvas.remove(_lineTemp);
      _lineTemp = null;

      const opts = {
        x1: _lineStart.x, y1: _lineStart.y,
        x2: p.x, y2: p.y,
        stroke: '#64748B', strokeWidth: 2,
        selectable: true,
      };
      let finalLine;
      if (_lineMode === 'arrow') {
        // Fabric não tem arrow nativo — usamos linha + triângulo
        finalLine = new fabric.Line([opts.x1, opts.y1, opts.x2, opts.y2], { ...opts });
        const angle = Math.atan2(opts.y2 - opts.y1, opts.x2 - opts.x1) * 180 / Math.PI;
        const head  = new fabric.Triangle({
          left: opts.x2, top: opts.y2,
          originX:'center', originY:'center',
          width:12, height:12, fill:'#64748B',
          angle: angle + 90, selectable: false, evented: false,
        });
        head._pf_arrowhead = true;
        const grp = new fabric.Group([finalLine, head], { selectable: true });
        grp._pf_type = 'arrow'; grp.id = 'edge_' + Date.now();
        _canvas.add(grp);
      } else {
        finalLine = new fabric.Line([opts.x1, opts.y1, opts.x2, opts.y2], opts);
        finalLine._pf_type = 'line'; finalLine.id = 'edge_' + Date.now();
        _canvas.add(finalLine);
      }
      _hist0();
      _stopLineTool();

      // Restore off after one use
      _canvas.off('mouse:down', _md);
      _canvas.off('mouse:move', _mm);
      _canvas.off('mouse:up',   _mu);
    };

    _canvas.on('mouse:down', _md);
    _canvas.on('mouse:move', _mm);
    _canvas.on('mouse:up',   _mu);
    _lineStart = null;
  }

  function startArrowTool() { startLineTool(true); }

  function _stopLineTool() {
    _lineMode = null; _lineStart = null; _lineTemp = null;
    _canvas.defaultCursor = 'default';
    _canvas.selection = true;
    setTool('select');
  }

  // ── Ferramentas ───────────────────────────────────────────
  function setTool(tool) {
    _lineMode = null;
    _canvas.defaultCursor = 'default';
    _canvas.selection = true;
    _setToolActive('dgv9-tool-' + tool);
  }

  function _setToolActive(id) {
    document.querySelectorAll('.dgv9-btn[id^="dgv9-tool-"]').forEach(b => b.classList.remove('dgv9-btn--active'));
    document.getElementById(id)?.classList.add('dgv9-btn--active');
  }

  // ── Zoom ──────────────────────────────────────────────────
  function zoomIn()  { _canvas?.setZoom(Math.min(5, _canvas.getZoom()*1.2)); _updateZoomLabel(); }
  function zoomOut() { _canvas?.setZoom(Math.max(0.2, _canvas.getZoom()/1.2)); _updateZoomLabel(); }
  function fitView() {
    if (!_canvas) return;
    const objs = _realObjects();
    if (!objs.length) { _canvas.setZoom(1); _canvas.viewportTransform=[1,0,0,1,0,0]; _canvas.renderAll(); return; }
    const bounds = objs.reduce((acc, o) => {
      const b = o.getBoundingRect(true);
      return { x1: Math.min(acc.x1,b.left), y1: Math.min(acc.y1,b.top), x2: Math.max(acc.x2,b.left+b.width), y2: Math.max(acc.y2,b.top+b.height) };
    }, { x1:Infinity, y1:Infinity, x2:-Infinity, y2:-Infinity });
    const pad = 40;
    const sw = _canvas.width  / (bounds.x2 - bounds.x1 + pad*2);
    const sh = _canvas.height / (bounds.y2 - bounds.y1 + pad*2);
    const z  = Math.max(0.2, Math.min(5, Math.min(sw, sh) * 0.9));
    _canvas.setZoom(z);
    _canvas.viewportTransform[4] = -bounds.x1*z + pad*z;
    _canvas.viewportTransform[5] = -bounds.y1*z + pad*z;
    _canvas.renderAll();
    _updateZoomLabel();
  }

  // ── Operações ─────────────────────────────────────────────
  function deleteSelected() {
    const active = _canvas?.getActiveObjects();
    if (!active?.length) return;
    active.forEach(o => { if (o.id !== '__grid__') _canvas.remove(o); });
    _canvas.discardActiveObject();
    _canvas.renderAll();
    _hist0();
  }

  function selectAll() {
    const objs = _realObjects();
    if (!objs.length) return;
    _canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas: _canvas }));
    _canvas.renderAll();
  }

  function clearAll() {
    if (!confirm('Limpar todos os elementos do diagrama?')) return;
    _realObjects().forEach(o => _canvas.remove(o));
    _canvas.renderAll();
    _hist0();
    showToast('Diagrama limpo');
  }

  function autoLayout() {
    const nodes = _realObjects().filter(o => o._pf_node);
    if (!nodes.length) return;
    const COLS = Math.ceil(Math.sqrt(nodes.length));
    const W = 180, H = 100, PAD = 30;
    nodes.forEach((n, i) => {
      n.set({ left: PAD + (i % COLS) * (W + PAD), top: PAD + Math.floor(i / COLS) * (H + PAD) });
      n.setCoords();
    });
    _canvas.renderAll();
    _hist0();
    fitView();
    showToast('Layout automático aplicado');
  }

  // ── Propriedades ──────────────────────────────────────────
  function _renderProps(obj) {
    const body = document.getElementById('dgv9-props-body');
    if (!body) return;
    if (!obj) { body.innerHTML = '<p class="dgv9-hint">Clique num elemento para editar</p>'; return; }

    const isNode = obj._pf_node;
    const isText = obj.type === 'i-text' || obj.type === 'text';

    if (isNode || isText) {
      const fill   = obj.fill || (obj._objects?.[0]?.fill) || '#fff';
      const stroke = obj.stroke || (obj._objects?.[0]?.stroke) || '#999';
      const txtObj = obj.getObjects?.('text')?.[0] || obj;
      const curTxt = obj._pf_label || txtObj?.text || '';

      body.innerHTML = `
        <div class="dgv9-prop-row">
          <label class="dgv9-prop-lbl">Label</label>
          <input class="dgv9-prop-input" id="dgv9-pi-label" value="${String(curTxt).replace(/"/g,'&quot;')}" oninput="DiagramEngineV9._propLabel(this.value)">
        </div>
        <div class="dgv9-prop-row">
          <label class="dgv9-prop-lbl">Cor de fundo</label>
          <input type="color" class="dgv9-prop-input" value="${_hexColor(fill)}" oninput="DiagramEngineV9._propFill(this.value)">
        </div>
        <div class="dgv9-prop-row">
          <label class="dgv9-prop-lbl">Cor da borda</label>
          <input type="color" class="dgv9-prop-input" value="${_hexColor(stroke)}" oninput="DiagramEngineV9._propStroke(this.value)">
        </div>
        <div class="dgv9-prop-row">
          <label class="dgv9-prop-lbl">Opacidade</label>
          <input type="range" min="10" max="100" value="${Math.round((obj.opacity??1)*100)}" oninput="DiagramEngineV9._propOpacity(this.value)">
        </div>
        <button class="dgv9-del-btn" onclick="DiagramEngineV9.deleteSelected()">🗑 Apagar elemento</button>`;
    } else {
      body.innerHTML = `
        <div class="dgv9-prop-row"><label class="dgv9-prop-lbl">Cor da linha</label><input type="color" class="dgv9-prop-input" value="${_hexColor(obj.stroke||'#64748B')}" oninput="DiagramEngineV9._propStroke(this.value)"></div>
        <div class="dgv9-prop-row"><label class="dgv9-prop-lbl">Espessura</label><input type="range" min="1" max="10" value="${obj.strokeWidth||2}" oninput="DiagramEngineV9._propLineW(this.value)"></div>
        <button class="dgv9-del-btn" onclick="DiagramEngineV9.deleteSelected()">🗑 Apagar</button>`;
    }
  }

  function _propLabel(val) {
    const obj = _canvas?.getActiveObject();
    if (!obj) return;
    obj._pf_label = val;
    const txtObj = obj.getObjects?.('text')?.[0];
    if (txtObj) { txtObj.set('text', val); _canvas.renderAll(); }
    else if (obj.type === 'i-text') { obj.set('text', val); _canvas.renderAll(); }
  }
  function _propFill(val) {
    const obj = _canvas?.getActiveObject();
    if (!obj) return;
    const r = obj.getObjects?.('rect')?.[0] || obj.getObjects?.('ellipse')?.[0] || obj.getObjects?.('polygon')?.[0];
    if (r) r.set('fill', val); else obj.set('fill', val);
    _canvas.renderAll();
  }
  function _propStroke(val) {
    const obj = _canvas?.getActiveObject();
    if (!obj) return;
    const r = obj.getObjects?.()[0] || obj;
    r.set('stroke', val);
    _canvas.renderAll();
  }
  function _propOpacity(val) {
    const obj = _canvas?.getActiveObject();
    if (obj) { obj.set('opacity', val/100); _canvas.renderAll(); }
  }
  function _propLineW(val) {
    const obj = _canvas?.getActiveObject();
    if (obj) { obj.set('strokeWidth', +val); _canvas.renderAll(); }
  }

  function _hexColor(c) {
    if (!c || typeof c !== 'string') return '#64748B';
    if (c.startsWith('#') && (c.length === 7 || c.length === 4)) return c;
    if (c.startsWith('rgb')) {
      const m = c.match(/\d+/g);
      if (m && m.length >= 3) return '#' + m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
    }
    return '#64748B';
  }

  // ── Status ────────────────────────────────────────────────
  function _updateStatus() {
    const objs = _realObjects();
    const sel  = _canvas?.getActiveObjects()?.length || 0;
    const soEl = document.getElementById('dgv9-status-objects');
    const ssEl = document.getElementById('dgv9-status-sel');
    if (soEl) soEl.textContent = objs.length + ' objeto' + (objs.length!==1?'s':'');
    if (ssEl) ssEl.textContent = sel ? sel + ' selecionado' + (sel!==1?'s':'') : 'Nada selecionado';
  }

  function _realObjects() {
    return (_canvas?.getObjects() || []).filter(o => o.id !== '__grid__' && !o.excludeFromExport);
  }

  // ── Histórico ─────────────────────────────────────────────
  function _hist0() {
    if (!_canvas) return;
    const snap = JSON.stringify(_canvas.toJSON(['id','_pf_type','_pf_label','_pf_node']));
    _history = _history.slice(0, _histIdx + 1);
    _history.push(snap);
    if (_history.length > MAX_HIST) { _history.shift(); }
    _histIdx = _history.length - 1;
  }

  function undo() {
    if (_histIdx <= 0) { showToast('Sem mais ações para desfazer'); return; }
    _histIdx--;
    _restoreSnap(_history[_histIdx]);
  }

  function redo() {
    if (_histIdx >= _history.length - 1) { showToast('Sem mais ações para refazer'); return; }
    _histIdx++;
    _restoreSnap(_history[_histIdx]);
  }

  function _restoreSnap(snap) {
    _canvas.loadFromJSON(snap, () => {
      _drawGrid();
      _canvas.renderAll();
      _updateStatus();
      // Re-bind dblclick
      _canvas.getObjects().forEach(o => {
        if (o._pf_node) o.on('mousedblclick', () => _promptRename(o));
      });
    });
  }

  // ── Persistência ──────────────────────────────────────────
  async function save() {
    if (!_pid) { showToast('Sem projeto ativo para salvar', true); return; }

    const data = {
      canvas: _canvas?.toJSON(['id','_pf_type','_pf_label','_pf_node']),
      zoom:   _canvas?.getZoom(),
      vt:     _canvas?.viewportTransform,
      pid:    _pid,
      taskId: _taskId,
      savedAt: new Date().toISOString(),
    };

    // LocalStorage (sempre)
    try { localStorage.setItem('pf_dg_v9_' + _pid, JSON.stringify(data)); } catch(e) {}

    // Supabase
    if (window.PF?.supabase && !window.PF?.demoMode) {
      const { data: ex } = await PF.supabase
        .from('project_diagrams').select('id').eq('project_id', _pid).eq('is_current', true).limit(1);
      const payload = { content_json: data, updated_at: new Date().toISOString() };
      if (ex?.length) {
        await PF.supabase.from('project_diagrams').update(payload).eq('id', ex[0].id);
      } else {
        await PF.supabase.from('project_diagrams').insert({
          project_id: _pid, name: 'Diagrama Principal', is_current: true,
          content_json: data, generated_from: 'manual', created_by: PF.user?.id || null,
        });
      }
    }

    showToast('Alteração salva com êxito', 'ok');
  }

  async function _loadFromStorage() {
    let data = null;

    // Tenta Supabase primeiro
    if (window.PF?.supabase && !window.PF?.demoMode && _pid) {
      const { data: rows } = await PF.supabase
        .from('project_diagrams').select('content_json').eq('project_id', _pid).eq('is_current', true).limit(1);
      if (rows?.[0]?.content_json) data = rows[0].content_json;
    }

    // Fallback localStorage
    if (!data) {
      try { data = JSON.parse(localStorage.getItem('pf_dg_v9_' + _pid) || 'null'); } catch(e) {}
    }

    if (!data?.canvas) return;

    _canvas.loadFromJSON(data.canvas, () => {
      if (data.zoom) _canvas.setZoom(data.zoom);
      if (data.vt) _canvas.viewportTransform = data.vt;
      _drawGrid();
      _canvas.renderAll();
      _updateStatus();
      _canvas.getObjects().forEach(o => {
        if (o._pf_node) o.on('mousedblclick', () => _promptRename(o));
      });
    });
  }

  // ── Export ────────────────────────────────────────────────
  function exportPNG() {
    if (!_canvas) return;
    const url = _canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
    const a = Object.assign(document.createElement('a'), { href: url, download: `diagrama-${_pid || 'pf'}.png` });
    a.click();
    showToast('PNG exportado!');
  }

  function exportSVG() {
    if (!_canvas) return;
    const svg = _canvas.toSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `diagrama-${_pid || 'pf'}.svg` });
    a.click();
    showToast('SVG exportado!');
  }

  // ── Generate from project tasks ───────────────────────────
  function generateFromProject(pid, cards) {
    if (!_canvas) return;
    _canvas.clear();
    _drawGrid();
    _pid = pid;

    const BPMN_ORDER = ['esbocar','viabilizar','atribuir','executar','avaliar','corrigir','validar_cliente','concluido'];
    const BPMN_COLS  = { esbocar:'process', viabilizar:'process', atribuir:'io', executar:'cloud', avaliar:'decision', corrigir:'decision', validar_cliente:'actor', concluido:'start' };
    const byBpmn = {};
    cards.forEach(c => {
      const b = c.bpmn || c.bpmn_status || 'esbocar';
      (byBpmn[b] = byBpmn[b]||[]).push(c);
    });

    let xi = 60;
    BPMN_ORDER.forEach(bpmn => {
      const group = byBpmn[bpmn];
      if (!group?.length) return;
      let yi = 60;
      group.forEach(c => {
        const type = BPMN_COLS[bpmn] || 'process';
        const cfg  = PALETTE[type];
        const rect = new fabric.Rect({ width:160, height:60, fill:cfg.fill, stroke:cfg.stroke, strokeWidth:1.5, rx:6, ry:6 });
        const txt  = new fabric.Text(c.title.slice(0,22)+(c.title.length>22?'…':''), {
          left:80, top:30, originX:'center', originY:'center',
          fontSize:11, fill:cfg.text, fontFamily:'system-ui', fontWeight:'600',
        });
        const grp = new fabric.Group([rect, txt], { left:xi, top:yi });
        grp._pf_node = true; grp._pf_type = type; grp._pf_label = c.title;
        grp.id = 'gen_' + c.id;
        grp.on('mousedblclick', () => _promptRename(grp));
        _canvas.add(grp);
        yi += 80;
      });
      xi += 200;
    });

    _canvas.renderAll();
    setTimeout(fitView, 100);
    _hist0();
    showToast('Diagrama gerado a partir das tarefas do projeto!');
  }

  // ── Rastreabilidade ───────────────────────────────────────
  function _populateTaskSel() {
    const sel = document.getElementById('dgv9-task-sel');
    if (!sel) return;
    const cards = PFBoard?.cards?.length ? PFBoard.cards : (window.mockCards||[]);
    const proj  = cards.filter(c => (c.project_id||c.sl) === _pid);
    sel.innerHTML = '<option value="">— Vincular a uma tarefa (opcional) —</option>' +
      proj.map(c => `<option value="${c.id}" ${c.id===_taskId?'selected':''}>${String(c.title).replace(/</g,'&lt;')}</option>`).join('');
  }

  function setLinkedTask(taskId) {
    _taskId = taskId || null;
    showToast(taskId ? 'Diagrama vinculado à tarefa selecionada' : 'Vínculo de tarefa removido');
  }

  function _updateBadge() {
    const el = document.getElementById('diagram-project-badge');
    const proj = (window.mockProjects||[]).find(p=>p.id===_pid);
    if (el) el.textContent = proj ? `Projeto: ${proj.name}` : 'Editor V9 — Fabric.js';
  }

  // ── Drag & drop da paleta ─────────────────────────────────
  function _bindDragPalette(root) {
    root.querySelectorAll('.dgv9-pal-item').forEach(item => {
      item.addEventListener('dragstart', e => { e.dataTransfer.setData('pf-node-type', item.dataset.type); });
    });
    const wrap = root.querySelector('#dgv9-canvas-wrap');
    wrap.addEventListener('dragover', e => e.preventDefault());
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('pf-node-type');
      if (!type) return;
      const rect = wrap.getBoundingClientRect();
      const vt   = _canvas.viewportTransform;
      const x    = (e.clientX - rect.left - vt[4]) / _canvas.getZoom();
      const y    = (e.clientY - rect.top  - vt[5]) / _canvas.getZoom();
      addNode(type, x - 80, y - 30);
    });
  }

  // ── Toolbar bindings ─────────────────────────────────────
  function _bindToolbar() {
    // Inline — handled via onclick attributes in HTML
  }

  // ── Teclado ───────────────────────────────────────────────
  let _keysReady = false;
  function _bindKeyboard() {
    if (_keysReady) return;
    _keysReady = true;
    document.addEventListener('keydown', e => {
      const inField = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
      if (inField) return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'v') setTool('select');
      if (e.key === 't') addText();
      if (e.key === 'Escape') { _canvas?.discardActiveObject(); _canvas?.renderAll(); _stopLineTool(); }
      if ((e.ctrlKey||e.metaKey) && e.key==='z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey||e.metaKey) && (e.key==='y'||e.key==='Y')) { e.preventDefault(); redo(); }
      if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); save(); }
      if ((e.ctrlKey||e.metaKey) && e.key==='a') { e.preventDefault(); selectAll(); }
    });
  }

  // ── CSS ───────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('dgv9-css')) return;
    const s = document.createElement('style');
    s.id = 'dgv9-css';
    s.textContent = `
      #dgv9-root { background: var(--bg-0); font-size: 13px; }
      .dgv9-toolbar { display:flex;align-items:center;gap:3px;padding:5px 10px;background:var(--bg-1);border-bottom:1px solid var(--bd);flex-wrap:wrap;flex-shrink:0; }
      .dgv9-tb-group { display:flex;align-items:center;gap:2px; }
      .dgv9-tb-sep { width:1px;height:22px;background:var(--bd);margin:0 5px;flex-shrink:0; }
      .dgv9-btn { display:flex;align-items:center;gap:4px;padding:5px 9px;border-radius:7px;font-size:12px;font-weight:600;color:var(--tx-2);background:transparent;border:1.5px solid transparent;cursor:pointer;white-space:nowrap;transition:all .15s;font-family:var(--font); }
      .dgv9-btn:hover { background:var(--bg-2);border-color:var(--bd);color:var(--tx-1); }
      .dgv9-btn--active { background:var(--ac-bg)!important;border-color:var(--ac)!important;color:var(--ac)!important; }
      .dgv9-btn--save { background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important; }
      .dgv9-btn--save:hover { opacity:.88; }
      .dgv9-zoom { font-size:11px;font-family:var(--mono);color:var(--tx-2);min-width:38px;text-align:center; }
      .dgv9-palette { width:80px;background:var(--bg-1);border-right:1px solid var(--bd);padding:8px 4px;overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column;gap:4px; }
      .dgv9-pal-item { display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:7px;cursor:grab;border:1.5px solid transparent;transition:all .15s;user-select:none; }
      .dgv9-pal-item:hover { background:var(--bg-2);border-color:var(--bd); }
      .dgv9-pal-item span { font-size:9px;color:var(--tx-3);text-align:center;line-height:1.2; }
      .dgv9-pal-preview { width:56px;height:28px;border:1.5px solid;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center; }
      .dgv9-pal-preview svg { width:54px;height:26px; }
      .dgv9-canvas-wrap { flex:1;overflow:hidden;position:relative; }
      .dgv9-canvas-wrap canvas { display:block; }
      .dgv9-props { width:210px;background:var(--bg-1);border-left:1px solid var(--bd);padding:12px;overflow-y:auto;flex-shrink:0; }
      .dgv9-props-title { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:12px; }
      .dgv9-prop-row { margin-bottom:10px; }
      .dgv9-prop-lbl { display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.3px; }
      .dgv9-prop-input { width:100%;padding:5px 8px;background:var(--bg-2);border:1.5px solid var(--bd);border-radius:6px;font-size:12px;color:var(--tx-1);font-family:var(--font);outline:none;transition:border-color .15s;box-sizing:border-box; }
      .dgv9-prop-input:focus { border-color:var(--ac); }
      .dgv9-hint { font-size:11px;color:var(--tx-3);line-height:1.6;padding:4px 0; }
      .dgv9-del-btn { width:100%;padding:7px;margin-top:8px;background:var(--red-bg);color:var(--red);border:1px solid var(--red-bg);border-radius:7px;font-size:12px;cursor:pointer;font-family:var(--font);font-weight:600;transition:all .15s; }
      .dgv9-del-btn:hover { background:var(--red);color:#fff; }
      .dgv9-status { display:flex;align-items:center;gap:6px;padding:4px 12px;background:var(--bg-1);border-top:1px solid var(--bd);font-size:11px;color:var(--tx-3);flex-shrink:0; }
    `;
    document.head.appendChild(s);
  }

  // ── API pública ───────────────────────────────────────────
  return {
    init, save, addNode, addText,
    startLineTool, startArrowTool,
    setTool, zoomIn, zoomOut, fitView,
    deleteSelected, selectAll, clearAll, autoLayout,
    undo, redo, exportPNG, exportSVG,
    generateFromProject, setLinkedTask,
    _propLabel, _propFill, _propStroke, _propOpacity, _propLineW,
    get canvas() { return _canvas; },
    get pid()    { return _pid; },
  };

})();

// ── DiagramViewManager V9 ─────────────────────────────────────
window.DiagramViewManager = {
  _pid: null,
  async init(pid) {
    this._pid = pid || PF.currentProject;
    if (!this._pid) { showToast('Selecione um projeto primeiro', true); return; }
    await DiagramEngineV9.init('dg-container', this._pid);
  },
  async generate(pid) {
    this._pid = pid || PF.currentProject;
    if (!this._pid) { showToast('Selecione um projeto primeiro', true); return; }
    await DiagramEngineV9.init('dg-container', this._pid);
    const cards = PFBoard.cards.length ? PFBoard.cards
      : (window.mockCards||[]).filter(c=>(c.project_id||c.sl)===this._pid);
    DiagramEngineV9.generateFromProject(this._pid, cards);
  },
};
