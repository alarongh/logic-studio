(function(root){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function highlight(text){let result='',last=0;for(const m of text.matchAll(/\/\/[^\n]*|"(?:[^"\\]|\\.)*"|\b(?:circuit|description|library|text|at|true|false|null)\b|\b\d+(?:\.\d+)?\b|->/g)){const t=m[0];result+=escape(text.slice(last,m.index))+`<span class="token-${t.startsWith('//')?'comment':t.startsWith('"')?'string':/^\d/.test(t)?'number':'keyword'}">${escape(t)}</span>`;last=m.index+t.length;}return result+escape(text.slice(last));}
  function attach(api){
    const $=id=>document.getElementById(id),dialog=$('importDialog'),editor=$('importText');let timer,draft=null;
    function paint(){const text=editor.value;$('codeHighlight').innerHTML=text.length<80000?highlight(text)+'\n':escape(text)+'\n';$('codeLines').textContent=Array.from({length:Math.min(5000,text.split('\n').length)},(_,i)=>i+1).join('\n');syncScroll();}
    function syncScroll(){$('codeHighlight').scrollTop=editor.scrollTop;$('codeHighlight').scrollLeft=editor.scrollLeft;$('codeLines').scrollTop=editor.scrollTop;}
    function preview(){
      paint();try{draft=api.validate(CircuitCode.parse(editor.value));$('importError').hidden=true;$('codeStatus').textContent=`${draft.components.length} блоков · ${draft.wires.length} соединений`;$('codeStatus').dataset.valid='true';render(draft);}
      catch(e){draft=null;$('importError').hidden=false;$('importError').textContent=e.message;$('codeStatus').textContent=e.line?`Ошибка в строке ${e.line}`:'Ошибка структуры';$('codeStatus').dataset.valid='false';$('codePreview').innerHTML='<div class="preview-empty">Исправьте код, чтобы обновить схему.<br>Текущий проект сохранён.</div>';}
    }
    function render(data){
      const library=data.customDefs||[],defs=new Map(data.components.map(c=>[c.id,api.definition(c,library)])),nodes=new Map(data.components.map(c=>[c.id,c]));
      if(!data.components.length){$('codePreview').innerHTML='<div class="preview-empty">Пустая схема</div>';return;}
      const maxX=Math.max(...data.components.map(c=>c.x+defs.get(c.id).w+40),...data.texts.map(t=>t.x+300)),maxY=Math.max(...data.components.map(c=>c.y+defs.get(c.id).h+60),...data.texts.map(t=>t.y+30));
      const point=(endpoint,dir)=>{const c=nodes.get(endpoint.cid),d=defs.get(c.id),p=d[dir].find(p=>p.id===endpoint.pid);return p.side==='top'||p.side==='bottom'?{x:c.x+d.w*p.y,y:c.y+(p.side==='top'?0:d.h)}:{x:c.x+(p.side==='left'?0:d.w),y:c.y+d.h*p.y};};
      const wires=data.wires.map(w=>{const a=point(w.from,'outputs'),b=point(w.to,'inputs'),mid=(a.x+b.x)/2;let points=[a,{x:mid,y:a.y},{x:mid,y:b.y},b];if(w.bends?.length){points=[a];let last=a;for(const p of [...w.bends,b]){points.push({x:p.x,y:last.y},p);last=p;}}return `<polyline points="${points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${w.color}" stroke-width="3"/>`;}).join('');
      const blocks=data.components.map(c=>{const d=defs.get(c.id),width=Math.min(72,d.w-20),height=54;const icon=CircuitSymbols.svg(c.type).replace('<svg ',`<svg x="${c.x+(d.w-width)/2}" y="${c.y+(d.h-height)/2}" width="${width}" height="${height}" `);return `<g color="var(--ink)"><rect x="${c.x-5}" y="${c.y-5}" width="${d.w+10}" height="${d.h+26}" rx="8" fill="var(--panel)" stroke="var(--component-border)"/>${icon}<text x="${c.x+d.w/2}" y="${c.y+d.h+14}" text-anchor="middle" font-size="11" fill="var(--ink)">${escape(c.id)}</text></g>`;}).join('');
      const texts=data.texts.map(t=>`<text x="${t.x}" y="${t.y}" font-size="${t.size}" fill="var(--ink)">${escape(t.text)}</text>`).join('');
      $('codePreview').innerHTML=`<svg viewBox="0 0 ${Math.max(320,maxX)} ${Math.max(240,maxY)}" role="img" aria-label="Предпросмотр схемы из кода">${wires}${blocks}${texts}</svg>`;
    }
    function fill(text){editor.value=text;editor.setSelectionRange(0,0);editor.scrollTop=0;preview();}
    $('aiImportBtn').addEventListener('click',()=>{fill(CircuitCode.stringify(api.read()));dialog.showModal();editor.focus();});
    $('currentCodeBtn').addEventListener('click',()=>fill(CircuitCode.stringify(api.read())));
    $('codeExampleBtn').addEventListener('click',()=>fill(CircuitCode.example));
    editor.addEventListener('input',()=>{paint();clearTimeout(timer);timer=setTimeout(preview,250);});editor.addEventListener('scroll',syncScroll);
    function apply(){try{api.load(editor.value);dialog.close();}catch(e){$('importError').hidden=false;$('importError').textContent=e.message;}}
    $('applyImportBtn').addEventListener('click',apply);
    editor.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('  ',start,end,'end');preview();}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();apply();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();api.download('circuit.logic',editor.value,'text/plain;charset=utf-8');}});
    $('importFileBtn').addEventListener('click',()=>$('codeFile').click());
    $('codeFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2_000_000)throw new Error('Максимум 2 МБ.');fill(await f.text());}catch(err){$('importError').hidden=false;$('importError').textContent=err.message;}e.target.value='';});
    $('downloadCodeBtn').addEventListener('click',()=>api.download('circuit.logic',editor.value,'text/plain;charset=utf-8'));
    $('exportCodeBtn').addEventListener('click',()=>api.download('circuit.logic',CircuitCode.stringify(api.read()),'text/plain;charset=utf-8'));
    $('copyCodeBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(editor.value);$('copyCodeBtn').textContent='Скопировано';}catch{editor.focus();editor.select();}});
    $('copyPromptBtn').addEventListener('click',async()=>{
      const prompt='Формат импорта Logic Studio: текст схемы в одном блоке ```logic, без создания отдельного файла. Синтаксис: circuit "Название"; тип ИМЯ(параметры) at(x,y); ИМЯ.выход -> ДРУГОЕ.вход. Параметры: width=1..16, address=1..5, inputs=2..16 и outputs=1..8 у вентилей, on=true/false, value=число. Выходы вентиля — копии результата. Без at размещение автоматическое. Типы: '+CircuitSchema.TYPES.join(', ')+'. Пины базовых компонентов: switch/const0/const1/clock out; and/or/xor/nand/nor/xnor a,b -> y; not/buffer a -> y; indicator in; dff d,clk -> q,nq; half_adder a,b -> s,c; full_adder a,b,cin -> s,cout. Для ширины >1 используй индексированные пины по документации. Не выполняй JavaScript. Пример:\n'+CircuitCode.example+'\nОстальные пины: '+new URL('AI_IMPORT.md',location.href).href;
      try{await navigator.clipboard.writeText(prompt);$('copyPromptBtn').textContent='Логика импорта скопирована';}catch{api.download('logic-studio-import-guide.txt',prompt,'text/plain;charset=utf-8');}
    });
    dialog.addEventListener('close',()=>clearTimeout(timer));
  }
  root.CircuitWorkbench={attach};
})(typeof globalThis!=='undefined'?globalThis:this);
