(function(root){
  'use strict';
  const names={nand:'И-НЕ',nor:'ИЛИ-НЕ',xnor:'Эквивалентность',input:'Числовой вход',probe:'Пробник шины',tristate:'Трёхстабильный буфер',splitter:'Разветвитель',adder:'Сумматор шины',subtractor:'Вычитатель',multiplier:'Умножитель',divider:'Делитель',comparator:'Компаратор',shifter:'Сдвигатель',tff:'T-триггер',sync_register:'Тактовый регистр',counter:'Счётчик',shift_register:'Сдвиговый регистр',ram:'Оперативная память',rom:'Постоянная память'};
  const sequential=new Set(['tff','sync_register','counter','shift_register','ram']);
  const arithmetic=new Set(['adder','subtractor','multiplier','divider','comparator','shifter']);
  const pin=(id,label,side='left',y=.5)=>({id,label,side,y});
  const layout=(pins,side)=>pins.map((p,i)=>pin(p[0],p[1],side,(i+1)/(pins.length+1)));
  const bus=(prefix,n,label=prefix.toUpperCase())=>Array.from({length:n},(_,i)=>[prefix+i,label+i]);
  function defaults(type){return {bitWidth:['input','probe','splitter','adder','subtractor','multiplier','divider','comparator','shifter','sync_register','counter','shift_register','ram','rom'].includes(type)?4:1,...(['ram','rom'].includes(type)?{addressBits:4}:{}),...(type==='shifter'?{direction:'left'}:{})};}
  function pins(c){
    const t=c.type,n=c.props.bitWidth||1,a=c.props.addressBits||4;
    if(!names[t])return null;
    let ins=[],outs=[];
    if(['nand','nor','xnor'].includes(t)){ins=n===1?[['a','A'],['b','B']]:[...bus('a',n),...bus('b',n)];outs=n===1?[['y','Y']]:bus('y',n);}
    if(t==='input')outs=bus('out',n,'D');
    if(t==='probe')ins=bus('in',n,'D');
    if(t==='tristate'){ins=[...(n===1?[['a','A']]:bus('a',n)),['en','EN']];outs=n===1?[['y','Y']]:bus('y',n);}
    if(t==='splitter'){ins=bus('in',n);outs=bus('out',n);}
    if(arithmetic.has(t)){
      ins=[...bus('a',n),...bus('b',t==='shifter'?Math.max(1,Math.ceil(Math.log2(n+1))):n)];
      if(t==='adder')ins.push(['cin','Cin']);
      outs=t==='comparator'?[['lt','A<B'],['eq','A=B'],['gt','A>B']]:bus('y',n);
      if(t==='adder')outs.push(['cout','Cout']);
      if(t==='subtractor')outs.push(['borrow','Borrow']);
      if(t==='divider')outs.push(...bus('r',n,'R'));
    }
    if(t==='tff'){ins=[...(n===1?[['t','T']]:bus('t',n)),['clk','CLK']];outs=n===1?[['q','Q'],['nq','!Q']]:[...bus('q',n),...bus('nq',n,'!Q')];}
    if(t==='sync_register'){ins=[...bus('d',n),['en','EN'],['clk','CLK'],['reset','RST']];outs=bus('q',n);}
    if(t==='counter'){ins=[['en','EN'],['clk','CLK'],['reset','RST']];outs=[...bus('q',n),['carry','Carry']];}
    if(t==='shift_register'){ins=[['d','D'],['en','EN'],['clk','CLK'],['reset','RST']];outs=bus('q',n);}
    if(t==='ram'){ins=[...bus('a',a),...bus('d',n),['we','WE'],['clk','CLK']];outs=bus('q',n);}
    if(t==='rom'){ins=bus('a',a);outs=bus('q',n);}
    return {inputs:layout(ins,'left'),outputs:layout(outs,'right')};
  }
  function definitions(){return Object.fromEntries(Object.entries(names).map(([type,name])=>{const p=pins({type,props:defaults(type)});return[type,{name,group:sequential.has(type)||type==='rom'?'MEMORY':arithmetic.has(type)?'ARITHMETIC':['nand','nor','xnor'].includes(type)?'GATES':'BASIC',w:136,h:76,...p,desc:description(type)}];}));}
  function description(type){const desc={input:'Числовой вход: задайте значение в свойствах. D0 — младший бит.',probe:'Показывает значение многоразрядного сигнала. Все IN должны быть подключены.',tristate:'EN=1 передаёт данные, EN=0 отключает выход (Z).',splitter:'Передаёт разряды IN0…INn на OUT0…OUTn для разделения жгута.',adder:'Беззнаковое сложение A+B+Cin. Y — результат, Cout — перенос.',subtractor:'Беззнаковое вычитание A−B. Y — результат по модулю 2^n, Borrow — заём.',multiplier:'Беззнаковое произведение A×B по модулю 2^n.',divider:'Беззнаковое деление A/B. Y — частное, R — остаток. Деление на ноль даёт X.',comparator:'Беззнаковое сравнение шин A и B. Выходы LT, EQ, GT.',shifter:'Логический сдвиг A на B позиций. Направление настраивается в свойствах.',tff:'T-триггер переключает Q по фронту CLK при T=1.',sync_register:'Запоминает D по фронту CLK при EN=1. RST=1 асинхронно сбрасывает.',counter:'Увеличивает значение по фронту CLK при EN=1. RST=1 сбрасывает. Carry — все биты равны 1.',shift_register:'По фронту CLK при EN=1 сдвигает к старшим разрядам, D поступает в Q0. RST=1 сбрасывает.',ram:'Асинхронное чтение Q по адресу A. Запись D по фронту CLK при WE=1. Адресная ширина 1–5 бит.',rom:'Асинхронное чтение Q по адресу A. Содержимое задаётся списком чисел в свойствах.'};return desc[type]||'Побитовая логическая операция. Разрядность настраивается в свойствах.';}
  const sig=v=>v===1||v===true||v==='1'?'1':v===0||v===false||v==='0'?'0':v==='X'?'X':'Z';
  const unknown=v=>v==='X'||v==='Z';
  const inv=v=>v==='0'?'1':v==='1'?'0':'X';
  function compute(c,{hold=false}={}){
    if(!names[c.type])return false;
    const t=c.type,n=c.props.bitWidth||1,mask=2**n-1,st=c.state||(c.state={});
    const inp=id=>sig(c.inputs?.[id]);
    const read=(prefix,count=n)=>{const v=Array.from({length:count},(_,i)=>inp(prefix+i));return v.some(unknown)?null:v.reduce((a,b,i)=>a+(b==='1'?2**i:0),0);};
    const out=(id,v)=>{c.outputs[id]=sig(v);};
    const write=(prefix,value,count=n)=>{for(let i=0;i<count;i++)out(prefix+i,value===null?'X':Math.floor(value/2**i)%2);};
    const edge=inp('clk')==='1'&&!st.lastClkHigh;
    if(['nand','nor','xnor'].includes(t)){
      for(let i=0;i<n;i++){
        const a=inp(n===1?'a':'a'+i),b=inp(n===1?'b':'b'+i);
        const v=t==='nand'?(a==='0'||b==='0'?'1':unknown(a)||unknown(b)?'X':'0'):t==='nor'?(a==='1'||b==='1'?'0':unknown(a)||unknown(b)?'X':'1'):(unknown(a)||unknown(b)?'X':a===b?'1':'0');out(n===1?'y':'y'+i,v);
      }return true;
    }
    if(t==='input'){write('out',Number.isInteger(st.value)?st.value&mask:0);return true;}
    if(t==='probe')return true;
    if(t==='splitter'){for(let i=0;i<n;i++)out('out'+i,inp('in'+i));return true;}
    if(t==='tristate'){for(let i=0;i<n;i++)out(n===1?'y':'y'+i,inp('en')==='0'?'Z':inp('en')==='1'?inp(n===1?'a':'a'+i):'X');return true;}
    if(arithmetic.has(t)){
      const a=read('a'),b=read('b',t==='shifter'?Math.max(1,Math.ceil(Math.log2(n+1))):n);
      if(t==='comparator'){for(const [id,fn]of [['lt',(a,b)=>a<b],['eq',(a,b)=>a===b],['gt',(a,b)=>a>b]])out(id,a===null||b===null?'X':fn(a,b)?'1':'0');return true;}
      let value=null;
      if(a!==null&&b!==null){if(t==='adder'){const carry=inp('cin');if(!unknown(carry))value=a+b+(carry==='1'?1:0);}if(t==='subtractor')value=a-b;if(t==='multiplier')value=a*b;if(t==='divider'&&b!==0)value=Math.floor(a/b);if(t==='shifter')value=st.direction==='right'?Math.floor(a/2**b):a*2**b;}
      write('y',value===null?null:value&mask);
      if(t==='adder')out('cout',value===null?'X':value>mask?'1':'0');
      if(t==='subtractor')out('borrow',value===null?'X':value<0?'1':'0');
      if(t==='divider')write('r',value===null?null:a%b);
      return true;
    }
    if(t==='ram'||t==='rom'){
      const address=read('a',c.props.addressBits||4);const memory=Array.isArray(st.memory)?st.memory:[];st.memory=Array.from({length:2**(c.props.addressBits||4)},(_,i)=>memory[i]??(memory[i]===null?null:0));
      if(t==='ram'&&!hold&&edge&&inp('we')==='1'&&address!==null)st.memory[address]=read('d');
      if(t==='ram'&&!hold)st.lastClkHigh=inp('clk')==='1';
      write('q',address===null?null:(st.memory[address]===null?null:(st.memory[address]||0)&mask));return true;
    }
    if(sequential.has(t)){
      st.value=st.value===null?null:Number.isInteger(st.value)?st.value&mask:0;
      if(!hold){
        if(inp('reset')==='1')st.value=0;
        else if(edge){
          if(t==='tff'){
            const toggle=n===1?(unknown(inp('t'))?null:inp('t')==='1'?1:0):read('t');st.value=st.value===null||toggle===null?null:st.value^toggle;
          } else if(inp('en')==='1'){
            if(t==='sync_register')st.value=read('d');
            if(t==='counter')st.value=st.value===null?null:(st.value+1)&mask;
            if(t==='shift_register')st.value=st.value===null||unknown(inp('d'))?null:((st.value*2)+(inp('d')==='1'?1:0))&mask;
          } else if(inp('en')==='X')st.value=null;
        }
        st.lastClkHigh=inp('clk')==='1';
      }
      if(t==='tff'&&n===1){out('q',st.value===null?'X':st.value);out('nq',inv(sig(st.value)));}
      else {write('q',st.value);if(t==='tff')for(let i=0;i<n;i++)out('nq'+i,inv(sig(c.outputs['q'+i])));}
      if(t==='counter')out('carry',st.value===null?'X':st.value===mask?'1':'0');
      return true;
    }
    return true;
  }
  const api={names,defaults,pins,definitions,compute,sequential};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CircuitExtended=api;
})(typeof globalThis!=='undefined'?globalThis:this);
