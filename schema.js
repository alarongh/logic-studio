(function (root) {
  'use strict';
  const TYPES = ['and','or','xor','not','buffer','const0','const1','switch','indicator','clock','variable','half_adder','full_adder','dff','rs_latch','jk_ff','register','multiplexer','demultiplexer','decoder','encoder','seven_segment','display','nand','nor','xnor','input','probe','tristate','splitter','adder','subtractor','multiplier','divider','comparator','shifter','tff','sync_register','counter','shift_register','ram','rom','contact'];
  const COLORS = ['#da5371','#5080d9','#119e8a','#d88c32','#9460cc','#329bb6','#b19a37','#c958a8'];
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const color = v => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
  const fail = message => { throw new Error(message); };
  function parse(text) {
    if (typeof text !== 'string' || text.length > 2_000_000) fail('Файл должен быть текстом JSON размером до 2 МБ.');
    let clean = text.replace(/^\uFEFF/, '').trim();
    if (!clean.startsWith('{')) {
      const blocks = [...clean.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)];
      if (blocks.length !== 1) fail('Вставьте JSON или отчёт с одним блоком ```json.');
      clean = blocks[0][1].trim();
    }
    let data;
    try { data = JSON.parse(clean); } catch { fail('Некорректный JSON: проверьте кавычки, запятые и скобки.'); }
    return normalize(data);
  }
  function normalize(raw, libraryOverride=null) {
    if (!plain(raw)) fail('Ожидается объект схемы.');
    const data = raw.circuit ?? raw;
    if (!plain(data) || !Array.isArray(data.components) || !Array.isArray(data.wires)) fail('Схема должна содержать массивы components и wires.');
    if (data.components.length > 300 || data.wires.length > 2000 || (data.texts?.length || 0) > 300) fail('Лимит: 300 блоков, 2000 проводов и 300 подписей.');
    if (data.texts !== undefined && !Array.isArray(data.texts)) fail('texts должен быть массивом.');
    const customDefs = libraryOverride || normalizeLibrary(raw.customDefs || data.customDefs || []);
    const customTypes = new Set(customDefs.map(d=>d.type));
    const ids = new Set();
    const id = value => {
      if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) fail('ID должен содержать 1–80 латинских букв, цифр, _ или -.');
      if (ids.has(value)) fail(`Повторяющийся ID: ${value}.`);
      ids.add(value); return value;
    };
    const coordinate = (value, max) => { if (!Number.isFinite(value) || value < 0 || value > max) fail('Координаты должны находиться в пределах поля 3400 × 2300.'); return value; };
    const range = (v, max, label) => { if (!Number.isInteger(v) || v < 1 || v > max) fail(`${label}: допустимы целые значения от 1 до ${max}.`); return v; };
    const components = data.components.map(c => {
      if (!plain(c) || (!TYPES.includes(c.type) && !customTypes.has(c.type))) fail(`Неизвестный тип блока: ${String(c?.type).slice(0,80)}.`);
      const props = {};
      if (c.props?.bitWidth !== undefined) props.bitWidth = range(c.props.bitWidth,16,'Разрядность');
      if (c.props?.addressBits !== undefined) props.addressBits = range(c.props.addressBits,5,'Адресная разрядность');
      if(c.props?.inputCount!==undefined){if(!['and','or','xor','nand','nor','xnor'].includes(c.type))fail('Число входов настраивается у логических вентилей.');props.inputCount=range(c.props.inputCount,16,'Число входов');if(props.inputCount<2)fail('У вентиля должно быть хотя бы 2 входа.');}
      if(c.props?.outputCount!==undefined){if(!['and','or','xor','nand','nor','xnor'].includes(c.type))fail('Число выходов настраивается у логических вентилей.');props.outputCount=range(c.props.outputCount,8,'Число выходов');}
      if(['and','or','xor','nand','nor','xnor'].includes(c.type)&&((props.inputCount||2)*(props.bitWidth||1)>96||(props.outputCount||1)*(props.bitWidth||1)>96))fail('У вентиля допустимо до 96 разрядов на каждой стороне.');
      if (c.props?.orientation !== undefined) { if (!['east','south','west','north'].includes(c.props.orientation)) fail('Некорректная ориентация элемента.'); props.orientation=c.props.orientation; }
      const state = normalizeState(c.state);
      return { id:id(c.id), type:c.type, x:coordinate(c.x,3400), y:coordinate(c.y,2300), props, state, inputs:{}, outputs:{}, prevInputs:{} };
    });
    const componentIds = new Set(components.map(c => c.id));
    const sources = Object.create(null);
    const wires = data.wires.map(w => {
      if (!plain(w)) fail('Некорректный провод.');
      const endpoint = e => {
        if (!plain(e) || !componentIds.has(e.cid) || typeof e.pid !== 'string' || !/^[a-zA-Z0-9_!]{1,40}$/.test(e.pid)) fail('Провод ссылается на отсутствующий блок или некорректный пин.');
        return {cid:e.cid,pid:e.pid};
      };
      const from = endpoint(w.from), to = endpoint(w.to);
      const key = `${from.cid}:${from.pid}`;
      sources[key] ||= color(w.color) ? w.color : COLORS[Object.keys(sources).length % COLORS.length];
      const bends=[];
      if(w.bends!==undefined){if(!Array.isArray(w.bends)||w.bends.length>16)fail('Провод: максимум 16 точек маршрута.');for(const p of w.bends){if(!plain(p))fail('Некорректная точка провода.');bends.push({x:coordinate(p.x,3400),y:coordinate(p.y,2300)});}}
      return {id:id(w.id),from,to,color:sources[key],...(bends.length?{bends}:{})};
    });
    const texts = (data.texts || []).map(t => {
      if (!plain(t) || typeof t.text !== 'string') fail('Подпись должна содержать строку text.');
      return {id:id(t.id),x:coordinate(t.x,3400),y:coordinate(t.y,2300),text:t.text.slice(0,1000),size:Number.isFinite(t.size)?Math.max(10,Math.min(64,t.size)):16,color:color(t.color)?t.color:'#566573'};
    });
    const nextId = Math.max(0,...[...ids,...customTypes].map(v=>{const n=Number(v.match(/\d+$/)?.[0]);return Number.isSafeInteger(n)&&n<1_000_000_000?n:0;})) + 1;
    return {version:'logic-studio-v2',title:String(raw.title || data.title || 'Новая схема').slice(0,100),description:String(raw.description || data.description || '').slice(0,10000),customDefs,components,wires,texts,nextId,colorIndex:Object.keys(sources).length,sourceColors:sources};
  }
  function normalizeState(raw,depth=0) {
    if(depth>8)fail('Слишком глубокая вложенность состояния подсхемы.');
    const st=plain(raw)?raw:{},state={};
    if(st.on!==undefined){if(typeof st.on!=='boolean')fail('state.on должен быть true или false.');state.on=st.on;}
    if(st.label!==undefined)state.label=String(st.label).slice(0,32);
    if(st.mode!==undefined)state.mode=['dec','hex','bin'].includes(st.mode)?st.mode:'dec';
    if(st.value!==undefined){if(st.value!==null&&(!Number.isInteger(st.value)||st.value<0||st.value>65535))fail('Значение должно быть целым числом от 0 до 65535.');state.value=st.value;}
    if(st.direction!==undefined)state.direction=st.direction==='right'?'right':'left';
    if(st.memory!==undefined){if(!Array.isArray(st.memory)||st.memory.length>32||st.memory.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>65535)))fail('Память: максимум 32 слова, значения 0–65535 или null (X).');state.memory=st.memory.slice();}
    if(st.q!==undefined)state.q=['0','1','X','Z'].includes(String(st.q))?String(st.q):'0';
    if(Array.isArray(st.qBits))state.qBits=st.qBits.slice(0,16).map(v=>['0','1','X','Z'].includes(String(v))?String(v):'0');
    if(st.lastClkHigh!==undefined)state.lastClkHigh=!!st.lastClkHigh;
    if(st.childStates!==undefined){if(!Array.isArray(st.childStates)||st.childStates.length>300)fail('Некорректное состояние подсхемы.');state.childStates=st.childStates.map(c=>{if(!plain(c)||!/^[a-zA-Z0-9_-]{1,80}$/.test(c.id))fail('Некорректный ID внутри подсхемы.');return{id:c.id,state:normalizeState(c.state,depth+1)};});}
    return state;
  }
  function normalizeLibrary(list) {
    if(!Array.isArray(list)||list.length>24)fail('Библиотека может содержать до 24 подсхем.');
    const types=new Set();
    const result=list.map(d=>{
      if(!plain(d)||!/^custom_[a-zA-Z0-9_-]{1,60}$/.test(d.type)||types.has(d.type))fail('Некорректный или повторный тип подсхемы.');
      types.add(d.type);
      const graph=plain(d.source);
      if(!Array.isArray(d.inputs)||!Array.isArray(d.outputs)||d.inputs.length>(graph?32:10)||!d.outputs.length||d.outputs.length>32||(!graph&&!plain(d.table)))fail('Подсхема: до 32 входов / выходов, обязательна схема или таблица.');
      const ids=new Set();
      const pins=(list,side)=>list.map((p,i)=>{if(!plain(p)||!/^\w{1,40}$/.test(p.id)||ids.has(p.id))fail('Некорректные пины подсхемы.');ids.add(p.id);return{id:p.id,label:String(p.label||p.id).slice(0,20),side,y:(i+1)/(list.length+1)};});
      const inputs=pins(d.inputs,'left'),outputs=pins(d.outputs,'right'),table=Object.create(null);
      if(plain(d.table)&&Object.keys(d.table).length){
        if(inputs.length>10||Object.keys(d.table).length!==2**inputs.length)fail('Таблица подсхемы должна содержать все комбинации входов.');
        for(const[key,row]of Object.entries(d.table)){
          if(!new RegExp('^[01]{'+inputs.length+'}$').test(key)||!plain(row))fail('Некорректная строка таблицы подсхемы.');
          table[key]={};for(const p of outputs){if(!['0','1','X','Z'].includes(row[p.id]))fail('Недопустимый выход подсхемы.');table[key][p.id]=row[p.id];}
        }
      }else if(!graph)fail('Отсутствует таблица подсхемы.');
      return{type:d.type,name:String(d.name||'Подсхема').slice(0,60),group:'USER COMPONENTS',custom:true,w:150,h:Math.max(76,32+Math.max(inputs.length,outputs.length)*18),inputs,outputs,table,desc:(graph?'Подсхема':'Комбинационная подсхема')+' · '+inputs.length+' входов · '+outputs.length+' выходов.'};
    });
    result.forEach((d,i)=>{
      const source=list[i].source;if(!plain(source))return;
      const clean=normalize({components:source.components,wires:source.wires,texts:[]},result);
      const ids=new Set(clean.components.map(c=>c.id));
      const ports=(items,n)=>{if(!Array.isArray(items)||items.length!==n)fail('Число портов подсхемы не совпадает с интерфейсом.');return items.map(p=>{if(!plain(p)||!ids.has(p.cid)||typeof p.pid!=='string'||!/^\w{1,40}$/.test(p.pid))fail('Порт подсхемы ссылается на неизвестный блок.');return{cid:p.cid,pid:p.pid};});};
      d.source={components:clean.components,wires:clean.wires,inputs:ports(source.inputs,d.inputs.length),outputs:ports(source.outputs,d.outputs.length)};
    });
    const lookup=new Map(result.map(d=>[d.type,d]));
    const cost=(type,path=[])=>{if(path.includes(type))fail('Подсхемы не могут рекурсивно включать сами себя.');if(path.length>8)fail('Максимум 8 уровней подсхем.');const def=lookup.get(type);if(!def?.source)return 1;let total=1;for(const c of def.source.components){total+=cost(c.type,[...path,type]);if(total>1000)fail('Подсхема содержит слишком много вложенных элементов (до 1000).');}return total;};
    result.forEach(d=>cost(d.type));return result;
  }
  const api = {parse,normalize,normalizeLibrary,TYPES,COLORS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CircuitSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
