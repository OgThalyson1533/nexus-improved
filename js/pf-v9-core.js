// ============================================================
//  ProjectFlow V9 — pf-v9-core.js
//  Melhorias completas: Toast, Dashboard, Kanban, Wiki, Rastreabilidade
//  Carregado APÓS pf-producao.js e diagram-engine-v9.js
// ============================================================
'use strict';

// ════════════════════════════════════════════════════════════
//  SEÇÃO 1 — TOAST V9 (canto inferior direito, empilhável)
// ════════════════════════════════════════════════════════════
(function () {
  const CSS = `
    #pf-toast-stack{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none}
    .pft{display:flex;align-items:center;gap:10px;padding:12px 16px;min-width:220px;max-width:380px;
      background:var(--bg-1);border:1.5px solid var(--bd);border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.18);font-size:13px;font-weight:600;color:var(--tx-1);
      pointer-events:auto;cursor:pointer;transition:opacity .2s,transform .2s;
      animation:pftIn .25s cubic-bezier(.34,1.56,.64,1)}
    .pft.out{animation:pftOut .2s ease-in forwards}
    .pft.ok,.pft.success{border-color:var(--green);background:var(--green-bg);color:var(--green)}
    .pft.err,.pft.error{border-color:var(--red);background:var(--red-bg);color:var(--red)}
    .pft.warn{border-color:var(--yellow);background:#fffbeb;color:#92400e}
    .pft-icon{font-size:16px;flex-shrink:0}
    .pft-msg{flex:1;line-height:1.4}
    .pft-close{opacity:.4;font-size:13px;flex-shrink:0;transition:opacity .15s}
    .pft-close:hover{opacity:1}
    @keyframes pftIn{from{opacity:0;transform:translateX(50px) scale(.9)}to{opacity:1;transform:none}}
    @keyframes pftOut{to{opacity:0;transform:translateX(50px) scale(.85)}}
  `;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  let stack = document.getElementById('pf-toast-stack');
  if (!stack) { stack = document.createElement('div'); stack.id = 'pf-toast-stack'; document.body.appendChild(stack); }

  const ICONS = { ok:'✅', success:'✅', err:'❌', error:'❌', warn:'⚠️', info:'ℹ️' };

  function remove(item) {
    if (!item || item.classList.contains('out')) return;
    item.classList.add('out');
    setTimeout(() => item.remove(), 220);
  }

  window.showToast = function (msg, type) {
    if (type === true)  type = 'error';
    if (type === false || type === undefined) type = 'ok';

    const item = document.createElement('div');
    item.className = 'pft ' + (type || 'ok');
    item.innerHTML = `<span class="pft-icon">${ICONS[type]||'✅'}</span><span class="pft-msg">${String(msg).replace(/</g,'&lt;')}</span><span class="pft-close">✕</span>`;
    item.querySelector('.pft-close').onclick = e => { e.stopPropagation(); remove(item); };
    item.onclick = () => remove(item);
    stack.appendChild(item);

    // Max 5 simultâneos
    const all = stack.querySelectorAll('.pft:not(.out)');
    if (all.length > 5) remove(all[0]);

    const delay = (type === 'error' || type === 'err') ? 5000 : 3400;
    setTimeout(() => remove(item), delay);
  };
})();

