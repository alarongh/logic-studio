const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function engine(){
  const nodes=new Map();
  const fake=()=>({value:'',dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},contains(){return false},getContext(){return new Proxy({measureText(){return{width:40}}},{get(t,p){return t[p]||(()=>{})},set(t,p,v){t[p]=v;return true}})},querySelectorAll(){return[]},clientWidth:1000,clientHeight:700});
  const document={createElement(){return fake()},getElementById(id){if(!nodes.has(id))nodes.set(id,fake());return nodes.get(id)},querySelectorAll(){return[]},addEventListener(){},body:fake(),activeElement:null};
  const context={document,window:{addEventListener(){}},CircuitSchema:require('../schema.js'),CircuitExtended:require('../extended.js'),CircuitSymbols:{svg(){return ''},draw(){}},localStorage:{getItem(){return null}},setInterval(){},requestAnimationFrame(){},performance:{now(){return 0}},structuredClone,console,getComputedStyle(){return{getPropertyValue(){return''}}}};
  let src=fs.readFileSync('app.js','utf8');src=src.slice(0,src.indexOf('  loadImages().then('))+'globalThis.api={state,simulate,make,getPins,generateTruthTable,buildCustomTruthTable,simulateSubcircuit,installCustomDefs,snapshot,restoreSnapshot,cutWire,wirePoints,pinPos};})();';
  vm.runInNewContext(src,context);const api=context.api;api.state.running=false;return api;
}
const wire=(e,from,pid,to,target)=>e.state.wires.push({id:'w'+e.state.nextId++,from:{cid:from.id,pid},to:{cid:to.id,pid:target},color:'#123456'});
test('half adder is correct for every combination',()=>{const e=engine();const a=e.make('switch',0,0),b=e.make('switch',0,0),h=e.make('half_adder',0,0);wire(e,a,'out',h,'a');wire(e,b,'out',h,'b');for(let x=0;x<2;x++)for(let y=0;y<2;y++){a.state.on=!!x;b.state.on=!!y;e.simulate();assert.equal(h.outputs.s,String(x^y));assert.equal(h.outputs.c,String(x&y));}});
test('X/Z logic respects controlling values',()=>{const e=engine();const zero=e.make('const0',0,0),and=e.make('and',0,0),or=e.make('or',0,0),one=e.make('const1',0,0);wire(e,zero,'out',and,'a');wire(e,one,'out',or,'a');e.simulate();assert.equal(and.outputs.y,'0');assert.equal(or.outputs.y,'1');});
test('pipeline flip-flops sample simultaneously independent of array order',()=>{for(const order of [false,true]){const e=engine();const input=e.make('switch',0,0,{on:true}),clk=e.make('switch',0,0),d1=e.make('dff',0,0),d2=e.make('dff',0,0);wire(e,input,'out',d1,'d');wire(e,d1,'q',d2,'d');wire(e,clk,'out',d1,'clk');wire(e,clk,'out',d2,'clk');if(order)e.state.components.reverse();e.simulate();clk.state.on=true;e.simulate();assert.equal(d1.outputs.q,'1');assert.equal(d2.outputs.q,'0');e.simulate();assert.equal(d2.outputs.q,'0');clk.state.on=false;e.simulate();clk.state.on=true;e.simulate();assert.equal(d2.outputs.q,'1');}});
test('JK toggle happens once per rising edge',()=>{const e=engine();const clk=e.make('switch',0,0),one=e.make('const1',0,0),jk=e.make('jk_ff',0,0);wire(e,clk,'out',jk,'clk');wire(e,one,'out',jk,'j');wire(e,one,'out',jk,'k');e.simulate();for(const q of ['1','0','1']){clk.state.on=true;e.simulate();assert.equal(jk.outputs.q,q);e.simulate();assert.equal(jk.outputs.q,q);clk.state.on=false;e.simulate();}});
test('bit-width mux handles data bit pins',()=>{const e=engine();const mux=e.make('multiplexer',0,0,{}, {bitWidth:4,addressBits:2});assert.equal(e.getPins(mux,'out').length,4);assert.ok(e.getPins(mux,'in').some(p=>p.id==='d3_3'));});
test('orientation moves pins without changing IDs or logic',()=>{const e=engine();const c=e.make('not',0,0,{}, {orientation:'south'});assert.equal(e.getPins(c,'in')[0].side,'top');assert.equal(e.getPins(c,'out')[0].side,'bottom');assert.equal(e.getPins(c,'out')[0].id,'y');});
test('truth table restores runtime and check markers',()=>{const e=engine();const input=e.make('switch',0,0,{on:true}),not=e.make('not',0,0);wire(e,input,'out',not,'a');e.state.showIssueMarkers=true;e.simulate();e.generateTruthTable();assert.equal(e.state.truthTable.rows.length,2);assert.equal(input.state.on,true);assert.equal(e.state.showIssueMarkers,true);assert.equal(not.outputs.y,'0');});
test('all original example wire endpoints exist',()=>{for(const name of fs.readdirSync('examples').filter(x=>x.endsWith('.json'))){const data=JSON.parse(fs.readFileSync('examples/'+name,'utf8'));const e=engine();e.state.components=data.components;const map=new Map(data.components.map(c=>[c.id,c]));for(const w of data.wires){assert.ok(e.getPins(map.get(w.from.cid),'out').some(p=>p.id===w.from.pid),name+' from');assert.ok(e.getPins(map.get(w.to.cid),'in').some(p=>p.id===w.to.pid),name+' to');}e.state.wires=data.wires;e.simulate();assert.equal(e.state.simStats.stable,true);}});

