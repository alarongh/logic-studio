(function(root){
  'use strict';
  const passive=new Set(['nmos','pmos','junction']);
  const key=e=>`${e.cid}:${e.pid}`;
  const signal=v=>v===1||v===true||v==='1'?'1':v===0||v===false||v==='0'?'0':v==='X'?'X':'Z';
  const merge=(a,b)=>a==='Z'?b:b==='Z'?a:a===b?a:'X';
  const enabled=components=>components.some(c=>passive.has(c.type));
  function unionFind(keys){
    const parent=new Map(keys.map(k=>[k,k])),rank=new Map();
    function find(k){let r=k;while(parent.get(r)!==r)r=parent.get(r);while(k!==r){const next=parent.get(k);parent.set(k,r);k=next;}return r;}
    function join(a,b){a=find(a);b=find(b);if(a===b)return;if((rank.get(a)||0)<(rank.get(b)||0))[a,b]=[b,a];parent.set(b,a);if((rank.get(a)||0)===(rank.get(b)||0))rank.set(a,(rank.get(a)||0)+1);}
    return{find,join};
  }
  // Wires and open channels are undirected conductors. Only digital outputs
  // and explicitly supplied subcircuit inputs drive a net; S/D never drive it.
  function resolve(components,wires,getPins,external=[]){
    const pins=new Map(),drivers=[],connected=new Set(),channels=[];
    for(const c of components){
      for(const p of getPins(c)){const k=key({cid:c.id,pid:p.id});pins.set(k,{c,p});if(p.dir==='out')drivers.push({key:k,value:signal(c.outputs?.[p.id]),label:`${c.id}.${p.id}`});}
      if(c.type==='nmos'||c.type==='pmos')channels.push({g:`${c.id}:g`,s:`${c.id}:s`,d:`${c.id}:d`,on:c.type==='nmos'?'1':'0'});
    }
    for(const e of external){const k=key(e);if(pins.has(k)){drivers.push({key:k,value:signal(e.value),label:'external'});connected.add(k);}}
    const keys=[...pins.keys()],edges=wires.filter(w=>pins.has(key(w.from))&&pins.has(key(w.to))).map(w=>[key(w.from),key(w.to)]);
    edges.forEach(([a,b])=>{connected.add(a);connected.add(b);});
    function build(gates){
      const definite=unionFind(keys),possible=unionFind(keys);
      for(const[a,b]of edges){definite.join(a,b);possible.join(a,b);}
      for(const ch of channels){const g=gates.get(ch.g)||'Z';if(g===ch.on){definite.join(ch.s,ch.d);possible.join(ch.s,ch.d);}else if(g==='X'||g==='Z')possible.join(ch.s,ch.d);}
      const collect=sets=>{const groups=new Map();for(const d of drivers){const r=sets.find(d.key);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(d);}return groups;};
      const groups=collect(definite),possibleGroups=collect(possible),values=new Map(),definiteValues=new Map(),conflicts=[];
      const resolved=group=>(group||[]).reduce((v,d)=>merge(v,d.value),'Z');
      for(const[r,ds]of groups)if(ds.some(d=>d.value==='0')&&ds.some(d=>d.value==='1'))conflicts.push({key:r,drivers:ds});
      for(const k of keys){const a=resolved(groups.get(definite.find(k))),b=resolved(possibleGroups.get(possible.find(k)));definiteValues.set(k,a);values.set(k,a===b?a:'X');}
      return{values,definiteValues,groups,sets:definite,conflicts};
    }
    // Rebuild connectivity as gate values settle, including gates driven by
    // other transistor stages. Start from floating channels on each solve so
    // a previous X or a previously conducting path cannot latch itself in.
    let gates=new Map(),result,stable=false;
    for(let i=0;i<Math.max(4,channels.length*2+4);i++){
      result=build(gates);const next=new Map(channels.map(ch=>[ch.g,result.definiteValues.get(ch.g)]));
      if(channels.every(ch=>next.get(ch.g)===(gates.get(ch.g)||'Z'))){stable=true;break;}gates=next;
    }
    // Once known stages have settled, conservatively propagate uncertainty
    // through gates that themselves depend on an uncertain conducting path.
    if(stable)for(let i=0;i<channels.length+1;i++){
      const next=new Map(channels.map(ch=>{const old=gates.get(ch.g)||'Z',value=result.values.get(ch.g);return[ch.g,value===old?old:'X'];}));
      if(channels.every(ch=>next.get(ch.g)===(gates.get(ch.g)||'Z')))break;
      gates=next;result=build(gates);
    }
    if(!stable)for(const[k,{p}]of pins)if(p.dir!=='out')result.values.set(k,'X');
    return{...result,pins,connected,stable};
  }
  function apply(components,wires,getPins,external=[]){
    const r=resolve(components,wires,getPins,external);
    for(const c of components){c.inputs={};c.inputDrivers={};c.terminals={};c.netSignals={};}
    for(const[k,{c,p}]of r.pins){
      const v=r.values.get(k);c.netSignals[p.id]=v;
      if(p.dir==='io')c.terminals[p.id]=v;
      else if(p.dir==='in'&&(r.connected.has(k)||v!=='Z')){c.inputs[p.id]=v;c.inputDrivers[p.id]=(r.groups.get(r.sets.find(k))||[]).map(d=>d.label);}
    }
    return r;
  }
  const api={enabled,resolve,apply,passive};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CircuitNetworks=api;
})(typeof globalThis!=='undefined'?globalThis:this);
