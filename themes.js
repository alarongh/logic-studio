(function(root){
  'use strict';
  const presets={
    light:{label:'Облако',mode:'light',accent:'#247a70',board:'#f4f7f8',panel:'#ffffff',ink:'#263b46'},
    dark:{label:'Графит',mode:'dark',accent:'#78c7bc',board:'#182229',panel:'#202e36',ink:'#e2edf0'},
    linen:{label:'Лён',mode:'light',accent:'#8b7051',board:'#f5f0e8',panel:'#fffcf7',ink:'#413c35'},
    ocean:{label:'Океан',mode:'dark',accent:'#72b8dc',board:'#152737',panel:'#1c3445',ink:'#e4edf4'},
    lavender:{label:'Лаванда',mode:'light',accent:'#79649e',board:'#f2eff8',panel:'#fcfaff',ink:'#40364e'}
  };
  const valid=v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
  function normalize(raw){const base=presets[raw?.preset]||presets.light;return{preset:presets[raw?.preset]?raw.preset:'light',...Object.fromEntries(['accent','board','panel','ink'].map(k=>[k,valid(raw?.[k])?raw[k]:base[k]])),mode:raw?.mode==='dark'?'dark':base.mode};}
  function variables(raw){const c=normalize(raw),border=mix(c.panel,c.ink,.17),muted=mix(c.panel,c.ink,.6);return{'--accent':c.accent,'--accent-soft':mix(c.panel,c.accent,.13),'--bg':c.board,'--board-bg':c.board,'--board-shell':c.board,'--panel':c.panel,'--ink':c.ink,'--muted':muted,'--border':border,'--button-bg':c.panel,'--button-border':border,'--category-bg':mix(c.panel,c.board,.65),'--grid-line':mix(c.board,c.ink,.2),'--component-fill':c.panel,'--component-border':mix(c.panel,c.ink,.3),'--component-text':c.ink,'--pin-off':c.panel,'--pin-stroke-off':muted,'--wire-off':muted,'--display-bg':mix(c.board,'#07151c',.6),'--display-text':c.accent};}
  function attach(onChange){
    const dialog=document.getElementById('themeDialog');let current;
    try{current=normalize(JSON.parse(localStorage.getItem('logic_studio_palette')||'null'));}catch{current=normalize({});}
    function apply(raw,save=true){current=normalize(raw);document.body.classList.toggle('theme-dark',current.mode==='dark');document.body.style.colorScheme=current.mode;for(const[k,v]of Object.entries(variables(current)))document.body.style.setProperty(k,v);if(save){try{localStorage.setItem('logic_studio_palette',JSON.stringify(current));}catch{}}onChange(current.mode);}
    function sync(){document.getElementById('themePreset').value=current.preset;for(const key of ['accent','board','panel','ink'])document.getElementById('theme-'+key).value=current[key];}
    document.getElementById('appearanceBtn').addEventListener('click',()=>{sync();dialog.showModal();});
    document.getElementById('themePreset').addEventListener('change',e=>{apply({preset:e.target.value});sync();});
    for(const key of ['accent','board','panel','ink'])document.getElementById('theme-'+key).addEventListener('input',e=>apply({...current,[key]:e.target.value}));
    document.getElementById('themeResetBtn').addEventListener('click',()=>{apply({preset:current.preset});sync();});
    document.getElementById('themeBtn').addEventListener('click',()=>{apply({preset:current.mode==='dark'?'light':'dark'});sync();});
    apply(current,false);return {apply};
  }
  const api={presets,normalize,variables,attach};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CircuitThemes=api;
})(typeof globalThis!=='undefined'?globalThis:this);
