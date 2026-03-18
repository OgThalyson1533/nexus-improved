// ProjectFlow v5 — diagram-engine.js — COMPLETO E FUNCIONAL
'use strict';
window.DiagramEngine=(function(){
const GRID=20,MIN_Z=0.2,MAX_Z=3;
const PAL={source:{f:'#DBEAFE',s:'#2563EB',t:'#1e3a8a',lbl:'Origem'},staging:{f:'#FEF3C7',s:'#D97706',t:'#78350f',lbl:'Staging'},warehouse:{f:'#D1FAE5',s:'#059669',t:'#064e3b',lbl:'Warehouse'},transform:{f:'#EDE9FE',s:'#7C3AED',t:'#3b0764',lbl:'Transform'},output:{f:'#FCE7F3',s:'#DB2777',t:'#831843',lbl:'Saída'},api:{f:'#E0F2FE',s:'#0284C7',t:'#0c4a6e',lbl:'API'},database:{f:'#F0FDF4',s:'#16A34A',t:'#14532d',lbl:'Banco'},service:{f:'#FFF7ED',s:'#EA580C',t:'#7c2d12',lbl:'Serviço'},actor:{f:'#F5F3FF',s:'#6D28D9',t:'#2e1065',lbl:'Ator'},decision:{f:'#FFFBEB',s:'#B45309',t:'#78350f',lbl:'Decisão'},task:{f:'#F8FAFC',s:'#64748B',t:'#1e293b',lbl:'Tarefa'},custom:{f:'#F9FAFB',s:'#6B7280',t:'#111827',lbl:'Custom'}};
const BL={esbocar:'source',viabilizar:'source',atribuir:'staging',executar:'warehouse',avaliar:'transform',corrigir:'transform',validar_cliente:'output',concluido:'output'};
const LX={source:60,staging:280,warehouse:500,transform:720,output:940};
let ST={pid:null,nodes:[],edges:[],sel:new Set(),zoom:1,px:0,py:0,tool:'select',drag:null,conn:null,sbStart:null,hist:[],hIdx:-1,clip:[]};
let $svg=null,$canvas=null,_cb=null;

function init(cid,pid,cb){
  const outer=document.getElementById(cid);if(!outer)return;
  document.getElementById('dg-empty-state')?.remove();
  let inner=document.getElementById('dg-engine-root');
  if(!inner){inner=document.createElement('div');inner.id='dg-engine-root';inner.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;';outer.appendChild(inner);}
  inner.innerHTML=_html();$svg=inner.querySelector('#pfdg-svg');$canvas=inner.querySelector('#pfdg-cv');
  ST.pid=pid;_cb=cb;_css();_keys();_hist0();render();
}

function _html(){
  const T=Object.keys(PAL);
  return`<div class="pfdg"><div class="pfdg-bar">
  <div class="pfdg-g"><button class="pfdg-b" onclick="DiagramEngine.undo()" title="Ctrl+Z">↩ Desfazer</button><button class="pfdg-b" onclick="DiagramEngine.redo()" title="Ctrl+Y">↪ Refazer</button></div>
  <div class="pfdg-sep"></div>
  <div class="pfdg-g"><button class="pfdg-b pfdg-on" id="pfdg-sel" onclick="DiagramEngine.setTool('select')" title="V"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 1l8 4-4 1-1 4z"/></svg>Selecionar</button>
  <button class="pfdg-b" id="pfdg-con" onclick="DiagramEngine.setTool('connect')" title="C"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="2" cy="6" r="1.5"/><circle cx="10" cy="6" r="1.5"/><path d="M3.5 6h5"/></svg>Conectar</button></div>
  <div class="pfdg-sep"></div>
  <div class="pfdg-g" style="flex-wrap:wrap;gap:3px">${T.map(t=>`<button class="pfdg-nb" onclick="DiagramEngine.addNode('${t}')" style="background:${PAL[t].f};border-color:${PAL[t].s};color:${PAL[t].t}">${PAL[t].lbl}</button>`).join('')}</div>
  <div class="pfdg-sep"></div>
  <div class="pfdg-g"><button class="pfdg-b" onclick="DiagramEngine.autoLayout()">⚡ Layout</button><button class="pfdg-b" onclick="DiagramEngine.fitView()">⊞ Fit</button>
  <button class="pfdg-b" onclick="DiagramEngine.zoomOut()">−</button><span class="pfdg-zoom" id="pfdg-zl">100%</span><button class="pfdg-b" onclick="DiagramEngine.zoomIn()">+</button></div>
  <div class="pfdg-sep"></div>
  <div class="pfdg-g"><button class="pfdg-b pfdg-save" onclick="DiagramEngine.save()">💾 Salvar</button><button class="pfdg-b" onclick="DiagramEngine.exportSVG()">↓SVG</button><button class="pfdg-b" onclick="DiagramEngine.exportPNG()">↓PNG</button></div>
</div>
<div class="pfdg-body">
  <div class="pfdg-pal">${T.map(t=>`<div class="pfdg-pi" draggable="true" ondragstart="DiagramEngine._ds(event,'${t}')" onclick="DiagramEngine.addNode('${t}')" title="${PAL[t].lbl}"><div class="pfdg-pp" style="background:${PAL[t].f};border-color:${PAL[t].s}">${_thm(t)}</div><span>${PAL[t].lbl}</span></div>`).join('')}</div>
  <div class="pfdg-cw" ondragover="event.preventDefault()" ondrop="DiagramEngine._drop(event)">
    <svg id="pfdg-svg" class="pfdg-svg" xmlns="http://www.w3.org/2000/svg"
      onmousedown="DiagramEngine._smd(event)" onmousemove="DiagramEngine._smm(event)"
      onmouseup="DiagramEngine._smu(event)" onwheel="DiagramEngine._wheel(event)" ondblclick="DiagramEngine._sdbl(event)">
      <defs>
        <pattern id="pfdg-grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><path d="M ${GRID} 0 L 0 0 0 ${GRID}" fill="none" stroke="var(--bd)" stroke-width=".5" opacity=".5"/></pattern>
        <marker id="pfdg-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0L0,6L7,3z" fill="var(--tx-3)"/></marker>
        <marker id="pfdg-arrs" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0L0,6L7,3z" fill="var(--ac)"/></marker>
        <filter id="pfdg-sh"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity=".1"/></filter>
        <filter id="pfdg-shs"><feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="var(--ac)" flood-opacity=".35"/></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#pfdg-grid)"/>
      <g id="pfdg-cv"><g id="pfdg-el"></g><g id="pfdg-nl"></g>
        <line id="pfdg-cl" style="display:none;pointer-events:none" stroke="var(--ac)" stroke-width="1.5" stroke-dasharray="5,3"/>
        <rect id="pfdg-sb" style="display:none;pointer-events:none" fill="rgba(73,97,204,.06)" stroke="var(--ac)" stroke-width="1" stroke-dasharray="3,2"/>
      </g>
    </svg>
  </div>
  <div class="pfdg-props" id="pfdg-props"><div class="pfdg-pt">Propriedades</div><div id="pfdg-pc"><p class="pfdg-hint">Selecione um elemento para editar suas propriedades</p></div></div>
</div>
<div class="pfdg-status"><span id="pfdg-sn">0 nós</span>·<span id="pfdg-se">0 conexões</span>·<span id="pfdg-ss">Nada selecionado</span><div style="flex:1"></div><span id="pfdg-sp">x:0 y:0</span>·<span class="pfdg-hint">V=sel · C=conectar · Dbl=criar · Del=excluir · Ctrl+Z/Y · Scroll=zoom</span></div></div>`;
}

function _thm(t){const c=PAL[t].f,s=PAL[t].s;
  if(t==='decision')return`<svg viewBox="0 0 42 22" width="42"><polygon points="21,2 40,11 21,20 2,11" fill="${c}" stroke="${s}" stroke-width="1.5"/></svg>`;
  if(t==='actor')return`<svg viewBox="0 0 42 22" width="42"><ellipse cx="21" cy="11" rx="15" ry="8" fill="${c}" stroke="${s}" stroke-width="1.5"/></svg>`;
  if(t==='database')return`<svg viewBox="0 0 42 22" width="42"><ellipse cx="21" cy="5" rx="15" ry="4" fill="${c}" stroke="${s}" stroke-width="1.2"/><rect x="6" y="5" width="30" height="12" fill="${c}" stroke="none"/><line x1="6" y1="5" x2="6" y2="17" stroke="${s}" stroke-width="1.2"/><line x1="36" y1="5" x2="36" y2="17" stroke="${s}" stroke-width="1.2"/><ellipse cx="21" cy="17" rx="15" ry="4" fill="${c}" stroke="${s}" stroke-width="1.2"/></svg>`;
  if(t==='output')return`<svg viewBox="0 0 42 22" width="42"><rect x="2" y="4" width="38" height="14" rx="7" fill="${c}" stroke="${s}" stroke-width="1.5"/></svg>`;
  return`<svg viewBox="0 0 42 22" width="42"><rect x="2" y="4" width="38" height="14" rx="3" fill="${c}" stroke="${s}" stroke-width="1.5"/></svg>`;
}

function render(){
  if(!$svg||!$canvas)return;
  $canvas.setAttribute('transform',`translate(${ST.px},${ST.py}) scale(${ST.zoom})`);
  const el=document.getElementById('pfdg-el');if(el)el.innerHTML=ST.edges.map(_re).join('');
  const nl=document.getElementById('pfdg-nl');if(nl)nl.innerHTML=ST.nodes.map(_rn).join('');
  const zl=document.getElementById('pfdg-zl');if(zl)zl.textContent=Math.round(ST.zoom*100)+'%';
  _st();
}

function _rn(n){
  const sel=ST.sel.has(n.id);const c=PAL[n.type]||PAL.custom;
  const f=n.fill||c.f,s=n.stroke||c.s,t=n.textColor||c.t;
  const sw=sel?2.5:1.5,sc=sel?'var(--ac)':s,flt=sel?'url(#pfdg-shs)':'url(#pfdg-sh)';
  const{x,y,w,h}=n;let shp='';
  if(n.type==='decision'){const mx=x+w/2,my=y+h/2;shp=`<polygon points="${mx},${y} ${x+w},${my} ${mx},${y+h} ${x},${my}" fill="${f}" stroke="${sc}" stroke-width="${sw}" filter="${flt}"/>`;}
  else if(n.type==='actor'){shp=`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${Math.min(w,h)/2.2}" ry="${h/2.2}" fill="${f}" stroke="${sc}" stroke-width="${sw}" filter="${flt}"/>`;}
  else if(n.type==='database'){const ry=7;shp=`<ellipse cx="${x+w/2}" cy="${y+ry}" rx="${w/2}" ry="${ry}" fill="${f}" stroke="${sc}" stroke-width="${sw}"/><rect x="${x}" y="${y+ry}" width="${w}" height="${h-ry*2}" fill="${f}" stroke="none"/><line x1="${x}" y1="${y+ry}" x2="${x}" y2="${y+h-ry}" stroke="${sc}" stroke-width="${sw}"/><line x1="${x+w}" y1="${y+ry}" x2="${x+w}" y2="${y+h-ry}" stroke="${sc}" stroke-width="${sw}"/><ellipse cx="${x+w/2}" cy="${y+h-ry}" rx="${w/2}" ry="${ry}" fill="${f}" stroke="${sc}" stroke-width="${sw}" filter="${flt}"/>`;}
  else if(n.type==='output'){shp=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="${f}" stroke="${sc}" stroke-width="${sw}" filter="${flt}"/>`;}
  else{shp=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${f}" stroke="${sc}" stroke-width="${sw}" filter="${flt}"/>`;}
  if(n.type==='warehouse')shp+=`<rect x="${x+4}" y="${y+4}" width="${w-8}" height="${h-8}" rx="4" fill="none" stroke="${sc}" stroke-width=".8" opacity=".4"/>`;
  const fs=n.fontSize||12,fw=n.bold?'700':'500',fi=n.italic?'italic':'normal';
  const ls=_wrap(n.label||'',Math.floor(w/(fs*.62)));
  const lh=fs*1.4,th=ls.length*lh,ty=(y+h/2)-(th/2)+fs*.55+(n.type==='database'?4:0);
  const txt=ls.map((l,i)=>`<text x="${x+w/2}" y="${ty+i*lh}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="${fw}" font-style="${fi}" fill="${t}" font-family="var(--font,system-ui)" pointer-events="none">${_e(l)}</text>`).join('');
  const handles=sel?ls8(n):'';
  const ancs=`<g class="pfdg-ancs">${_ancs(n,s)}</g>`;
  return`<g class="pfdg-n" data-id="${n.id}" onmousedown="DiagramEngine._nmd(event,'${n.id}')" onmouseenter="this.querySelector('.pfdg-ancs').style.opacity=1" onmouseleave="this.querySelector('.pfdg-ancs').style.opacity=0" ondblclick="DiagramEngine._ndbl(event,'${n.id}')" style="cursor:${ST.tool==='connect'?'crosshair':'move'}">${shp}${txt}${handles}${ancs}</g>`;
}

function ls8(n){const{x,y,w,h}=n;return[[x,y,'nw'],[x+w/2,y,'n'],[x+w,y,'ne'],[x,y+h/2,'w'],[x+w,y+h/2,'e'],[x,y+h,'sw'],[x+w/2,y+h,'s'],[x+w,y+h,'se']].map(([cx,cy,id])=>`<rect x="${cx-5}" y="${cy-5}" width="10" height="10" rx="2" fill="var(--bg-1)" stroke="var(--ac)" stroke-width="2" class="pfdg-rh" data-n="${n.id}" data-h="${id}" onmousedown="DiagramEngine._rhmd(event,'${n.id}','${id}')" style="cursor:${id}-resize"/>`).join('');}

function _ancs(n,stroke){const{x,y,w,h}=n;return[[x+w/2,y,'n'],[x+w,y+h/2,'e'],[x+w/2,y+h,'s'],[x,y+h/2,'w']].map(([cx,cy,a])=>`<circle cx="${cx}" cy="${cy}" r="6" fill="var(--bg-1)" stroke="${stroke}" stroke-width="2.5" class="pfdg-anc" data-n="${n.id}" data-a="${a}" onmousedown="DiagramEngine._amd(event,'${n.id}','${a}')" style="cursor:crosshair"/>`).join('');}

function _re(e){
  const fn=ST.nodes.find(n=>n.id===e.from),tn=ST.nodes.find(n=>n.id===e.to);if(!fn||!tn)return'';
  const sel=ST.sel.has(e.id);
  const fa=e.fromAnchor||_ba(fn,tn),ta=e.toAnchor||_ba(tn,fn);
  const p1=_ap(fn,fa),p2=_ap(tn,ta);
  const dx=p2.x-p1.x,dy=p2.y-p1.y,c1x=p1.x+dx*.4,c1y=p1.y,c2x=p2.x-dx*.4,c2y=p2.y;
  const sc=sel?'var(--ac)':(e.color||'var(--tx-3)'),sw=sel?2.5:1.5;
  const dash=e.style==='dashed'?'stroke-dasharray="7,4"':e.style==='dotted'?'stroke-dasharray="2,4"':'';
  const mx=(p1.x+p2.x)/2,my=(p1.y+p2.y)/2-14;
  const lbl=e.label?`<text x="${mx}" y="${my}" text-anchor="middle" font-size="11" fill="${sc}" font-family="var(--font,system-ui)" pointer-events="none">${_e(e.label)}</text>`:'';
  return`<g class="pfdg-eg" data-id="${e.id}"><path d="M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}" fill="none" stroke="transparent" stroke-width="12" onmousedown="DiagramEngine._emd(event,'${e.id}')" ondblclick="DiagramEngine._edbl(event,'${e.id}')" style="cursor:pointer"/><path d="M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}" fill="none" stroke="${sc}" stroke-width="${sw}" ${dash} marker-end="url(#${sel?'pfdg-arrs':'pfdg-arr'})" pointer-events="none"/>${lbl}</g>`;
}

function _ap(n,a){const{x,y,w,h}=n;const m={n:{x:x+w/2,y},e:{x:x+w,y:y+h/2},s:{x:x+w/2,y:y+h},w:{x,y:y+h/2}};return m[a]||{x:x+w/2,y:y+h/2};}
function _ba(a,b){const dx=b.x+b.w/2-(a.x+a.w/2),dy=b.y+b.h/2-(a.y+a.h/2);return Math.abs(dx)>Math.abs(dy)?dx>0?'e':'w':dy>0?'s':'n';}

let _keysbound=false;
function _keys(){if(_keysbound)return;_keysbound=true;document.addEventListener('keydown',e=>{
  const inp=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(inp)return;
  if((e.key==='Delete'||e.key==='Backspace')&&ST.sel.size){_hist0();_del();}
  if(e.key==='v'&&!e.ctrlKey)setTool('select');
  if(e.key==='c'&&!e.ctrlKey&&!e.metaKey)setTool('connect');
  if(e.key==='Escape'){ST.sel.clear();ST.conn=null;_hcl();render();_props();}
  if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||e.key==='Y')){e.preventDefault();redo();}
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save();}
  if((e.ctrlKey||e.metaKey)&&e.key==='a'){e.preventDefault();ST.nodes.forEach(n=>ST.sel.add(n.id));render();_props();}
  if((e.ctrlKey||e.metaKey)&&e.key==='c'&&ST.sel.size){ST.clip=ST.nodes.filter(n=>ST.sel.has(n.id)).map(n=>({...n}));}
  if((e.ctrlKey||e.metaKey)&&e.key==='v'){_paste();}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&ST.sel.size){
    e.preventDefault();const d=e.shiftKey?10:1;const dx=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,dy=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;
    _hist0();ST.nodes.filter(n=>ST.sel.has(n.id)).forEach(n=>{n.x+=dx;n.y+=dy;});render();}
});}

