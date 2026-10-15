const {test}=require('node:test'),assert=require('node:assert/strict');
const net=require('../networks.js'),extended=require('../extended.js');
const component=(id,type,outputs={})=>({id,type,props:{bitWidth:1},state:{},inputs:{},outputs});
function pins(c){const d=extended.pins(c)||{inputs:[],outputs:[{id:'out'}]};return[...d.inputs.map(p=>({...p,dir:'in'})),...d.outputs.map(p=>({...p,dir:'out'})),...(d.inouts||[]).map(p=>({...p,dir:'io'}))];}
const wire=(a,b)=>{const[cid,pid]=a.split('.'),[to,tp]=b.split('.');return{from:{cid,pid},to:{cid:to,pid:tp}};};
test('MOS channel conducts both signal values in both directions only at its active gate level',()=>{
 for(const type of ['nmos','pmos'])for(const gate of ['0','1'])for(const value of ['0','1'])for(const direction of ['s','d']){
  const c=component('T',type),cs=[c,component('G','source',{out:gate}),component('D','source',{out:value})],other=direction==='s'?'d':'s';
  net.apply(cs,[wire('G.out','T.g'),wire('D.out','T.'+direction)],pins);
  assert.equal(c.terminals[direction],value);assert.equal(c.terminals[other],gate===(type==='nmos'?'1':'0')?value:'Z');assert.deepEqual(c.outputs,{});
 }
});
test('open channels, floating nets and unknown gates preserve Z/X semantics',()=>{
 for(const gate of ['0','1','X','Z']){const c=component('T','nmos');net.apply([c,component('G','source',{out:gate}),component('D','source',{out:'1'})],[wire('G.out','T.g'),wire('D.out','T.s')],pins);assert.equal(c.terminals.d,gate==='0'?'Z':gate==='1'?'1':'X');}
 const c=component('T','pmos');net.apply([c,component('G','source',{out:'0'})],[wire('G.out','T.g')],pins);assert.equal(c.terminals.s,'Z');assert.equal(c.terminals.d,'Z');
});
test('conflicting drivers resolve to X across a conducting channel, and disconnect cleanly',()=>{
 const c=component('T','nmos'),g=component('G','source',{out:'1'}),cs=[c,g,component('L','source',{out:'0'}),component('H','source',{out:'1'})],ws=[wire('G.out','T.g'),wire('L.out','T.s'),wire('H.out','T.d')];
 let r=net.apply(cs,ws,pins);assert.equal(c.terminals.s,'X');assert.equal(c.terminals.d,'X');assert.equal(r.conflicts.length,1);
 g.outputs.out='0';r=net.apply(cs,ws,pins);assert.equal(c.terminals.s,'0');assert.equal(c.terminals.d,'1');assert.equal(r.conflicts.length,0);
});
test('junction nets merge multiple tristate drivers, ignoring Z and reporting conflicts',()=>{
 const j=component('J','junction'),a=component('A','source',{out:'1'}),b=component('B','source',{out:'Z'}),cs=[j,a,b],ws=[wire('A.out','J.p'),wire('B.out','J.p')];
 net.apply(cs,ws,pins);assert.equal(j.terminals.p,'1');b.outputs.out='0';assert.equal(net.apply(cs,ws,pins).conflicts.length,1);assert.equal(j.terminals.p,'X');a.outputs.out='Z';net.apply(cs,ws,pins);assert.equal(j.terminals.p,'0');b.outputs.out='Z';net.apply(cs,ws,pins);assert.equal(j.terminals.p,'Z');
});
