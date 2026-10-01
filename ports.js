(function(root){
  'use strict';
  const gates=new Set(['and','or','xor','nand','nor','xnor']);
  const isGate=type=>gates.has(type);
  const inputId=(group,bit,width)=>String.fromCharCode(97+group)+(width===1?'':bit);
  const outputId=(group,bit,width)=>group===0?(width===1?'y':'y'+bit):(width===1?'y_'+group:'y_'+group+'_'+bit);
  function pins(c){
    const width=c.props?.bitWidth||1,ins=c.props?.inputCount||2,outs=c.props?.outputCount||1;
    const side=(count,make,dir)=>Array.from({length:count},(_,i)=>({...make(i),side:dir,y:count===1?.5:.16+.68*i/(count-1)}));
    return {inputs:side(ins*width,i=>{const group=i%ins,bit=Math.floor(i/ins);return {id:inputId(group,bit,width),label:String.fromCharCode(65+group)+(width===1?'':bit)};},'left'),outputs:side(outs*width,i=>{const group=Math.floor(i/width),bit=i%width;return{id:outputId(group,bit,width),label:'Y'+(group?'·'+(group+1):'')+(width===1?'':bit)};},'right')};
  }
  const sig=v=>v===1||v===true||v==='1'?'1':v===0||v===false||v==='0'?'0':v==='X'?'X':'Z';
  function compute(c){
    if(!isGate(c.type))return false;
    const width=c.props?.bitWidth||1,ins=c.props?.inputCount||2,outs=c.props?.outputCount||1;
    c.outputs={};
    for(let bit=0;bit<width;bit++){
      const values=Array.from({length:ins},(_,group)=>sig(c.inputs?.[inputId(group,bit,width)]));
      let value;
      if(c.type==='and'||c.type==='nand')value=values.includes('0')?'0':values.some(v=>v==='X'||v==='Z')?'X':'1';
      else if(c.type==='or'||c.type==='nor')value=values.includes('1')?'1':values.some(v=>v==='X'||v==='Z')?'X':'0';
      else value=values.some(v=>v==='X'||v==='Z')?'X':values.filter(v=>v==='1').length%2?'1':'0';
      if(['nand','nor','xnor'].includes(c.type))value=value==='1'?'0':value==='0'?'1':'X';
      for(let group=0;group<outs;group++)c.outputs[outputId(group,bit,width)]=value;
    }
    return true;
  }
  function check(props){const w=props.bitWidth||1,i=props.inputCount||2,o=props.outputCount||1;if(w*i>96||w*o>96)throw new Error('Максимум 96 входных и 96 выходных разрядов у вентиля. Уменьшите число портов или разрядность.');}
  function description(c){const operation={and:'1, если все входы равны 1.',or:'1, если хотя бы один вход равен 1.',xor:'1 при нечётном числе единиц на входах.',nand:'Инверсия логического И.',nor:'Инверсия логического ИЛИ.',xnor:'1 при чётном числе единиц на входах.'}[c.type];return operation+' Входов: '+(c.props.inputCount||2)+', выходов: '+(c.props.outputCount||1)+'. Каждый выход выдаёт копию результата.';}
  const api={isGate,pins,compute,check,inputId,outputId,description};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CircuitPorts=api;
})(typeof globalThis!=='undefined'?globalThis:this);