function _spt(e){const r=$svg.getBoundingClientRect();return{x:(e.clientX-r.left-ST.px)/ST.zoom,y:(e.clientY-r.top-ST.py)/ST.zoom};}
function _snap(v){return Math.round(v/GRID)*GRID;}

function _smd(e){
  if(e.target.closest('.pfdg-n')||e.target.closest('.pfdg-eg')||e.target.closest('.pfdg-rh')||e.target.closest('.pfdg-anc'))return;
  if(e.button!==0)return;
  const pt=_spt(e);
  if(e.ctrlKey||e.metaKey){ST.drag={type:'pan',sx:e.clientX-ST.px,sy:e.clientY-ST.py};return;}
  if(ST.conn){ST.conn=null;_hcl();return;}
  ST.sel.clear();ST.sbStart=pt;render();_props();
}
function _smm(e){
  const pt=_spt(e);const sp=document.getElementById('pfdg-sp');if(sp)sp.textContent=`x:${Math.round(pt.x)} y:${Math.round(pt.y)}`;
  if(ST.drag?.type==='pan'){ST.px=e.clientX-ST.drag.sx;ST.py=e.clientY-ST.drag.sy;render();return;}
  if(ST.drag?.type==='node'){const dx=(e.clientX-ST.drag.cx)/ST.zoom,dy=(e.clientY-ST.drag.cy)/ST.zoom;ST.nodes.filter(n=>ST.sel.has(n.id)).forEach(n=>{const o=ST.drag.orig[n.id];if(!o)return;n.x=_snap(o.x+dx);n.y=_snap(o.y+dy);});render();return;}
  if(ST.drag?.type==='resize'){const n=ST.nodes.find(x=>x.id===ST.drag.nid);if(!n)return;const dx=pt.x-ST.drag.ox,dy=pt.y-ST.drag.oy,h=ST.drag.h,on=ST.drag.on;if(h.includes('e'))n.w=Math.max(50,on.w+dx);if(h.includes('s'))n.h=Math.max(28,on.h+dy);if(h.includes('w')){n.x=_snap(on.x+dx);n.w=Math.max(50,on.w-dx);}if(h.includes('n')){n.y=_snap(on.y+dy);n.h=Math.max(28,on.h-dy);}render();return;}
  if(ST.sbStart){const sb=document.getElementById('pfdg-sb');if(sb){const rx=Math.min(ST.sbStart.x,pt.x),ry=Math.min(ST.sbStart.y,pt.y),rw=Math.abs(pt.x-ST.sbStart.x),rh=Math.abs(pt.y-ST.sbStart.y);sb.setAttribute('x',rx);sb.setAttribute('y',ry);sb.setAttribute('width',rw);sb.setAttribute('height',rh);sb.style.display='';}return;}
  if(ST.conn){const cl=document.getElementById('pfdg-cl');if(cl){const fp=ST.conn.pt;cl.setAttribute('x1',fp.x);cl.setAttribute('y1',fp.y);cl.setAttribute('x2',pt.x);cl.setAttribute('y2',pt.y);cl.style.display='';}}
}
function _smu(e){
  if(ST.sbStart){const pt=_spt(e);const rx=Math.min(ST.sbStart.x,pt.x),ry=Math.min(ST.sbStart.y,pt.y),rw=Math.abs(pt.x-ST.sbStart.x),rh=Math.abs(pt.y-ST.sbStart.y);if(rw>4&&rh>4)ST.nodes.forEach(n=>{if(n.x+n.w>rx&&n.x<rx+rw&&n.y+n.h>ry&&n.y<ry+rh)ST.sel.add(n.id);});const sb=document.getElementById('pfdg-sb');if(sb)sb.style.display='none';ST.sbStart=null;render();_props();return;}
  if(ST.drag?.type==='node'||ST.drag?.type==='resize')_notify();ST.drag=null;
}
function _wheel(e){e.preventDefault();const f=e.deltaY<0?1.12:.9;const r=$svg.getBoundingClientRect();const cx=e.clientX-r.left,cy=e.clientY-r.top;const nz=Math.max(MIN_Z,Math.min(MAX_Z,ST.zoom*f));ST.px=cx-(cx-ST.px)*(nz/ST.zoom);ST.py=cy-(cy-ST.py)*(nz/ST.zoom);ST.zoom=nz;render();}
function _sdbl(e){if(e.target.closest('.pfdg-n')||e.target.closest('.pfdg-eg'))return;const pt=_spt(e);addNode('custom',_snap(pt.x-80),_snap(pt.y-30));}