// ════════════════════════════════════════════════════════════
//  SEÇÃO 2 — DASHBOARD V9
//  Todas as tarefas de todos os projetos + filtros + PDF
// ════════════════════════════════════════════════════════════
window.renderDashboard = function () {
  const el = document.getElementById('dashboard-content');
  if (!el) return;

  // Coleta todas as tarefas (global)
  const allCards    = (PFBoard.cards.length ? PFBoard.cards : (window.mockCards || []));
  const allProjects = window.mockProjects || [];
  const team        = window.mockTeam || [];
  const cols        = PFBoard.columns.length ? PFBoard.columns
                      : (typeof initDefaultColumns === 'function' ? initDefaultColumns() : []);

  // Filtros
  const g  = id => document.getElementById(id)?.value || '';
  const fP = g('dash-f-proj'),  fS = g('dash-f-status'),
        fPr= g('dash-f-pri'),   fA = g('dash-f-assign'),
        fC = g('dash-f-client'),fD1= g('dash-f-d1'),    fD2 = g('dash-f-d2');

  let cards = [...allCards];
  if (fP  !== 'all' && fP)  cards = cards.filter(c => (c.project_id||c.sl) === fP);
  if (fPr !== 'all' && fPr) cards = cards.filter(c => (c.priority||'medium') === fPr);
  if (fA  !== 'all' && fA)  cards = cards.filter(c => (c.assignee||c.assigned_to) === fA);
  if (fC  !== 'all' && fC) {
    cards = cards.filter(c => {
      const p = allProjects.find(p => p.id === (c.project_id||c.sl));
      return (p?.client_name||p?.client||'') === fC;
    });
  }
  if (fS === 'active') cards = cards.filter(c => ['executar','avaliar','corrigir','validar_cliente'].includes(c.bpmn||c.bpmn_status));
  else if (fS && fS !== 'all') cards = cards.filter(c => (c.bpmn||c.bpmn_status) === fS);
  if (fD1) cards = cards.filter(c => (c.due_date||c.date||'') >= fD1);
  if (fD2) cards = cards.filter(c => (c.due_date||c.date||'') <= fD2);

  const total  = cards.length;
  const done   = cards.filter(c => (c.bpmn||c.bpmn_status) === 'concluido').length;
  const inExec = cards.filter(c => (c.bpmn||c.bpmn_status) === 'executar').length;
  const inRev  = cards.filter(c => ['avaliar','corrigir','validar_cliente'].includes(c.bpmn||c.bpmn_status)).length;
  const overdue = cards.filter(c => {
    const d = c.due_date || c.date;
    return d && (c.bpmn||c.bpmn_status) !== 'concluido' && new Date(d) < new Date();
  }).length;
  const pct    = total ? Math.round(done/total*100) : 0;
  const byPri  = {critical:0,high:0,medium:0,low:0};
  cards.forEach(c => { byPri[c.priority||'medium']++; });

  const clients  = [...new Set(allProjects.map(p=>p.client_name||p.client||'').filter(Boolean))];
  const _e = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  el.innerHTML = `
  <div style="max-width:1300px" id="dash-print-zone">

    <!-- Filtros -->
    <div style="background:var(--bg-1);border:1px solid var(--bd);border-radius:var(--r-xl);padding:16px 20px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:12px">🔍 Filtros — Visão Global</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
        ${_sel('dash-f-proj','Projeto','all',[{v:'all',l:'Todos os projetos'},...allProjects.map(p=>({v:p.id,l:p.name}))],fP)}
        ${_sel('dash-f-status','Status','all',[{v:'all',l:'Todos'},{v:'active',l:'⚡ Ativas (Exec+Rev)'},{v:'esbocar',l:'Esboçar'},{v:'executar',l:'Executar'},{v:'avaliar',l:'Avaliar'},{v:'concluido',l:'Concluído'}],fS)}
        ${_sel('dash-f-pri','Prioridade','all',[{v:'all',l:'Todas'},{v:'critical',l:'🔴 Crítica'},{v:'high',l:'↑ Alta'},{v:'medium',l:'⬝ Média'},{v:'low',l:'↓ Baixa'}],fPr)}
        ${_sel('dash-f-assign','Responsável','all',[{v:'all',l:'Todos'},...team.map(m=>({v:m.id,l:m.name}))],fA)}
        ${_sel('dash-f-client','Cliente','all',[{v:'all',l:'Todos'},...clients.map(c=>({v:c,l:c}))],fC)}
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">Data de</label>
          <input type="date" id="dash-f-d1" class="field-input" value="${fD1}" style="font-size:12px;padding:5px 8px" onchange="renderDashboard()">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">até</label>
          <input type="date" id="dash-f-d2" class="field-input" value="${fD2}" style="font-size:12px;padding:5px 8px" onchange="renderDashboard()">
        </div>
        <button class="btn-secondary" onclick="clearDashFilters()" style="font-size:12px;padding:5px 12px">↺ Limpar</button>
        <button class="btn-primary" onclick="exportDashPDF()" style="font-size:12px;padding:5px 12px">📄 Exportar PDF</button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="dash-stats" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:20px">
      ${[['📋','Total',total,'var(--tx-1)'],['✅','Concluídas',done,'var(--green)'],['⚡','Em Execução',inExec,'var(--yellow)'],['🔍','Em Revisão',inRev,'var(--blue)'],['⚠️','Atrasadas',overdue,'var(--red)']].map(([i,l,v,c])=>`
      <div class="dash-stat">
        <div class="dash-stat-icon">${i}</div>
        <div class="dash-stat-n" style="color:${c}">${v}</div>
        <div class="dash-stat-l">${l}</div>
      </div>`).join('')}
    </div>

    <!-- Progress -->
    <div class="dash-progress-card">
      <div class="dash-progress-hdr">
        <span class="dash-progress-title">Progresso Global</span>
        <span class="dash-progress-pct" style="color:var(--ac)">${pct}%</span>
      </div>
      <div class="dash-progress-track">
        <div class="dash-progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--ac),var(--purple))"></div>
      </div>
      <div style="font-size:12px;color:var(--tx-3);margin-top:8px">${done} de ${total} tarefas concluídas</div>
    </div>

    <!-- Prioridade + Coluna -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div class="dash-card">
        <div class="dash-card-title">Por Prioridade</div>
        ${[['critical','● Crítica','var(--red)'],['high','↑ Alta','var(--yellow)'],['medium','⬝ Média','var(--tx-2)'],['low','↓ Baixa','var(--tx-3)']].map(([p,l,c])=>byPri[p]?`
        <div class="dash-row">
          <span style="color:${c};font-weight:600;font-size:13px;min-width:80px">${l}</span>
          <div class="dash-bar"><div style="height:100%;background:${c};border-radius:3px;width:${total?Math.round(byPri[p]/total*100):0}%"></div></div>
          <span class="dash-cnt">${byPri[p]}</span>
        </div>`:'').join('')||'<p style="font-size:13px;color:var(--tx-3)">Sem tarefas</p>'}
      </div>
      <div class="dash-card">
        <div class="dash-card-title">Por Coluna</div>
        ${cols.map(col=>{
          const cnt = cards.filter(c=>{
            const _isUUID=/^[0-9a-f]{8}-[0-9a-f]{4}/i;
            if(c.column_id&&_isUUID.test(c.column_id)) return c.column_id===col.id;
            if(col.bpmn_mapping?.length) return col.bpmn_mapping.includes(c.bpmn||c.bpmn_status||'esbocar');
            const lm={'col-todo':'todo','col-plan':'plan','col-exec':'exec','col-rev':'rev','col-done':'done'};
            return c.col===lm[col.id];
          }).length;
          return cnt?`<div class="dash-row"><span class="dash-col-dot" style="background:${col.color}"></span><span style="font-size:13px;color:var(--tx-1)">${_e(col.name)}</span><div style="flex:1"></div><span class="dash-cnt">${cnt}</span></div>`:'';
        }).join('')}
      </div>
    </div>

    <!-- Tabela completa -->
    <div class="dash-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="dash-card-title" style="margin:0">Todas as Tarefas (${cards.length})</div>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table" style="width:100%;font-size:12px">
          <thead><tr><th>Tarefa</th><th>Projeto</th><th>Status BPMN</th><th>Prioridade</th><th>Responsável</th><th>Cliente</th><th>Entrega</th></tr></thead>
          <tbody>
            ${cards.map(c=>{
              const bpmn = c.bpmn||c.bpmn_status||'esbocar';
              const proj = allProjects.find(p=>p.id===(c.project_id||c.sl));
              const mem  = team.find(m=>m.id===(c.assignee||c.assigned_to));
              const bL   = {esbocar:'Esboçar',viabilizar:'Viabilizar',atribuir:'Atribuir',executar:'Executar',avaliar:'Avaliar',corrigir:'Corrigir',validar_cliente:'Val.Cliente',concluido:'Concluído'};
              const pI   = {low:'↓',medium:'⬝',high:'↑',critical:'●'}[c.priority||'medium'];
              const due  = c.due_date||c.date||'';
              const over = due&&bpmn!=='concluido'&&new Date(due)<new Date();
              return `<tr onclick="openCardEdit('${_e(c.id)}')" style="cursor:pointer">
                <td style="font-weight:600;color:var(--tx-1)">${_e(c.title)}</td>
                <td>${proj?`<span style="padding:2px 8px;border-radius:20px;background:${proj.color||'#888'}22;color:${proj.color||'var(--tx-2)'};font-size:11px;font-weight:600">${_e(proj.name)}</span>`:'—'}</td>
                <td>${bL[bpmn]||bpmn}</td>
                <td style="color:${{'low':'var(--tx-3)','medium':'var(--tx-2)','high':'var(--yellow)','critical':'var(--red)'}[c.priority||'medium']}">${pI} ${c.priority||'medium'}</td>
                <td>${mem?`<div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:20px;border-radius:50%;background:${mem.color||'var(--ac)'};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff">${_e(mem.initials||'?')}</div>${_e(mem.name)}</div>`:'—'}</td>
                <td>${_e(proj?.client_name||proj?.client||'—')}</td>
                <td style="color:${over?'var(--red)':'var(--tx-3)'};font-weight:${over?700:400}">${due||'—'}${over?' ⚠️':''}</td>
              </tr>`;
            }).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx-3)">Nenhuma tarefa encontrada com estes filtros</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

  </div>`;
};

