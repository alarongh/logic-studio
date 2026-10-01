const {test}=require('node:test');
const assert=require('node:assert/strict');
const ext=require('../extended.js'),code=require('../circuit-code.js'),schema=require('../schema.js');
test('six gate types compute every three-input combination on both output ports',()=>{
  const tables={and:'00000001',or:'01111111',xor:'01101001',nand:'11111110',nor:'10000000',xnor:'10010110'};
  for(const [type,truth]of Object.entries(tables))for(let combination=0;combination<8;combination++){
    const c={type,props:{bitWidth:1,inputCount:3,outputCount:2},inputs:{a:String(combination>>2&1),b:String(combination>>1&1),c:String(combination&1)},outputs:{}};
    ext.compute(c);assert.equal(c.outputs.y,truth[combination],type+combination);assert.equal(c.outputs.y_1,truth[combination]);assert.deepEqual(ext.ports.pins(c).inputs.map(p=>p.id),['a','b','c']);
  }
});
test('extra bus inputs and output copies keep original port names and bit order',()=>{
  const c={type:'xor',props:{bitWidth:2,inputCount:3,outputCount:2},inputs:{a0:'1',b0:'0',c0:'1',a1:'1',b1:'1',c1:'1'},outputs:{}};ext.compute(c);
  assert.deepEqual(c.outputs,{y0:'0',y_1_0:'0',y1:'1',y_1_1:'1'});const pins=ext.ports.pins(c);assert.equal(pins.inputs.length,6);assert.equal(pins.outputs.length,4);assert.ok(pins.outputs.some(p=>p.id==='y0'));
});
test('extra unknown inputs respect controlling values and output reduction clears stale ports',()=>{
  const c={type:'and',props:{bitWidth:1,inputCount:4,outputCount:3},inputs:{a:'0',b:'1',c:'X',d:'Z'},outputs:{}};ext.compute(c);assert.equal(c.outputs.y,'0');c.inputs.a='1';ext.compute(c);assert.equal(c.outputs.y_2,'X');c.props.outputCount=1;ext.compute(c);assert.deepEqual(Object.keys(c.outputs),['y']);
});
test('port counts round-trip through code and reject impossible configurations',()=>{
  const p=code.parse('circuit "Ports"\nand G(inputs=4,outputs=2,width=2) at(100,100)');assert.equal(p.components[0].props.inputCount,4);assert.equal(p.components[0].props.outputCount,2);assert.deepEqual(code.parse(code.stringify(p)),p);
  for(const props of [{inputCount:1},{inputCount:17},{outputCount:9},{inputCount:16,bitWidth:16}])assert.throws(()=>schema.normalize({components:[{id:'G',type:'and',x:100,y:100,props}],wires:[]}));
});