function _nmd(e,id){
  e.stopPropagation();if(e.target.classList.contains('pfdg-anc')||e.target.classList.contains('pfdg-rh'))return;
  if(ST.conn){if(ST.conn.nid!==id){_hist0();const tn=ST.nodes.find(n=>n.id===id);const fa=ST.conn.anc||'e',ta=_ba(tn,ST.nodes.find(n=>n.id===ST.conn.nid));ST.edges.push({id:'e_'+Date.now(),from:ST.conn.nid,to:id,fromAnchor:fa,toAnchor:ta,label:'',style:'solid',color:''});ST.conn=null;_hcl();setTool('select');render();_notify();}return;}
  if(!e.shiftKey&&!ST.sel.has(id))ST.sel.clear();ST.sel.add(id);_hist0();ST.drag={type:'node',cx:e.clientX,cy:e.clientY,orig:{}};ST.nodes.filter(n=>ST.sel.has(n.id)).forEach(n=>{ST.drag.orig[n.id]={x:n.x,y:n.y};});render();_props();
}
async function _ndbl(e,id){e.stopPropagation();const n=ST.nodes.find(x=>x.id===id);if(!n)return;const lbl=await PFModal.prompt({title:'Editar nó',label:'Label',value:n.label||''});if(lbl!==null){_hist0();n.label=lbl;render();_notify();}}
function _amd(e,nid,anc){e.stopPropagation();setTool('connect');const n=ST.nodes.find(x=>x.id===nid);ST.conn={nid,anc,pt:_ap(n,anc)};}
function _rhmd(e,nid,h){e.stopPropagation();e.preventDefault();const n=ST.nodes.find(x=>x.id===nid);if(!n)return;ST.drag={type:'resize',nid,h,ox:_spt(e).x,oy:_spt(e).y,on:{...n}};_hist0();}
function _emd(e,eid){e.stopPropagation();if(!e.shiftKey)ST.sel.clear();ST.sel.add(eid);render();_props();}
async function _edbl(e,eid){e.stopPropagation();const ed=ST.edges.find(x=>x.id===eid);if(!ed)return;const lbl=await PFModal.prompt({title:'Label da conexão',label:'Label',value:ed.label||''});if(lbl!==null){_hist0();ed.label=lbl;render();_notify();}}
function _ds(e,t){e.dataTransfer.setData('pfdg-t',t);}
function _drop(e){e.preventDefault();const t=e.dataTransfer.getData('pfdg-t');if(!t)return;const r=$svg.getBoundingClientRect();addNode(t,_snap((e.clientX-r.left-ST.px)/ST.zoom-80),_snap((e.clientY-r.top-ST.py)/ST.zoom-30));}
function _hcl(){const cl=document.getElementById('pfdg-cl');if(cl)cl.style.display='none';}