function _sel(id, label, defV, opts, cur) {
  return `<div>
    <label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">${label}</label>
    <select id="${id}" class="field-input" style="font-size:12px;padding:5px 8px" onchange="renderDashboard()">
      ${opts.map(o=>`<option value="${o.v}" ${(cur===o.v||(!cur&&o.v===defV))?'selected':''}>${o.l}</option>`).join('')}
    </select>
  </div>`;
}

window.clearDashFilters = function () {
  ['dash-f-proj','dash-f-status','dash-f-pri','dash-f-assign','dash-f-client'].forEach(id=>{
    const e=document.getElementById(id); if(e)e.value='all';
  });
  ['dash-f-d1','dash-f-d2'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderDashboard();
};

window.exportDashPDF = function () {
  const zone = document.getElementById('dash-print-zone');
  if (!zone) { showToast('Nada para exportar', true); return; }
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Dashboard — ProjectFlow V9</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#1a1a18}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f5f5f0;padding:8px;text-align:left;border-bottom:2px solid #e4e4e0}
    td{padding:7px 8px;border-bottom:1px solid #e4e4e0}
    @page{margin:15mm} @media print{button,select,input{display:none!important}}
    .dash-stat{display:inline-block;margin:4px 8px 4px 0;padding:10px 16px;border:1px solid #e4e4e0;border-radius:8px;text-align:center}
    .dash-stat-n{font-size:26px;font-weight:900}.dash-stat-l{font-size:10px;color:#888;text-transform:uppercase}
    h2{font-size:14px;font-weight:700;margin:18px 0 8px;border-bottom:1px solid #eee;padding-bottom:6px}
    </style></head><body>
    <h1 style="font-size:22px;font-weight:800;margin-bottom:4px">📊 Dashboard — ProjectFlow V9</h1>
    <p style="color:#888;font-size:12px;margin-bottom:16px">Exportado em: ${new Date().toLocaleString('pt-BR')}</p>
    ${zone.innerHTML}
    <script>setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},400)<\/script>
    </body></html>`);
  win.document.close();
  showToast('PDF aberto para impressão!');
};

// ════════════════════════════════════════════════════════════
//  SEÇÃO 3 — KANBAN V9 ENHANCEMENTS
// ════════════════════════════════════════════════════════════

// 3.1 — Filtros locais no Kanban
(function injectKanbanFilterBar() {
  function build() {
    const kbar = document.querySelector('#view-kanban .kanban-toolbar');
    if (!kbar || document.getElementById('kb-local-filters')) return;
    const bar = document.createElement('div');
    bar.id = 'kb-local-filters';
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 20px 6px;background:var(--bg-1);border-bottom:1px solid var(--bd);flex-wrap:wrap;flex-shrink:0';
    bar.innerHTML = `
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3)">Filtrar:</span>
      <select id="kbf-area" class="field-input" style="font-size:12px;padding:4px 8px" onchange="applyKanbanFilters()">
        <option value="">Área</option>
        ${['TI','Marketing','Comercial','Operações','RH','Financeiro','Produto','Design'].map(a=>`<option>${a}</option>`).join('')}
      </select>
      <select id="kbf-assign" class="field-input" style="font-size:12px;padding:4px 8px" onchange="applyKanbanFilters()">
        <option value="">Responsável</option>
      </select>
      <select id="kbf-pri" class="field-input" style="font-size:12px;padding:4px 8px" onchange="applyKanbanFilters()">
        <option value="">Criticidade</option>
        <option value="critical">🔴 Crítica</option>
        <option value="high">↑ Alta</option>
        <option value="medium">⬝ Média</option>
        <option value="low">↓ Baixa</option>
      </select>
      <button class="pill clickable" onclick="clearKanbanFilters()" style="font-size:11px;padding:3px 10px">✕ Limpar</button>
      <button class="pill clickable" onclick="openRecurringManager()" style="font-size:11px;padding:3px 10px;margin-left:4px">🔄 Recorrentes</button>
      <button class="pill clickable" onclick="openMemberManager()" style="font-size:11px;padding:3px 10px">👤 Equipe</button>
    `;
    kbar.insertAdjacentElement('afterend', bar);
    _populateAssigneeFilter();
  }

  function _populateAssigneeFilter() {
    const sel = document.getElementById('kbf-assign');
    if (!sel) return;
    const team = window.mockTeam || [];
    const cur  = [...sel.options].map(o=>o.value).filter(Boolean);
    team.forEach(m => {
      if (!cur.includes(m.id)) { const o=new Option(m.name,m.id); sel.add(o); }
    });
  }

  window.applyKanbanFilters = function () {
    const area  = document.getElementById('kbf-area')?.value || '';
    const asgn  = document.getElementById('kbf-assign')?.value || '';
    const pri   = document.getElementById('kbf-pri')?.value || '';
    document.querySelectorAll('.kcard').forEach(card => {
      const cid = card.dataset.cardId;
      const all = PFBoard.cards.length ? PFBoard.cards : (window.mockCards||[]);
      const c   = all.find(x=>x.id===cid);
      if (!c) { card.style.display=''; return; }
      let show = true;
      if (area && (c.area||'') !== area) show = false;
      if (asgn && (c.assignee||c.assigned_to||'') !== asgn) show = false;
      if (pri  && (c.priority||'medium') !== pri) show = false;
      card.style.display = show ? '' : 'none';
    });
  };

  window.clearKanbanFilters = function () {
    ['kbf-area','kbf-assign','kbf-pri'].forEach(id => {
      const e=document.getElementById(id); if(e)e.value='';
    });
    document.querySelectorAll('.kcard').forEach(c=>c.style.display='');
  };

  // Hook into switchView
  const _orig = window.switchView;
  window.switchView = function (name, btn) {
    _orig && _orig(name, btn);
    if (name === 'kanban') setTimeout(() => { build(); _populateAssigneeFilter(); }, 300);
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(build, 1500));
})();

// 3.2 — Campos extras nos cards (novos campos obrigatórios do briefing)
(function patchCardFields() {

  // Injeta campos no modal de nova tarefa
  function addNewCardFields() {
    const modal = document.getElementById('new-card-overlay');
    if (!modal || modal.dataset.v9) return;
    modal.dataset.v9 = '1';
    const footer = modal.querySelector('.modal-footer');
    if (!footer) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div style="margin-bottom:10px;padding:10px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);letter-spacing:.5px;margin-bottom:8px">📋 Dados da Solicitação</div>
        <div class="field-grid-2" style="margin-bottom:10px">
          <div class="field-row"><label class="field-label">Data da solicitação</label><input class="field-input" id="new-req-date" type="date"></div>
          <div class="field-row"><label class="field-label">Nome do Solicitante</label><input class="field-input" id="new-requester" type="text" placeholder="Ex: Maria Souza"></div>
        </div>
        <div class="field-grid-2" style="margin-bottom:10px">
          <div class="field-row"><label class="field-label">Área Solicitante</label>
            <select class="field-input" id="new-area"><option value="">Selecione...</option>${['TI','Marketing','Comercial','Operações','RH','Financeiro','Produto','Design'].map(a=>`<option>${a}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label class="field-label">Cliente</label><input class="field-input" id="new-client-name" type="text" placeholder="Nome do cliente"></div>
        </div>
        <div class="field-row"><label class="field-label">Pessoas-chave</label><input class="field-input" id="new-key-people" type="text" placeholder="Stakeholders, responsáveis adicionais..."></div>
      </div>`;
    footer.parentNode.insertBefore(div, footer);
  }

  // Injeta campos no modal de edição
  function addEditCardFields() {
    const panel = document.getElementById('ce-panel-details');
    if (!panel || panel.dataset.v9) return;
    panel.dataset.v9 = '1';
    const footer = panel.closest('.modal-body')?.querySelector('.modal-footer');
    const div = document.createElement('div');
    div.id = 'ce-extra-fields';
    div.innerHTML = `
      <div style="margin:0 0 12px;padding:12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);letter-spacing:.5px;margin-bottom:10px">📋 Dados da Solicitação</div>
        <div class="ce-grid2" style="margin-bottom:10px">
          <div><label class="field-label">Data da solicitação</label><input class="field-input" id="ce-req-date" type="date"></div>
          <div><label class="field-label">Solicitante</label><input class="field-input" id="ce-requester" type="text" placeholder="Nome do solicitante"></div>
        </div>
        <div class="ce-grid2" style="margin-bottom:10px">
          <div><label class="field-label">Área Solicitante</label>
            <select class="field-input" id="ce-area"><option value="">Selecione...</option>${['TI','Marketing','Comercial','Operações','RH','Financeiro','Produto','Design'].map(a=>`<option>${a}</option>`).join('')}</select>
          </div>
          <div><label class="field-label">Cliente</label><input class="field-input" id="ce-client-name" type="text" placeholder="Nome do cliente"></div>
        </div>
        <div><label class="field-label">Pessoas-chave</label><input class="field-input" id="ce-key-people" type="text" placeholder="Stakeholders, responsáveis adicionais..."></div>
      </div>`;
    if (footer) footer.parentNode.insertBefore(div, footer);
    else panel.appendChild(div);
  }

  // Hook openCardEdit
  const _origOpen = window.openCardEdit;
  window.openCardEdit = function (cardId) {
    _origOpen && _origOpen(cardId);
    setTimeout(() => {
      addEditCardFields();
      const all = PFBoard.cards.length ? PFBoard.cards : (window.mockCards||[]);
      const c   = all.find(x=>x.id===cardId);
      if (!c) return;
      const _sv = (id,v) => { const e=document.getElementById(id); if(e)e.value=v||''; };
      _sv('ce-req-date',   c.request_date || c.req_date || '');
      _sv('ce-requester',  c.requester || '');
      _sv('ce-area',       c.area || '');
      _sv('ce-client-name',c.client_name || '');
      _sv('ce-key-people', c.key_people || '');
      // Injeta checklist
      _injectChecklist(cardId);
      // Botão ZIP se concluído
      const bpmn = c.bpmn||c.bpmn_status||'esbocar';
      if (bpmn === 'concluido') _injectZipButton(cardId);
    }, 150);
  };

  // Hook saveCardEdit
  const _origSave = window.saveCardEdit;
  window.saveCardEdit = async function () {
    const cardId = PF.activeCardId;
    if (cardId) {
      const all = PFBoard.cards.length ? PFBoard.cards : (window.mockCards||[]);
      const c   = all.find(x=>x.id===cardId);
      if (c) {
        const _gv = id => document.getElementById(id)?.value?.trim()||null;
        c.request_date = _gv('ce-req-date');
        c.requester    = _gv('ce-requester');
        c.area         = _gv('ce-area');
        c.client_name  = _gv('ce-client-name');
        c.key_people   = _gv('ce-key-people');
      }
    }
    return _origSave && _origSave();
  };

  document.addEventListener('DOMContentLoaded', () => { setTimeout(addNewCardFields, 1000); setTimeout(addEditCardFields, 1200); });
})();

// 3.3 — Checklist interativo
window.PFChecklist = (function () {
  const _store = {};
  const _k = id => 'pf_chk_v9_' + id;
  function load(id) {
    if (_store[id]) return _store[id];
    try { _store[id] = JSON.parse(localStorage.getItem(_k(id)) || '[]'); }
    catch { _store[id] = []; }
    return _store[id];
  }
  function persist(id) {
    try { localStorage.setItem(_k(id), JSON.stringify(_store[id])); } catch(e) {}
    if (window.PF?.supabase && !window.PF?.demoMode) {
      PF.supabase.from('tasks').update({ checklist: _store[id], updated_at: new Date().toISOString() }).eq('id', id).then(()=>{});
    }
  }
  function add(id, txt) {
    if (!txt?.trim()) return;
    load(id).push({ id:'ci_'+Date.now(), text:txt.trim(), done:false });
    persist(id); render(id);
  }
  function toggle(id, itemId) {
    const item = load(id).find(x=>x.id===itemId);
    if (item) item.done = !item.done;
    persist(id); render(id);
  }
  function del(id, itemId) {
    _store[id] = load(id).filter(x=>x.id!==itemId);
    persist(id); render(id);
  }
  function render(cardId) {
    const el = document.getElementById('pf-chk-'+cardId);
    if (!el) return;
    const items = load(cardId);
    const done  = items.filter(x=>x.done).length;
    const pct   = items.length ? Math.round(done/items.length*100) : 0;
    el.innerHTML = `
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);letter-spacing:.5px;margin-bottom:8px;display:flex;justify-content:space-between">
        <span>✅ Checklist (${done}/${items.length})</span><span style="color:var(--ac)">${pct}%</span>
      </div>
      ${items.length?`<div style="height:3px;background:var(--bg-3);border-radius:2px;margin-bottom:10px"><div style="height:100%;width:${pct}%;background:var(--green);border-radius:2px;transition:width .3s"></div></div>`:''}
      ${items.map(it=>`
        <div style="display:flex;align-items:center;gap:8px;padding:4px 2px;border-radius:5px" onmouseenter="this.querySelector('.chk-x').style.opacity='1'" onmouseleave="this.querySelector('.chk-x').style.opacity='0'">
          <input type="checkbox" ${it.done?'checked':''} onchange="PFChecklist.toggle('${cardId}','${it.id}')" style="cursor:pointer;accent-color:var(--green);width:15px;height:15px;flex-shrink:0">
          <span style="flex:1;font-size:13px;color:var(--tx-1);${it.done?'text-decoration:line-through;color:var(--tx-3)':''}">${String(it.text).replace(/</g,'&lt;')}</span>
          <button class="chk-x" onclick="PFChecklist.del('${cardId}','${it.id}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px;opacity:0;transition:opacity .15s;padding:2px 4px">✕</button>
        </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:10px">
        <input type="text" id="chk-new-${cardId}" placeholder="Adicionar item..." style="flex:1;padding:6px 10px;background:var(--bg-2);border:1.5px solid var(--bd);border-radius:var(--r-s);font-size:12px;color:var(--tx-1);font-family:var(--font);outline:none"
          onfocus="this.style.borderColor='var(--ac)'" onblur="this.style.borderColor='var(--bd)'"
          onkeydown="if(event.key==='Enter'){PFChecklist.add('${cardId}',this.value);this.value=''}">
        <button class="btn-primary" style="font-size:12px;padding:6px 10px" onclick="const i=document.getElementById('chk-new-${cardId}');PFChecklist.add('${cardId}',i.value);i.value=''">+</button>
      </div>`;
  }
  function inject(cardId) {
    const panel = document.getElementById('ce-panel-details');
    if (!panel || document.getElementById('pf-chk-'+cardId)) return;
    const footer = panel.closest('.modal-body')?.querySelector('.modal-footer');
    const div = document.createElement('div');
    div.id = 'pf-chk-'+cardId;
    div.style.cssText = 'margin:0 0 12px;padding:12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)';
    if (footer) footer.parentNode.insertBefore(div, footer);
    else panel.appendChild(div);
    render(cardId);
  }
  return { add, toggle, del, render, inject, load };
})();

function _injectChecklist(cardId) { PFChecklist.inject(cardId); }

// 3.4 — Botão exportar ZIP para tarefas concluídas
function _injectZipButton(cardId) {
  const footer = document.querySelector('#card-edit-overlay .modal-footer');
  if (!footer || document.getElementById('zip-btn-'+cardId)) return;
  const btn = document.createElement('button');
  btn.id = 'zip-btn-'+cardId;
  btn.className = 'btn-secondary';
  btn.style.fontSize = '12px';
  btn.innerHTML = '📦 Exportar Documentação .ZIP';
  btn.onclick = () => exportTaskZip(cardId);
  footer.insertBefore(btn, footer.firstChild);
}

window.exportTaskZip = async function (cardId) {
  const all  = PFBoard.cards.length ? PFBoard.cards : (window.mockCards||[]);
  const c    = all.find(x=>x.id===cardId);
  if (!c) { showToast('Tarefa não encontrada', true); return; }
  const proj = (window.mockProjects||[]).find(p=>p.id===(c.project_id||c.sl));
  const atts = window.AttachmentManager ? AttachmentManager.getForCard(cardId) : [];
  const chk  = window.PFChecklist ? PFChecklist.load(cardId) : [];
  const kb   = window.KBStore ? KBStore.getBlocks(c.project_id||c.sl||'demo') : [];

  const docHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${c.title}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;color:#1a1a18;line-height:1.7}
  h1{font-size:22px;font-weight:800}h2{font-size:15px;font-weight:700;color:#555;margin:20px 0 8px;border-bottom:1px solid #eee;padding-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 10px;border:1px solid #eee}th{background:#f5f5f0;font-weight:700}
  .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;background:#d1fae5;color:#065f46}</style>
  </head><body>
  <span class="badge">✅ Concluído</span>
  <h1>${c.title}</h1>
  <p>Projeto: <strong>${proj?.name||'—'}</strong> · Exportado: ${new Date().toLocaleDateString('pt-BR')}</p>
  <h2>Descrição</h2><p>${c.description||c.desc||'—'}</p>
  <h2>Decisão Tomada</h2><p>${c.doc_decision||'—'}</p>
  <h2>Artefatos Gerados</h2><p>${c.doc_artifact||'—'}</p>
  <h2>Riscos / Impedimentos</h2><p>${c.doc_risk||'—'}</p>
  <h2>Próximas Ações</h2><p>${c.doc_notes||'—'}</p>
  ${chk.length?`<h2>Checklist</h2><table><tr><th>Item</th><th>Status</th></tr>${chk.map(i=>`<tr><td>${i.text}</td><td>${i.done?'✅':'⬜'}</td></tr>`).join('')}</table>`:''}
  ${atts.length?`<h2>Anexos</h2><ul>${atts.map(a=>`<li>${a.name} (${a.type})</li>`).join('')}</ul>`:''}
  </body></html>`;

  const manifest = JSON.stringify({
    tarefa: c.title, projeto: proj?.name, exportado_em: new Date().toISOString(),
    checklist: chk, anexos: atts.map(a=>a.name),
  }, null, 2);

  // Load JSZip
  if (typeof JSZip === 'undefined') {
    const scr = document.createElement('script');
    scr.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(scr);
    await new Promise(r => { scr.onload = r; setTimeout(r, 3000); });
  }

  if (typeof JSZip === 'undefined') {
    // Fallback: só o HTML
    const blob = new Blob([docHtml], {type:'text/html'});
    const a = Object.assign(document.createElement('a'), {href:URL.createObjectURL(blob),download:'documentacao.html'});
    a.click();
    showToast('HTML exportado (instale JSZip para .zip completo)');
    return;
  }

  const zip = new JSZip();
  zip.file('manifest.json', manifest);
  zip.file('documentacao.html', docHtml);
  if (kb.length) zip.file('wiki.json', JSON.stringify(kb, null, 2));
  atts.forEach(a => { if (a.data) zip.file('anexos/' + a.name, a.data); });

  const blob = await zip.generateAsync({ type: 'blob' });
  const name = `${(proj?.name||'projeto').replace(/\s/g,'_')}_${c.title.slice(0,20).replace(/\s/g,'_')}.zip`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  showToast('📦 ZIP exportado com sucesso!', 'ok');
};

// 3.5 — Automação de recorrências
window.RecurrenceEngine = (function () {
  const KEY = 'pf_recur_v9';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch { return []; } }
  function save(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch(e) {} }

  function add(cfg) {
    const items = load();
    items.push({ id: 'rec_'+Date.now(), ...cfg, created: new Date().toISOString(), last_run: null });
    save(items);
    showToast('Tarefa recorrente salva!', 'ok');
  }

  function run() {
    const items = load();
    const now   = new Date();
    const todayStr  = now.toISOString().split('T')[0];
    const dayNames  = ['sun','mon','tue','wed','thu','fri','sat'];
    const today     = dayNames[now.getDay()];
    let count = 0;
    items.forEach(rec => {
      if (rec.last_run === todayStr) return;
      let go = false;
      if (rec.schedule === 'daily') go = true;
      else if (rec.schedule?.startsWith('weekly:')) {
        const days = rec.schedule.replace('weekly:','').split(',');
        go = days.includes(today);
      }
      if (!go) return;
      const nc = {
        id: 'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,4),
        title: rec.title + ' — ' + now.toLocaleDateString('pt-BR'),
        description: rec.description||'Tarefa recorrente automática',
        priority: rec.priority||'medium',
        bpmn:'esbocar', bpmn_status:'esbocar',
        column_id:'col-todo', col:'todo',
        project_id: PF.currentProject||PFBoard.projectId,
        is_recurring: true, position: 0,
        area: rec.area||'',
      };
      if (PFBoard.cards.length) PFBoard.cards.unshift(nc);
      else { window.mockCards = window.mockCards||[]; window.mockCards.unshift(nc); }
      rec.last_run = todayStr;
      count++;
    });
    save(items);
    if (count > 0) { renderBoard?.(); showToast(`🔄 ${count} tarefa(s) recorrente(s) criada(s)!`); }
  }

  function remove(id) { save(load().filter(x=>x.id!==id)); showToast('Recorrência removida'); }

  function openManager() {
    const items = load();
    const wrap  = document.createElement('div');
    wrap.className = 'overlay';
    wrap.style.cssText = 'display:flex!important;z-index:1100';
    wrap.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()" style="max-width:480px">
        <div class="modal-hdr">
          <div class="modal-title">🔄 Tarefas Recorrentes</div>
          <button class="modal-close" onclick="this.closest('.overlay').remove()"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg></button>
        </div>
        <div class="modal-body" style="padding:20px">
          <p style="font-size:13px;color:var(--tx-3);margin-bottom:16px">Tarefas criadas automaticamente na coluna "Planejado" conforme a frequência configurada.</p>
          <div style="margin-bottom:16px;padding:14px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--tx-3);margin-bottom:10px">+ Nova recorrência</div>
            <div class="field-row" style="margin-bottom:8px"><label class="field-label">Título</label><input class="field-input" id="rec-title" placeholder="Ex: Reunião semanal"></div>
            <div class="field-row" style="margin-bottom:8px">
              <label class="field-label">Frequência</label>
              <select class="field-input" id="rec-sched">
                <option value="daily">Todo dia</option>
                <option value="weekly:mon">Toda segunda</option>
                <option value="weekly:tue">Toda terça</option>
                <option value="weekly:wed">Toda quarta</option>
                <option value="weekly:thu">Toda quinta</option>
                <option value="weekly:fri">Toda sexta</option>
                <option value="weekly:mon,thu">Seg e Qui (2x sem)</option>
                <option value="weekly:tue,fri">Ter e Sex (2x sem)</option>
              </select>
            </div>
            <div class="field-row" style="margin-bottom:10px">
              <label class="field-label">Prioridade</label>
              <select class="field-input" id="rec-pri"><option value="low">↓ Baixa</option><option value="medium" selected>⬝ Média</option><option value="high">↑ Alta</option></select>
            </div>
            <button class="btn-primary" style="width:100%" onclick="
              const t=document.getElementById('rec-title').value.trim();
              if(!t){showToast('Informe o título',true);return;}
              RecurrenceEngine.add({title:t,schedule:document.getElementById('rec-sched').value,priority:document.getElementById('rec-pri').value});
              this.closest('.overlay').remove();RecurrenceEngine.openManager();">
              ✅ Salvar Recorrência
            </button>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--tx-3);margin-bottom:8px">Configuradas (${items.length})</div>
            ${items.map(r=>`
              <div style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd);margin-bottom:6px">
                <div style="flex:1"><div style="font-size:13px;font-weight:600">${String(r.title).replace(/</g,'&lt;')}</div><div style="font-size:11px;color:var(--tx-3)">${r.schedule} · ${r.priority}</div></div>
                <button onclick="RecurrenceEngine.remove('${r.id}');this.closest('.overlay').remove();RecurrenceEngine.openManager()" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px" title="Remover">🗑</button>
              </div>`).join('')||'<p style="font-size:13px;color:var(--tx-3)">Nenhuma recorrência configurada.</p>'}
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(run, 2500));
  return { add, run, remove, openManager };
})();

// 3.6 — Gerenciador de equipe
window.openMemberManager = function () {
  const team = window.mockTeam || [];
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.style.cssText = 'display:flex!important;z-index:1100';
  wrap.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
      <div class="modal-hdr">
        <div class="modal-title">👤 Gerenciar Equipe</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg></button>
      </div>
      <div class="modal-body" style="padding:20px">
        <p style="font-size:13px;color:var(--tx-3);margin-bottom:14px">Membros disponíveis como responsáveis nas tarefas.</p>
        <div style="padding:12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd);margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--tx-3);margin-bottom:10px">+ Novo Membro</div>
          <div class="field-row" style="margin-bottom:8px"><label class="field-label">Nome completo *</label><input class="field-input" id="mem-name" placeholder="Ex: João Silva"></div>
          <div class="field-row" style="margin-bottom:8px"><label class="field-label">Email</label><input class="field-input" id="mem-email" type="email" placeholder="joao@empresa.com"></div>
          <div class="field-grid-2" style="margin-bottom:10px">
            <div><label class="field-label">Função</label><input class="field-input" id="mem-role" placeholder="Ex: Designer"></div>
            <div><label class="field-label">Cor do avatar</label><input type="color" class="field-input" id="mem-color" value="#6c5ce7" style="height:38px;padding:3px"></div>
          </div>
          <button class="btn-primary" style="width:100%" onclick="addTeamMember();this.closest('.overlay').remove();openMemberManager()">Adicionar Membro</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${team.map(m=>`
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)">
              <div style="width:34px;height:34px;border-radius:50%;background:${m.color||'var(--ac)'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${m.initials||'?'}</div>
              <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--tx-1)">${m.name}</div><div style="font-size:11px;color:var(--tx-3)">${m.email||m.role||'—'}</div></div>
            </div>`).join('')||'<p style="font-size:13px;color:var(--tx-3)">Nenhum membro cadastrado.</p>'}
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
};

window.addTeamMember = function () {
  const name  = document.getElementById('mem-name')?.value.trim();
  const email = document.getElementById('mem-email')?.value.trim();
  const role  = document.getElementById('mem-role')?.value.trim();
  const color = document.getElementById('mem-color')?.value || '#6c5ce7';
  if (!name) { showToast('Nome é obrigatório', true); return; }
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const m = { id: 'mem_'+Date.now(), name, email, role, color, initials };
  window.mockTeam = window.mockTeam || [];
  window.mockTeam.push(m);

  // Persiste no Supabase se disponível
  if (window.PF?.supabase && !window.PF?.demoMode) {
    PF.supabase.from('profiles').upsert({ id: PF.user?.id, full_name: name }).then(()=>{});
  }
  showToast(`Membro "${name}" adicionado!`, 'ok');
};

// ════════════════════════════════════════════════════════════
//  SEÇÃO 4 — WIKI V9: rastreabilidade + formatação extra
// ════════════════════════════════════════════════════════════
(function enhanceWiki() {
  const _origRender = window.KnowledgeBase?.render;
  if (!_origRender) return;

  window.KnowledgeBase.render = function (containerId, projectId) {
    if (!projectId) { showToast('Selecione um projeto para abrir a Wiki', true); return; }
    _origRender.call(this, containerId, projectId);
    // Injeta barra de rastreabilidade
    const el  = document.getElementById(containerId);
    const tBar = document.createElement('div');
    tBar.style.cssText = 'padding:6px 16px;background:var(--ac-bg);border-bottom:1px solid var(--ac)30;font-size:12px;color:var(--ac);display:flex;align-items:center;gap:8px;';
    const proj = (window.mockProjects||[]).find(p=>p.id===projectId);
    tBar.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 1h10v10H1z"/><path d="M4 4h4M4 7h2"/></svg>
      Wiki vinculada ao projeto: <strong>${proj?.name||projectId}</strong>`;
    el?.insertBefore(tBar, el.firstChild);
  };

  // Hook save para mostrar toast
  const _origSave = window.KBStore?.setBlocks;
  if (_origSave) {
    window.KBStore.setBlocks = function (pid, blocks) {
      _origSave.call(this, pid, blocks);
      showToast('Alteração salva com êxito', 'ok');
    };
  }
})();

