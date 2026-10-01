(function(root){
  'use strict';
  const fail=msg=>{throw new Error(msg)};
  function parse(expression){
    const tokens=[];let cursor=0;
    while(cursor<expression.length){const tail=expression.slice(cursor);const m=tail.match(/^(\s+|[a-zA-Z][a-zA-Z0-9_]*|[01]|[()!~¬&∧*|∨+^⊕])/);if(!m)fail('Неизвестный символ: '+tail[0]);cursor+=m[0].length;if(!/^\s+$/.test(m[0]))tokens.push(m[0]);}
    let i=0;
    const is=(...choices)=>choices.includes((tokens[i]||'').toUpperCase());
    function atom(){if(is('!','~','¬','NOT')){i++;return{op:'not',a:atom()};}if(is('(')){i++;const value=or();if(!is(')'))fail('Пропущена закрывающая скобка.');i++;return value;}const t=tokens[i++];if(t==='0'||t==='1')return{op:'const',value:Number(t)};if(t&&/^[a-zA-Z]\w*$/.test(t)&&!['AND','OR','XOR','NOT','NAND','NOR','XNOR'].includes(t.toUpperCase()))return{op:'var',name:t};fail('Ожидается переменная, 0, 1 или выражение в скобках.');}
    function and(){let v=atom();while(is('&','∧','*','AND','NAND')){const op=tokens[i++].toUpperCase();v={op:'and',a:v,b:atom()};if(op==='NAND')v={op:'not',a:v};}return v;}
    function xor(){let v=and();while(is('^','⊕','XOR','XNOR')){const op=tokens[i++].toUpperCase();v={op:'xor',a:v,b:and()};if(op==='XNOR')v={op:'not',a:v};}return v;}
    function or(){let v=xor();while(is('|','∨','+','OR','NOR')){const op=tokens[i++].toUpperCase();v={op:'or',a:v,b:xor()};if(op==='NOR')v={op:'not',a:v};}return v;}
    const result=or();if(i!==tokens.length)fail('Лишний токен: '+tokens[i]+'. Между переменными нужен оператор.');return result;
  }
  const key=node=>node.op==='var'?node.name:node.op==='const'?String(node.value):node.op+'('+key(node.a)+(node.b?','+key(node.b):'')+')';
  function simplify(node){
    if(!node.a)return node;const a=simplify(node.a),b=node.b?simplify(node.b):null;
    if(node.op==='not'){if(a.op==='const')return{op:'const',value:1-a.value};if(a.op==='not')return a.a;return{op:'not',a};}
    if(key(a)===key(b))return node.op==='xor'?{op:'const',value:0}:a;
    if(a.op==='const'&&b.op==='const')return{op:'const',value:node.op==='and'?a.value&b.value:node.op==='or'?a.value|b.value:a.value^b.value};
    const constant=a.op==='const'?a:b.op==='const'?b:null,other=constant===a?b:a;
    if(constant){if(node.op==='and')return constant.value?other:constant;if(node.op==='or')return constant.value?constant:other;if(node.op==='xor')return constant.value?simplify({op:'not',a:other}):other;}
    if((a.op==='not'&&key(a.a)===key(b))||(b.op==='not'&&key(b.a)===key(a)))return{op:'const',value:node.op==='and'?0:1};
    return{op:node.op,a,b};
  }
  function build(text){
    if(typeof text!=='string'||text.length>3000)fail('Формулы: до 3000 символов.');
    const lines=text.split(/[\n;]+/).map(s=>s.trim()).filter(Boolean);if(!lines.length||lines.length>10)fail('Задайте от 1 до 10 формул: Y = A & B.');
    const names=new Set(),components=[],wires=[],texts=[],memo=new Map(),columns=new Map();let next=1;
    function add(node){
      const k=key(node);if(memo.has(k))return memo.get(k);
      let type,level=0,st={};let a,b;
      if(node.op==='var'){type='variable';st={label:node.name,on:false};}
      else if(node.op==='const')type=node.value?'const1':'const0';
      else {a=add(node.a);b=node.b?add(node.b):null;level=1+Math.max(a.level,b?.level||0);type=node.op;}
      const slot=columns.get(level)||0;columns.set(level,slot+1);
      if(slot>10||level>11||components.length>100)fail('Формула слишком большая для текущего поля. Разбейте её на подсхемы.');
      const c={id:'m'+next++,type,x:100+220*level,y:120+160*slot,state:st,props:{bitWidth:1},level};components.push(c);memo.set(k,c);
      const connect=(source,target,pid)=>wires.push({id:'w'+next++,from:{cid:source.id,pid:source.type==='variable'||source.type.startsWith('const')?'out':'y'},to:{cid:target.id,pid}});
      if(a)connect(a,c,'a');if(b)connect(b,c,'b');return c;
    }
    const outputs=[];
    for(const line of lines){const m=line.match(/^([a-zA-Z]\w*)\s*=\s*(.+)$/);if(!m)fail('Формат строки: Y = A & B.');if(names.has(m[1]))fail('Повторное имя выхода: '+m[1]);names.add(m[1]);outputs.push({name:m[1],source:add(simplify(parse(m[2])))});}
    const depth=Math.max(...components.map(c=>c.level))+1;
    outputs.forEach(({name,source},i)=>{const out={id:'m'+next++,type:'indicator',x:100+depth*220,y:120+i*160,state:{},props:{bitWidth:1}};components.push(out);wires.push({id:'w'+next++,from:{cid:source.id,pid:source.type==='variable'||source.type.startsWith('const')?'out':'y'},to:{cid:out.id,pid:'in'}});texts.push({id:'t'+next++,x:out.x,y:out.y-25,text:name,size:16});});
    components.forEach(c=>delete c.level);
    return{version:'logic-studio-v2',title:'Схема из формул',description:text,components,wires,texts};
  }
  const api={parse,simplify,build};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CircuitSynthesis=api;
})(typeof globalThis!=='undefined'?globalThis:this);