function addNode(type,x,y){
  if(x==null){const cx=($svg?.clientWidth||700)/2,cy=($svg?.clientHeight||450)/2;x=_snap((cx-ST.px)/ST.zoom-80);y=_snap((cy-ST.py)/ST.zoom-30);}
  _hist0();const c=PAL[type]||PAL.custom;const n={id:'n_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type,label:c.lbl,x:_snap(x),y:_snap(y),w:type==='decision'?140:type==='actor'?80:160,h:type==='decision'?80:type==='actor'?80:60,fill:'',stroke:'',textColor:'',fontSize:12,bold:false,italic:false};
  ST.nodes.push(n);ST.sel.clear();ST.sel.add(n.id);render();_props();_notify();return n;
}
function _del(){ST.nodes=ST.nodes.filter(n=>!ST.sel.has(n.id));ST.edges=ST.edges.filter(e=>!ST.sel.has(e.id)&&!ST.sel.has(e.from)&&!ST.sel.has(e.to));ST.sel.clear();render();_props();_notify();}
function setTool(t){ST.tool=t;if(t==='select'){ST.conn=null;_hcl();}document.getElementById('pfdg-sel')?.classList.toggle('pfdg-on',t==='select');document.getElementById('pfdg-con')?.classList.toggle('pfdg-on',t==='connect');if($svg)$svg.style.cursor=t==='connect'?'crosshair':'default';}
function autoLayout(){if(!ST.nodes.length)return;_hist0();const ord=['source','staging','warehouse','transform','output','api','service','database','actor','decision','task','custom'];const byL={};ST.nodes.forEach(n=>{const l=ord.indexOf(n.type);(byL[l]=byL[l]||[]).push(n);});Object.entries(byL).sort((a,b)=>+a[0]-+b[0]).forEach(([,ns],ci)=>ns.forEach((n,ri)=>{n.x=_snap(60+ci*200);n.y=_snap(60+ri*100);}));render();_notify();}
function fitView(){
  if(!ST.nodes.length){ST.zoom=1;ST.px=0;ST.py=0;render();return;}
  const minX=Math.min(...ST.nodes.map(n=>n.x))-40,minY=Math.min(...ST.nodes.map(n=>n.y))-40;
  const maxX=Math.max(...ST.nodes.map(n=>n.x+n.w))+40,maxY=Math.max(...ST.nodes.map(n=>n.y+n.h))+40;
  const W=$svg&&$svg.clientWidth>10?$svg.clientWidth:900;
  const H=$svg&&$svg.clientHeight>10?$svg.clientHeight:520;
  const nz=Math.max(MIN_Z,Math.min(MAX_Z,Math.min(W/(maxX-minX),H/(maxY-minY))*.88));
  ST.zoom=nz;ST.px=(W-(maxX-minX)*nz)/2-minX*nz;ST.py=(H-(maxY-minY)*nz)/2-minY*nz;render();
}
function zoomIn(){ST.zoom=Math.min(MAX_Z,ST.zoom*1.2);render();}
function zoomOut(){ST.zoom=Math.max(MIN_Z,ST.zoom/1.2);render();}

function _props(){const p=document.getElementById('pfdg-pc');if(!p)return;if(!ST.sel.size){p.innerHTML='<p class="pfdg-hint">Selecione um elemento para editar suas propriedades</p>';return;}if(ST.sel.size>1){p.innerHTML=`<p class="pfdg-hint">${ST.sel.size} selecionados</p><button class="pfdg-dbtn" onclick="DiagramEngine._hist0();DiagramEngine._del()">🗑 Excluir seleção</button>`;return;}
  const sid=[...ST.sel][0];const n=ST.nodes.find(x=>x.id===sid);const ed=ST.edges.find(x=>x.id===sid);
  if(n){const f=n.fill||PAL[n.type]?.f||'#fff',s=n.stroke||PAL[n.type]?.s||'#666',tc=n.textColor||PAL[n.type]?.t||'#000';
    p.innerHTML=`<div class="pfdg-pg"><label class="pfdg-pl">Label</label><input class="pfdg-pi" value="${_e(n.label||'')}" oninput="DiagramEngine._pc('label',this.value)"></div>
    <div class="pfdg-pg"><label class="pfdg-pl">Tipo</label><select class="pfdg-pi" onchange="DiagramEngine._pc('type',this.value)">${Object.keys(PAL).map(t=>`<option value="${t}"${t===n.type?' selected':''}>${PAL[t].lbl}</option>`).join('')}</select></div>
    <div class="pfdg-pg" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><div><label class="pfdg-pl">Fundo</label><input type="color" class="pfdg-pi pfdg-col" value="${f}" onchange="DiagramEngine._pc('fill',this.value)"></div><div><label class="pfdg-pl">Borda</label><input type="color" class="pfdg-pi pfdg-col" value="${s}" onchange="DiagramEngine._pc('stroke',this.value)"></div><div><label class="pfdg-pl">Texto</label><input type="color" class="pfdg-pi pfdg-col" value="${tc}" onchange="DiagramEngine._pc('textColor',this.value)"></div></div>
    <div class="pfdg-pg"><label class="pfdg-pl">Fonte (px)</label><input type="number" class="pfdg-pi" value="${n.fontSize||12}" min="8" max="40" onchange="DiagramEngine._pc('fontSize',+this.value)"></div>
    <div class="pfdg-pg" style="display:flex;gap:12px"><label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" ${n.bold?'checked':''} onchange="DiagramEngine._pc('bold',this.checked)"><b>B</b></label><label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" ${n.italic?'checked':''} onchange="DiagramEngine._pc('italic',this.checked)"><i>I</i></label></div>
    <div class="pfdg-pg" style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label class="pfdg-pl">W</label><input type="number" class="pfdg-pi" value="${Math.round(n.w)}" min="40" onchange="DiagramEngine._pc('w',+this.value)"></div><div><label class="pfdg-pl">H</label><input type="number" class="pfdg-pi" value="${Math.round(n.h)}" min="24" onchange="DiagramEngine._pc('h',+this.value)"></div></div>
    <button class="pfdg-dbtn" onclick="DiagramEngine._hist0();DiagramEngine._del()">🗑 Excluir nó</button>`;}
  else if(ed){p.innerHTML=`<div class="pfdg-pg"><label class="pfdg-pl">Label</label><input class="pfdg-pi" value="${_e(ed.label||'')}" oninput="DiagramEngine._epc('label',this.value,'${ed.id}')"></div>
    <div class="pfdg-pg"><label class="pfdg-pl">Estilo da linha</label><select class="pfdg-pi" onchange="DiagramEngine._epc('style',this.value,'${ed.id}')"><option value="solid"${ed.style==='solid'?' selected':''}>Sólida</option><option value="dashed"${ed.style==='dashed'?' selected':''}>Tracejada</option><option value="dotted"${ed.style==='dotted'?' selected':''}>Pontilhada</option></select></div>
    <div class="pfdg-pg"><label class="pfdg-pl">Cor</label><input type="color" class="pfdg-pi pfdg-col" value="${ed.color||'#9ca3af'}" onchange="DiagramEngine._epc('color',this.value,'${ed.id}')"></div>
    <button class="pfdg-dbtn" onclick="DiagramEngine._hist0();DiagramEngine._del()">🗑 Excluir conexão</button>`;}
}
function _pc(k,v){const sid=[...ST.sel][0];const n=ST.nodes.find(x=>x.id===sid);if(!n)return;n[k]=v;if(k==='type'){n.fill='';n.stroke='';n.textColor='';}render();_notify();}
function _epc(k,v,eid){const e=ST.edges.find(x=>x.id===eid);if(!e)return;e[k]=v;render();_notify();}

function _hist0(){const snap=JSON.stringify({nodes:ST.nodes,edges:ST.edges});ST.hist=ST.hist.slice(0,ST.hIdx+1);ST.hist.push(snap);ST.hIdx=ST.hist.length-1;if(ST.hist.length>60){ST.hist.shift();ST.hIdx--;}}
function undo(){if(ST.hIdx<=0)return;ST.hIdx--;const s=JSON.parse(ST.hist[ST.hIdx]);ST.nodes=s.nodes;ST.edges=s.edges;ST.sel.clear();render();_props();}
function redo(){if(ST.hIdx>=ST.hist.length-1)return;ST.hIdx++;const s=JSON.parse(ST.hist[ST.hIdx]);ST.nodes=s.nodes;ST.edges=s.edges;ST.sel.clear();render();_props();}
function _paste(){if(!ST.clip.length)return;_hist0();ST.sel.clear();ST.clip.forEach(o=>{const n={...o,id:'n_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),x:o.x+24,y:o.y+24};ST.nodes.push(n);ST.sel.add(n.id);});render();_props();_notify();}

function _st(){const sn=document.getElementById('pfdg-sn'),se=document.getElementById('pfdg-se'),ss=document.getElementById('pfdg-ss');if(sn)sn.textContent=ST.nodes.length+' nós';if(se)se.textContent=ST.edges.length+' conexões';if(ss)ss.textContent=ST.sel.size?ST.sel.size+' sel.':'Nada selecionado';}

async function save(){
  if(!ST.pid){showToast('Nenhum projeto ativo',true);return;}
  const data=getData();try{localStorage.setItem('pf_dg_'+ST.pid,JSON.stringify(data));}catch(e){}
  if(window.PF?.supabase&&!window.PF?.demoMode){
    const{data:ex}=await PF.supabase.from('project_diagrams').select('id').eq('project_id',ST.pid).eq('is_current',true).limit(1);
    if(ex?.length){await PF.supabase.from('project_diagrams').update({content_json:data}).eq('id',ex[0].id);}
    else{await PF.supabase.from('project_diagrams').insert({project_id:ST.pid,name:'Diagrama Principal',is_current:true,content_json:data,generated_from:'manual'});}
  }
  showToast('Diagrama salvo!');
}

function load(pid,data){ST.pid=pid;if(data){ST.nodes=data.nodes||[];ST.edges=data.edges||[];ST.zoom=data.zoom||1;ST.px=data.panX||0;ST.py=data.panY||0;}else{try{const s=localStorage.getItem('pf_dg_'+pid);if(s){const d=JSON.parse(s);ST.nodes=d.nodes||[];ST.edges=d.edges||[];ST.zoom=d.zoom||1;ST.px=d.panX||0;ST.py=d.panY||0;}else{ST.nodes=[];ST.edges=[];}}catch(e){ST.nodes=[];ST.edges=[];}}ST.sel.clear();ST.hist=[];ST.hIdx=-1;_hist0();if($svg){render();setTimeout(()=>{if(ST.nodes.length)fitView();},80);}else{setTimeout(()=>{render();if(ST.nodes.length)fitView();},120);}}

function getData(){return{nodes:ST.nodes,edges:ST.edges,zoom:ST.zoom,panX:ST.px,panY:ST.py};}
function getState(){return ST;}

function generateFromProject(pid,cards){
  _hist0();ST.nodes=[];ST.edges=[];ST.pid=pid;
  const layerCnt={};const layerNids={};
  const activeLayers=[...new Set(cards.map(c=>BL[c.bpmn||c.bpmn_status||'esbocar']||'source'))];
  activeLayers.forEach(layer=>{const c=PAL[layer]||PAL.custom;const n={id:'lyr_'+layer,type:layer,label:c.lbl,x:LX[layer]||60,y:60,w:160,h:60,fill:c.f,stroke:c.s,textColor:c.t,fontSize:13,bold:true,italic:false};ST.nodes.push(n);layerNids[layer]=n.id;layerCnt[layer]=0;});
  const ord=['source','staging','warehouse','transform','output'];
  for(let i=0;i<ord.length-1;i++){const a=layerNids[ord[i]],b=layerNids[ord[i+1]];if(a&&b)ST.edges.push({id:'le_'+i,from:a,to:b,fromAnchor:'e',toAnchor:'w',label:'',style:'solid',color:''});}
  cards.slice(0,30).forEach((card,i)=>{
    const layer=BL[card.bpmn||card.bpmn_status||'esbocar']||'source';
    const lc=layerCnt[layer]||0;layerCnt[layer]=(lc||0)+1;
    const isDone=(card.bpmn||card.bpmn_status)==='concluido';
    const isExec=(card.bpmn||card.bpmn_status)==='executar';
    const n={id:'t_'+card.id,type:'task',
      label:card.title.slice(0,26)+(card.title.length>26?'…':''),
      x:(LX[layer]||60)+200,y:60+lc*88,w:168,h:52,
      fill:isDone?'#D1FAE5':isExec?'#FFFBEB':'',
      stroke:isDone?'#059669':isExec?'#C48A0A':'',
      textColor:'',fontSize:11,bold:false,italic:false};
    ST.nodes.push(n);
    if(layerNids[layer])ST.edges.push({id:'te_'+i,from:layerNids[layer],to:n.id,fromAnchor:'e',toAnchor:'w',label:'',style:'dashed',color:''});
  });
  const proj=(window.mockProjects||[]).find(p=>p.id===pid);if(proj){const pn={id:'prj_h',type:'custom',label:proj.name,x:-190,y:60,w:162,h:60,fill:proj.color+'22',stroke:proj.color,textColor:proj.color,fontSize:13,bold:true,italic:false};ST.nodes.unshift(pn);if(layerNids['source'])ST.edges.push({id:'ph_e',from:'prj_h',to:layerNids['source'],fromAnchor:'e',toAnchor:'w',label:'inicia',style:'solid',color:proj.color});}
  render();setTimeout(()=>fitView(),80);_notify();
}

function exportSVG(){const clone=$svg.cloneNode(true);clone.querySelector('#pfdg-gbg')?.remove();clone.querySelectorAll('.pfdg-rh,.pfdg-anc,.pfdg-cl,.pfdg-sb,.pfdg-ancs').forEach(e=>e.remove());const xml=new XMLSerializer().serializeToString(clone);const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'})),download:'diagrama.svg'});a.click();}
function exportPNG(){const c=document.createElement('canvas');const sc=2;c.width=$svg.clientWidth*sc;c.height=$svg.clientHeight*sc;const ctx=c.getContext('2d');const img=new Image();img.onload=()=>{ctx.fillStyle=document.documentElement.getAttribute('data-theme')==='dark'?'#161615':'#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);const a=Object.assign(document.createElement('a'),{href:c.toDataURL('image/png'),download:'diagrama.png'});a.click();};img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString($svg))));}

function _wrap(text,max){if(!text)return[''];if(text.length<=max)return[text];const ws=text.split(' ');const ls=[];let l='';ws.forEach(w=>{if((l+' '+w).trim().length>max){if(l)ls.push(l);l=w;}else{l=(l?l+' ':'')+w;}});if(l)ls.push(l);return ls.length?ls:[text.slice(0,max)];}
function _e(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _notify(){if(_cb)_cb(getData());}

function _css(){if(document.getElementById('pfdg-styles'))return;const s=document.createElement('style');s.id='pfdg-styles';
s.textContent=`.pfdg{display:flex;flex-direction:column;height:100%;background:var(--bg-0);font-size:13px;}.pfdg-bar{display:flex;align-items:center;gap:3px;padding:5px 10px;background:var(--bg-1);border-bottom:1px solid var(--bd);flex-wrap:wrap;flex-shrink:0;transition:background var(--t),border-color var(--t);}.pfdg-g{display:flex;align-items:center;gap:2px;}.pfdg-sep{width:1px;height:22px;background:var(--bd);margin:0 4px;flex-shrink:0;}.pfdg-b{display:flex;align-items:center;gap:3px;padding:5px 8px;border-radius:var(--r-s);font-size:12px;color:var(--tx-2);background:none;border:1px solid transparent;cursor:pointer;white-space:nowrap;transition:all var(--t);}.pfdg-b:hover{background:var(--bg-2);border-color:var(--bd);color:var(--tx-1);}.pfdg-b svg{width:12px;height:12px;}.pfdg-on{background:var(--ac-bg)!important;color:var(--ac)!important;border-color:var(--ac)!important;}.pfdg-save{background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important;}.pfdg-nb{padding:3px 7px;border-radius:var(--r-f);font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid;transition:opacity var(--t);}.pfdg-nb:hover{opacity:.75;}.pfdg-zoom{font-size:11px;font-family:var(--mono);color:var(--tx-2);min-width:36px;text-align:center;}.pfdg-body{display:flex;flex:1;overflow:hidden;}.pfdg-pal{width:70px;background:var(--bg-1);border-right:1px solid var(--bd);padding:7px 4px;overflow-y:auto;flex-shrink:0;}.pfdg-pt{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:6px;text-align:center;}.pfdg-pi-item,.pfdg-pi{display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px;border-radius:var(--r-s);cursor:grab;border:1px solid transparent;transition:all var(--t);margin-bottom:3px;}.pfdg-pi:hover{background:var(--bg-2);border-color:var(--bd);}.pfdg-pi span{font-size:8px;color:var(--tx-3);text-align:center;}.pfdg-pp{width:50px;height:24px;border:1.5px solid;border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden;}.pfdg-cw{flex:1;overflow:hidden;position:relative;}.pfdg-svg{width:100%;height:100%;display:block;cursor:default;}.pfdg-props{width:204px;background:var(--bg-1);border-left:1px solid var(--bd);padding:10px;overflow-y:auto;flex-shrink:0;transition:background var(--t),border-color var(--t);}.pfdg-pg{margin-bottom:10px;}.pfdg-pl{display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px;}.pfdg-pi{width:100%;padding:5px 8px;background:var(--bg-2);border:1.5px solid var(--bd);border-radius:var(--r-s);font-size:12px;color:var(--tx-1);font-family:var(--font);outline:none;transition:border-color var(--t);cursor:default;display:block;}.pfdg-pi:focus{border-color:var(--ac);}.pfdg-col{height:28px;padding:2px;cursor:pointer;}.pfdg-dbtn{width:100%;padding:7px;border-radius:var(--r-s);font-size:12px;cursor:pointer;border:1px solid;background:var(--red-bg);color:var(--red);border-color:var(--red-bg);margin-top:8px;font-family:var(--font);transition:all var(--t);}.pfdg-dbtn:hover{background:var(--red);color:#fff;}.pfdg-hint{font-size:11px;color:var(--tx-3);line-height:1.5;padding:8px 0;}.pfdg-status{display:flex;align-items:center;gap:6px;padding:4px 10px;background:var(--bg-1);border-top:1px solid var(--bd);font-size:11px;color:var(--tx-3);flex-shrink:0;}.pfdg-ancs{opacity:0;transition:opacity .15s;}.pfdg-n:hover .pfdg-ancs{opacity:1;}`;
document.head.appendChild(s);}

return{init,load,getData,getState,save,addNode,autoLayout,fitView,zoomIn,zoomOut,toggleGrid:()=>{},undo,redo,setTool,exportSVG,exportPNG,generateFromProject,_hist0,_del,_pc,_epc,_smd,_smm,_smu,_wheel,_sdbl,_nmd,_ndbl,_amd,_rhmd,_emd,_edbl,_ds,_drop};
})();