// ════════════════════════════════════════════════════════════
//  SEÇÃO 5 — DOC IA: rastreabilidade + correções
// ════════════════════════════════════════════════════════════
(function patchAIDoc() {
  const _origInit = window.AIDocPanel?.render;
  if (!_origInit) return;

  window.AIDocPanel.render = function (containerId, projectId) {
    if (!projectId) {
      const el = document.getElementById(containerId);
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--tx-3)">
        <div style="font-size:32px;margin-bottom:12px">🔗</div>
        <p style="font-size:14px;font-weight:700;color:var(--tx-2);margin-bottom:8px">Rastreabilidade Obrigatória</p>
        <p style="font-size:13px;line-height:1.7">Selecione um <strong>Projeto</strong> no Kanban antes de usar a Documentação IA.<br>Isso garante que todo conteúdo gerado fique atrelado ao projeto correto.</p>
      </div>`;
      return;
    }
    _origInit.call(this, containerId, projectId);
  };
})();

// ════════════════════════════════════════════════════════════
//  SEÇÃO 6 — DIAGRAMA: rastreabilidade no toolbar
// ════════════════════════════════════════════════════════════
(function patchDiagramView() {
  window.initDiagramView = async function () {
    const pid = PF.currentProject || (window.mockProjects?.[0]?.id) || null;
    if (!pid) {
      showToast('Selecione um Projeto no Kanban antes de abrir o Editor de Diagramas', true);
      return;
    }
    if (window.DiagramViewManager) await DiagramViewManager.init(pid);
  };

  window.regenDiagram = async function () {
    const pid = PF.currentProject || (window.mockProjects?.[0]?.id) || null;
    if (!pid) { showToast('Selecione um projeto primeiro', true); return; }
    if (window.DiagramViewManager) await DiagramViewManager.generate(pid);
  };
})();

// ════════════════════════════════════════════════════════════
//  SEÇÃO 7 — Dashboard toolbar patch (botão PDF e atualização)
// ════════════════════════════════════════════════════════════
(function patchDashboardBar() {
  const _origSwitch = window.switchView;
  window.switchView = function (name, btn) {
    _origSwitch && _origSwitch(name, btn);
    if (name === 'dashboard') setTimeout(renderDashboard, 100);
  };
})();

// ════════════════════════════════════════════════════════════
//  SEÇÃO 8 — Patch saveCardEdit para sempre mostrar toast
// ════════════════════════════════════════════════════════════
(function patchSaveToast() {
  // SyncManager.execute já chama showToast('Alteração salva com êxito')
  // Garantimos que o board não seja re-renderizado de forma que perca posição
  const _origExec = window.SyncManager?.execute;
  if (!_origExec) return;
  window.SyncManager.execute = async function (id, opt, persist, rollback, msg) {
    return _origExec.call(this, id, opt, persist, rollback, msg || 'Alteração salva com êxito');
  };
})();

console.log('[ProjectFlow V9] pf-v9-core.js carregado ✅');