test('sequential subcircuit instances have independent memory and round-trip',()=>{
  const e=engine();const def={type:'custom_d',name:'D block',inputs:[{id:'i0',label:'D'},{id:'i1',label:'CLK'}],outputs:[{id:'o0',label:'Q'}],source:{components:[{id:'internal',type:'dff',x:100,y:100,state:{q:'0',lastClkHigh:false}}],wires:[],inputs:[{cid:'internal',pid:'d'},{cid:'internal',pid:'clk'}],outputs:[{cid:'internal',pid:'q'}]}};
  e.installCustomDefs([def]);const one=e.make('const1',0,0),zero=e.make('const0',0,0),clk=e.make('switch',0,0),a=e.make('custom_d',0,0),b=e.make('custom_d',0,0);
  wire(e,one,'out',a,'i0');wire(e,zero,'out',b,'i0');wire(e,clk,'out',a,'i1');wire(e,clk,'out',b,'i1');e.simulate();clk.state.on=true;e.simulate();assert.equal(a.outputs.o0,'1');assert.equal(b.outputs.o0,'0');
  const saved=e.snapshot();clk.state.on=false;e.simulate();const clean=require('../schema.js').normalize(JSON.parse(saved));assert.equal(clean.components.find(c=>c.id===a.id).state.childStates[0].state.q,'1');e.restoreSnapshot(saved);assert.equal(e.state.components.find(c=>c.id===a.id).outputs.o0,'1');
});


test('scissors delete the entire wire in all directions and undo restores it',()=>{
  for(const [start,end] of [[[100,100],[600,100]],[[600,100],[100,100]],[[100,100],[600,700]],[[100,700],[600,100]]]){
    const e=engine(),a=e.make('switch',...start,{on:true}),b=e.make('indicator',...end);wire(e,a,'out',b,'in');e.simulate();assert.equal(b.inputs.in,'1');
    const original=e.snapshot(),w=e.state.wires[0];e.cutWire(w);assert.equal(e.state.components.length,2);assert.equal(b.inputs.in,undefined);assert.equal(e.state.wires.length,0);
    e.restoreSnapshot(original);assert.equal(e.state.wires.length,1);assert.equal(e.state.components.find(c=>c.id===b.id).inputs.in,'1');
  }
});
