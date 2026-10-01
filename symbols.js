(function(root){
  'use strict';
  // One path set renders both the palette and the board, without raster scaling.
  const chip='M12 8H52V40H12Z';
  const and='M16 10H31C53 10 53 38 31 38H16Z';
  const or='M14 9Q34 8 49 24Q34 40 14 39Q25 24 14 9Z';
  const triangle='M17 9L47 24L17 39Z';
  const paths={contact:'M5 24H22M42 24H59 M42 24A10 10 0 1 0 22 24A10 10 0 1 0 42 24',and,or,xor:or+' M10 9Q21 24 10 39',not:triangle.replace('M47 24H59','M53 24H59')+' M53 24A3 3 0 1 0 47 24A3 3 0 1 0 53 24',buffer:triangle,
    nand:and.replace('M48 24H59','M54 24H59')+' M54 24A3 3 0 1 0 48 24A3 3 0 1 0 54 24',
    nor:or.replace('M49 24H59','M55 24H59')+' M55 24A3 3 0 1 0 49 24A3 3 0 1 0 55 24',
    xnor:or.replace('M49 24H59','M55 24H59')+' M10 9Q21 24 10 39 M55 24A3 3 0 1 0 49 24A3 3 0 1 0 55 24',
    const0:'M8 24H20M44 24H58 M38 24A6 11 0 1 0 26 24A6 11 0 1 0 38 24',const1:'M8 24H20M44 24H58 M27 17L33 13V35M27 35H39',
    switch:'M5 30H17M47 30H60 M17 30L43 14 M21 30A4 4 0 1 0 13 30A4 4 0 1 0 21 30 M51 30A4 4 0 1 0 43 30A4 4 0 1 0 51 30',
    indicator:'M5 24H17 M47 24A15 15 0 1 0 17 24A15 15 0 1 0 47 24 M24 24L30 30L41 17',clock:'M5 34H17V14H32V34H47V14H59',
    variable:'M6 24H17M47 24H59 M17 9H39L47 17V39H17Z M39 9V17H47 M24 22H40M24 30H36',
    input:'M5 24H17M47 24H59 M17 9H47V39H17Z M24 30V22M31 30V17M38 30V26',
    probe:'M5 24H14 M44 21A14 14 0 1 0 16 21A14 14 0 1 0 44 21 M40 31L56 43 M21 24L28 18L34 24L40 15',
    tristate:triangle+' M32 5V16',splitter:'M5 24H26M26 24L47 9H59M26 24H59M26 24L47 39H59 M30 24A4 4 0 1 0 22 24A4 4 0 1 0 30 24',
    half_adder:chip+' M24 24H40M32 16V32',full_adder:chip+' M24 24H40M32 16V32 M28 5H36',adder:chip+' M23 24H41M32 15V33',subtractor:chip+' M23 24H41',multiplier:chip+' M24 16L40 32M24 32L40 16',
    divider:chip+' M23 24H41 M33 15A1 1 0 1 0 31 15A1 1 0 1 0 33 15 M33 33A1 1 0 1 0 31 33A1 1 0 1 0 33 33',
    comparator:chip+' M28 15L21 24L28 33 M36 15L43 24L36 33',shifter:chip+' M22 20H40L35 15M40 20L35 25 M42 30H24L29 25M24 30L29 35',
    dff:chip+' M12 28L19 33L12 38 M24 17H35V31H24Z M28 13V17M28 31V35',rs_latch:chip+' M23 17H40V31H23Z M23 21L40 27M23 27L40 21',jk_ff:chip+' M12 28L19 33L12 38 M23 17H40V31H23Z M23 21L40 27M23 27L40 21',tff:chip+' M12 28L19 33L12 38 M23 18H41M32 18V32',
    register:chip+' M22 24H42L36 18M42 24L36 30',sync_register:chip+' M12 28L19 33L12 38 M23 16H41V32H23Z M29 16V32M35 16V32',shift_register:chip+' M22 15H28V22H22Z M36 26H42V33H36Z M28 18H39V26 M36 23L39 26L42 23',counter:chip+' M22 30V24H28V18H34V12 M38 17V30M34 26L38 30L42 26',
    ram:chip+' M22 15H42V33H22Z M22 21H42M22 27H42M28 15V33M35 15V33',rom:chip+' M22 15H42V33H22Z M22 21H42M22 27H42M28 15V33M35 15V33 M34 24A2 2 0 1 0 30 24A2 2 0 1 0 34 24',
    multiplexer:'M20 7L45 16V32L20 41Z',demultiplexer:'M44 7L19 16V32L44 41Z',decoder:chip+' M22 24H30M30 24L42 15M30 24H42M30 24L42 33',encoder:chip+' M22 15L34 24M22 24H42M22 33L34 24',
    display:'M8 6H56V42H8Z M16 14H25V24H16V34H25 M34 14H44V34H34Z',seven_segment:'M18 5H44L48 9V39L44 43H18L14 39V9Z M22 12H40M22 24H40M22 36H40M20 14V22M42 14V22M20 26V34M42 26V34'};
  const fallback=chip+' M23 17H41V31H23Z M28 17V31M36 17V31';
  function svg(type){return `<svg viewBox="0 0 64 48" aria-hidden="true"><path d="${paths[type]||fallback}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
  const cache=new Map();
  function draw(ctx,c,def,color,accent,signal){
    if(['display','seven_segment','input','probe'].includes(c.type))return;
    let d=paths[c.type]||fallback;if(c.type==='switch'&&signal==='1')d=d.replace('M17 30L43 14','M17 30H43');if(!cache.has(d))cache.set(d,new Path2D(d));
    const scale=Math.min((def.w-30)/64,(def.h-32)/48,1.15);
    ctx.save();ctx.translate(c.x+def.w/2,c.y+def.h/2-4);ctx.rotate(({east:0,south:Math.PI/2,west:Math.PI,north:-Math.PI/2})[c.props.orientation||'east']);ctx.scale(scale,scale);ctx.translate(-32,-24);ctx.lineWidth=2;ctx.strokeStyle=['switch','indicator'].includes(c.type)&&signal==='1'?accent:color;ctx.lineCap='round';ctx.lineJoin='round';
    if(c.type==='indicator'){ctx.globalAlpha=.12;ctx.fillStyle=signal==='1'?accent:color;ctx.beginPath();ctx.arc(32,24,15,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(32,24,15,0,Math.PI*2);ctx.stroke();ctx.font='600 18px Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=ctx.strokeStyle;ctx.fillText(signal,32,25);}else ctx.stroke(cache.get(d));ctx.restore();
  }
  const api={codes:{},paths,svg,draw};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CircuitSymbols=api;
})(typeof globalThis!=='undefined'?globalThis:this);
