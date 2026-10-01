(function(root){
  'use strict';
  const schema=typeof module!=='undefined'&&module.exports?require('./schema.js'):root.CircuitSchema;
  const aliases={width:'bitWidth',address:'addressBits'};
  const propertyKeys=new Set(['bitWidth','addressBits','orientation']);
  const stateKeys=new Set(['on','value','label','mode','direction','memory','q','qBits','lastClkHigh','childStates']);
  class CodeError extends Error{constructor(message,line=1){super(`Строка ${line}: ${message}`);this.line=line;}}
  function statements(text){
    const result=[];let start=0,line=1,startLine=1,depth=0,quoted=false,escaped=false;
    for(let i=0;i<=text.length;i++){
      const ch=text[i];
      if(!quoted&&ch==='/'&&text[i+1]==='/'){const end=text.indexOf('\n',i);text=text.slice(0,i)+' '.repeat((end<0?text.length:end)-i)+text.slice(end<0?text.length:end);}
      if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}
      else if(ch==='"')quoted=true;
      else if('([{'.includes(ch||'\0'))depth++;
      else if(')]}'.includes(ch||'\0')){if(--depth<0)throw new CodeError('Лишняя закрывающая скобка.',line);}
      if((i===text.length||(!quoted&&!depth&&(ch==='\n'||ch===';')))){
        const value=text.slice(start,i).trim();if(value)result.push({text:value,line:startLine});start=i+1;startLine=line+(ch==='\n'?1:0);
      }
      if(ch==='\n'){line++;if(start===i+1)startLine=line;}
    }
    if(quoted||depth)throw new CodeError('Не закрыты кавычки или скобки.',line);
    return result;
  }
  function split(text){let depth=0,quote=false,escape=false,start=0,parts=[];for(let i=0;i<=text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if('([{'.includes(c||'\0'))depth++;else if(')]}'.includes(c||'\0'))depth--;if(i===text.length||c===','&&!depth&&!quote){if(text.slice(start,i).trim())parts.push(text.slice(start,i).trim());start=i+1;}}return parts;}
  function value(text,line){try{return JSON.parse(text);}catch{if(/^[a-zA-Z_][\w-]*$/.test(text))return text;throw new CodeError('Значение должно быть числом, true/false, строкой в кавычках или JSON-массивом.',line);}}
  function parse(text){
    if(typeof text!=='string'||text.length>2_000_000)throw new CodeError('Максимум 2 МБ текста.');
    text=text.replace(/^\uFEFF/,'').trim();
    if(text.startsWith('{'))return schema.parse(text);
    if(text.includes('```')){const blocks=[...text.matchAll(/```(?:logic|circuit|json)?\s*\n([\s\S]*?)```/gi)];if(blocks.length!==1)throw new CodeError('В отчёте должен быть один блок logic или json.');return parse(blocks[0][1]);}
    const project={title:'Схема из кода',description:'',components:[],wires:[],texts:[],customDefs:[]};
    const wireRecords=[],nodeLines=new Map(),automatic=new Set();let counter=1;
    for(const entry of statements(text)){
      const s=entry.text,l=entry.line;let m;
      if((m=s.match(/^(circuit|description)\s+("[\s\S]*")$/))){const v=value(m[2],l);if(typeof v!=='string')throw new CodeError('Ожидается строка.',l);project[m[1]==='circuit'?'title':'description']=v;continue;}
      if(s.startsWith('library ')){const def=value(s.slice(8),l);project.customDefs.push(def);continue;}
      if((m=s.match(/^text\s+([\w-]+)\s+("(?:[^"\\]|\\.)*")\s+at\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)(?:\s+(\{[\s\S]*\}))?$/))){const options=m[5]?value(m[5],l):{};project.texts.push({id:m[1],text:value(m[2],l),x:Number(m[3]),y:Number(m[4]),size:options.size||16,color:options.color||'#566573'});continue;}
      if((m=s.match(/^([\w-]+)\.([\w!]+)\s*->\s*([\w-]+)\.([\w!]+)(?:\s+(\{[\s\S]*\}))?$/))){wireRecords.push({from:{cid:m[1],pid:m[2]},to:{cid:m[3],pid:m[4]},options:m[5]?value(m[5],l):{},line:l});continue;}
      if((m=s.match(/^([a-z][\w-]*)\s+([\w-]+)(?:\s*\(([\s\S]*?)\))?(?:\s+at\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\))?$/))){
        const [_,type,id,args]=m,props={},state={};if(nodeLines.has(id))throw new CodeError(`Блок ${id} уже объявлен.`,l);nodeLines.set(id,l);
        for(const param of split(args||'')){const pair=param.match(/^(\w+)\s*=\s*([\s\S]+)$/);if(!pair)throw new CodeError('Параметры задаются как width=4, value=9.',l);const key=aliases[pair[1]]||pair[1],v=value(pair[2],l);if(propertyKeys.has(key))props[key]=v;else if(stateKeys.has(key))state[key]=v;else if(key==='props'&&v&&typeof v==='object')Object.assign(props,v);else if(key==='state'&&v&&typeof v==='object')Object.assign(state,v);else throw new CodeError(`Неизвестный параметр ${key}.`,l);}
        const index=project.components.length;if(!m[4])automatic.add(id);project.components.push({id,type,x:m[4]?Number(m[4]):80+Math.floor(index/8)*270,y:m[5]?Number(m[5]):80+(index%8)*190,props,state});continue;
      }
      throw new CodeError('Неизвестная команда. Пример: xor SUM; A.out -> SUM.a',l);
    }
    if(!project.components.length&&!/^circuit\s/m.test(text))throw new CodeError('Добавьте хотя бы один блок. Например: switch A(on=true)',1);
    const used=new Set([...project.components,...project.texts].map(c=>c.id));
    for(const w of wireRecords){if(!nodeLines.has(w.from.cid)||!nodeLines.has(w.to.cid))throw new CodeError('Соединение ссылается на необъявленный блок.',w.line);let id=w.options.id;if(!id){do{id='wire_'+counter++;}while(used.has(id));}if(used.has(id))throw new CodeError(`Повторяющийся ID ${id}.`,w.line);used.add(id);project.wires.push({id,from:w.from,to:w.to,color:w.options.color,bends:w.options.bends});}
    const types=new Set([...schema.TYPES,...project.customDefs.map(d=>d.type)]);for(const c of project.components)if(!types.has(c.type))throw new CodeError(`Неизвестный тип блока: ${c.type}.`,nodeLines.get(c.id));
    if(automatic.size){
      const incoming=new Map(project.components.map(c=>[c.id,new Set()])),outgoing=new Map(project.components.map(c=>[c.id,new Set()])),level=new Map(project.components.map(c=>[c.id,0]));
      for(const w of project.wires){incoming.get(w.to.cid).add(w.from.cid);outgoing.get(w.from.cid).add(w.to.cid);}
      const remaining=new Map([...incoming].map(([id,parents])=>[id,parents.size])),queue=project.components.filter(c=>!remaining.get(c.id)).map(c=>c.id);
      for(let i=0;i<queue.length;i++)for(const child of outgoing.get(queue[i])){level.set(child,Math.max(level.get(child),level.get(queue[i])+1));remaining.set(child,remaining.get(child)-1);if(!remaining.get(child))queue.push(child);}
      const positions=new Map();for(const c of project.components){if(!automatic.has(c.id))continue;const col=level.get(c.id),row=positions.get(col)||0;const width=c.props.bitWidth||1,spacing=Math.max(190,120+width*32);c.x=80+col*270;c.y=80+row;if(c.x>3100||c.y+spacing>2200)throw new CodeError('Схема слишком велика для автоматического размещения: задайте координаты через at(x,y).',nodeLines.get(c.id));positions.set(col,row+spacing);}
    }
    try{return schema.normalize(project);}catch(e){throw new CodeError(e.message,1);}
  }
  function stringify(raw){
    const p=schema.normalize(raw),lines=[`circuit ${JSON.stringify(p.title)}`];
    if(p.description)lines.push(`description ${JSON.stringify(p.description)}`);
    for(const def of p.customDefs)lines.push('library '+JSON.stringify(def));
    lines.push('','// Блоки: тип имя(параметры) at(x, y)');
    for(const c of p.components){const args=[...Object.entries(c.props).map(([k,v])=>`${k==='bitWidth'?'width':k==='addressBits'?'address':k}=${JSON.stringify(v)}`),...Object.entries(c.state).map(([k,v])=>`${k}=${JSON.stringify(v)}`)];lines.push(`${c.type} ${c.id}${args.length?'('+args.join(', ')+')':''} at(${c.x}, ${c.y})`);}
    lines.push('','// Соединения: выход -> вход');
    for(const w of p.wires){const options={id:w.id,color:w.color,...(w.bends?{bends:w.bends}:{})};lines.push(`${w.from.cid}.${w.from.pid} -> ${w.to.cid}.${w.to.pid} ${JSON.stringify(options)}`);}
    if(p.texts.length){lines.push('','// Подписи');for(const t of p.texts)lines.push(`text ${t.id} ${JSON.stringify(t.text)} at(${t.x}, ${t.y}) ${JSON.stringify({size:t.size,color:t.color})}`);}
    return lines.join('\n')+'\n';
  }
  const example='circuit "Полусумматор"\n\nswitch A(on=true) at(100,100)\nswitch B(on=false) at(100,300)\nxor SUM at(400,100)\nand CARRY at(400,300)\nindicator S at(700,100)\nindicator C at(700,300)\n\nA.out -> SUM.a\nB.out -> SUM.b\nA.out -> CARRY.a\nB.out -> CARRY.b\nSUM.y -> S.in\nCARRY.y -> C.in\n';
  const api={parse,stringify,example,CodeError};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CircuitCode=api;
})(typeof globalThis!=='undefined'?globalThis:this);
