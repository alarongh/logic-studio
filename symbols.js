(function () {
  const codes = {and:'&',or:'≥1',xor:'=1',not:'1',buffer:'1',const0:'0',const1:'1',switch:'IN',indicator:'OUT',clock:'CLK',variable:'VAR',half_adder:'HA',full_adder:'FA',dff:'D',rs_latch:'RS',jk_ff:'JK',register:'REG',multiplexer:'MUX',demultiplexer:'DEMUX',decoder:'DEC',encoder:'ENC',display:'DEC',seven_segment:'7SEG'};
  Object.assign(codes,{nand:'NAND',nor:'NOR',xnor:'XNOR',input:'IN',probe:'PRB',tristate:'Z',splitter:'SPL',adder:'ADD',subtractor:'SUB',multiplier:'MUL',divider:'DIV',comparator:'CMP',shifter:'SH',tff:'T',sync_register:'REG',counter:'CNT',shift_register:'SHR',ram:'RAM',rom:'ROM'});
  function svg(type) {
    const code = codes[type] || type;
    if (['and','or','xor','not','buffer'].includes(type)) {
      const bubble = type === 'not' ? '<circle cx="39" cy="16" r="3" fill="var(--panel)"/>' : '';
      return `<svg viewBox="0 0 48 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 10h9M2 22h9M37 16h9"/><rect x="11" y="3" width="26" height="26" rx="2"/>${bubble}</g><text x="24" y="21" text-anchor="middle" font-size="14" font-family="Consolas,monospace" fill="currentColor">${code === '&' ? '&amp;' : code}</text></svg>`;
    }
    return code;
  }
  function draw(ctx, c, def, color, accent, signal) {
    const cx = c.x + def.w / 2, cy = c.y + def.h / 2;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (['and','or','xor','not','buffer'].includes(c.type)) {
      ctx.strokeRect(cx-18,cy-19,36,38);ctx.font='600 23px Consolas,monospace';ctx.fillText(codes[c.type],cx,cy+1);
      if(c.type==='not'){ctx.beginPath();const angle={east:0,south:Math.PI/2,west:Math.PI,north:-Math.PI/2}[c.props.orientation||'east'];ctx.arc(cx+21*Math.cos(angle),cy+21*Math.sin(angle),3,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();ctx.stroke();}
    } else if(c.type==='switch') {
      ctx.strokeStyle=signal==='1'?accent:color;ctx.beginPath();ctx.moveTo(cx-21,cy+8);ctx.lineTo(cx+15,cy+(signal==='1'?8:-10));ctx.stroke();
      for(const x of [cx-24,cx+21]){ctx.beginPath();ctx.arc(x,cy+8,3,0,Math.PI*2);ctx.stroke();}
    } else if(c.type==='indicator') {
      ctx.beginPath();ctx.arc(cx,cy,15,0,Math.PI*2);ctx.fillStyle=signal==='1'?accent:signal==='X'||signal==='Z'?'#d88c32':color;ctx.globalAlpha=.14;ctx.fill();ctx.globalAlpha=1;ctx.stroke();ctx.font='600 17px Consolas,monospace';ctx.fillText(signal,cx,cy+1);
    } else if(c.type==='clock') {
      ctx.beginPath();ctx.moveTo(cx-24,cy+9);ctx.lineTo(cx-12,cy+9);ctx.lineTo(cx-12,cy-9);ctx.lineTo(cx+4,cy-9);ctx.lineTo(cx+4,cy+9);ctx.lineTo(cx+20,cy+9);ctx.lineTo(cx+20,cy-9);ctx.stroke();
    } else if(c.type!=='display'&&c.type!=='seven_segment') {
      ctx.font='600 20px Consolas,monospace';ctx.fillText(codes[c.type]||c.type,cx,cy);
      if(['dff','jk_ff'].includes(c.type)){ctx.beginPath();ctx.moveTo(c.x+8,cy+12);ctx.lineTo(c.x+14,cy+17);ctx.lineTo(c.x+8,cy+22);ctx.stroke();}
    }
    ctx.restore();
  }
  window.CircuitSymbols={codes,svg,draw};
})();
