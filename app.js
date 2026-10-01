(() => {
  'use strict';

  const canvas = document.getElementById('board');
  const viewport = document.getElementById('boardViewport');
  const ctx = canvas.getContext('2d');
  const paletteList = document.getElementById('paletteList');
  const moduleSearch = document.getElementById('moduleSearch');
  const createCustomBtn = document.getElementById('createCustomBtn');
  const exportCustomBtn = document.getElementById('exportCustomBtn');
  const importCustomBtn = document.getElementById('importCustomBtn');
  const importCustomFile = document.getElementById('importCustomFile');
  const componentLibraryInfo = document.getElementById('componentLibraryInfo');
  const statusText = document.getElementById('statusText');
  const selectionInfo = document.getElementById('selectionInfo');
  const diagnosticsInfo = document.getElementById('diagnosticsInfo');
  const runBtn = document.getElementById('runBtn');
  const tickBtn = document.getElementById('tickBtn');
  const checkBtn = document.getElementById('checkBtn');
  const checkBtnSide = document.getElementById('checkBtnSide');
  const clearCheckBtn = document.getElementById('clearCheckBtn');
  const clearCheckBtnSide = document.getElementById('clearCheckBtnSide');
  const truthBtn = document.getElementById('truthBtn');
  const truthBtnSide = document.getElementById('truthBtnSide');
  const truthInfo = document.getElementById('truthInfo');
  const exportTruthCsvBtn = document.getElementById('exportTruthCsvBtn');
  const exportTruthHtmlBtn = document.getElementById('exportTruthHtmlBtn');
  const exportPngBtn = document.getElementById('exportPngBtn');
  const themeBtn = document.getElementById('themeBtn');
  const sampleBtn = document.getElementById('sampleBtn');
  const clearBtn = document.getElementById('clearBtn');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const loadFile = document.getElementById('loadFile');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const selectToolBtn = document.getElementById('selectTool');
  const wireToolBtn = document.getElementById('wireTool');
  const textToolBtn = document.getElementById('textTool');
  const panToolBtn = document.getElementById('panTool');
  const copyBtn = document.getElementById('copyBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const editBtn = document.getElementById('editBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const zoomSelect = document.getElementById('zoomSelect');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const wireGlowAllToggle = document.getElementById('wireGlowAllToggle');
  const wireGlowLabel = document.getElementById('wireGlowLabel');

  const WORLD_W = 3400;
  const WORLD_H = 2300;
  const GRID = 24;
  const SNAP = 6;
  const HISTORY_LIMIT = 80;

  const WIRE_COLORS = CircuitSchema.COLORS;

  const state = {
    components: [],
    wires: [],
    texts: [],
    nextId: 1,
    selected: null,
    wireStart: null,wireBends:[],busConnect:false,clockHz:1,
    dragging: null,
    selecting: null,
    pendingSelect: null,
    panning: null,
    tool: 'pan',
    running: true,
    clock: false,
    tickNo: 0,
    colorIndex: 0,
    sourceColors: {},
    mouse: { x: 0, y: 0 },
    lastTime: 0,
    zoom: 1,
    undoStack: [],
    redoStack: [],
    clipboard: null,
    renderQueued: false,
    simAccumulator: 0,
    lastAutoRender: 0,
    signalIssues: [],
    showIssueMarkers: false,
    issueFocus: null,
    lastManualCheck: 0,
    simStats: { passes: 0, stable: true, unknown: 0, disconnected: 0, conflicts: 0 },
    truthTable: null,
    suppressHistory: false,
    theme: readStorage('logic_studio_theme', 'light'),
    wireGlowMode: readStorage('logic_studio_wire_glow', 'all'),
    customDefs: []
  };

  const themeCache = new Map();
  const projectTitle = document.getElementById('projectTitle');
  let projectDescription = '';
  let lastSaved = '';
  const navigation=[];
  function readStorage(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
  function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  function pin(id, label, side, y, bit = null) {
    return { id, label, side, y, bit };
  }

  const LIMITS = { minBitWidth: 1, maxBitWidth: 16, minAddressBits: 1, maxAddressBits: 5, maxPins: 96 };

  function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = String(target.tagName || '').toLowerCase();
    return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function parsePositiveRange(rawValue, min, max, currentValue, label) {
    const text = String(rawValue ?? '').trim();
    if (text === '') {
      return { ok: false, value: currentValue, message: `${label} не изменена: поле не должно быть пустым. Допустимый диапазон: ${min}–${max}.` };
    }
    if (!/^-?\d+$/.test(text)) {
      return { ok: false, value: currentValue, message: `${label} не изменена: введите целое число от ${min} до ${max}.` };
    }
    const n = Number.parseInt(text, 10);
    if (n <= 0) {
      return { ok: false, value: currentValue, message: `${label} не изменена: разрядность не может быть отрицательной или равной 0. Минимум: ${min}.` };
    }
    if (n < min || n > max) {
      return { ok: false, value: currentValue, message: `${label} не изменена: допустимый диапазон ${min}–${max}.` };
    }
    return { ok: true, value: n, message: '' };
  }

  function defaultPropsFor(type) {
    if(CircuitExtended.names[type])return CircuitExtended.defaults(type);
    const props = { bitWidth: ['register','display','seven_segment'].includes(type) ? 4 : 1 };
    if (type === 'decoder' || type === 'encoder') props.addressBits = 3;
    if (type === 'multiplexer' || type === 'demultiplexer') props.addressBits = 2;
    if(CircuitExtended.ports.isGate(type)){props.inputCount=2;props.outputCount=1;}
    return props;
  }

  function normalizeComponentProps(comp) {
    if (!comp) return comp;
    comp.state = comp.state || {};
    comp.inputs = comp.inputs || {};
    comp.outputs = comp.outputs || {};
    comp.prevInputs = comp.prevInputs || {};
    comp.props = { ...defaultPropsFor(comp.type), ...(comp.props || {}) };
    comp.props.bitWidth = clampInt(comp.props.bitWidth ?? comp.state.bitWidth, LIMITS.minBitWidth, LIMITS.maxBitWidth, 1);
    if ('addressBits' in defaultPropsFor(comp.type)) {
      comp.props.addressBits = clampInt(comp.props.addressBits ?? comp.state.addressBits, LIMITS.minAddressBits, LIMITS.maxAddressBits, defaultPropsFor(comp.type).addressBits);
    }
    if(CircuitExtended.ports.isGate(comp.type)){comp.props.inputCount=clampInt(comp.props.inputCount,2,16,2);comp.props.outputCount=clampInt(comp.props.outputCount,1,8,1);}
    return comp;
  }

  function bitWidth(comp) { return normalizeComponentProps(comp).props.bitWidth; }
  function addressBits(comp) { return normalizeComponentProps(comp).props.addressBits || defaultPropsFor(comp.type).addressBits || 1; }
  function pinIdForWidth(comp, legacyId, prefix, bit) { return bitWidth(comp) === 1 ? legacyId : `${prefix}${bit}`; }
  function addressPinId(bit) { return ['a','b','c'][bit] || `a${bit}`; }
  function selectorPinId(bit) { return `s${bit}`; }
  function muxDataPinId(group, bit, width) { return width === 1 ? `d${group}` : `d${group}_${bit}`; }
  function muxOutPinId(bit, width) { return width === 1 ? 'y' : `y${bit}`; }
  function demuxDataPinId(bit, width) { return width === 1 ? 'd' : `d${bit}`; }
  function demuxOutPinId(group, bit, width) { return width === 1 ? `y${group}` : `y${group}_${bit}`; }

  function spreadPins(count, makeId, makeLabel, side, start = .16, end = .84) {
    const safeCount = Math.max(0, Math.min(LIMITS.maxPins, count));
    const pins = [];
    for (let i = 0; i < safeCount; i++) {
      const y = safeCount <= 1 ? .5 : start + (end - start) * i / (safeCount - 1);
      pins.push(pin(makeId(i), makeLabel(i), side, y));
    }
    return pins;
  }

  function dynamicPinsFor(comp) {
    if (!comp) return null;
    const t = comp.type;
    const bw = bitWidth(comp);
    if(CircuitExtended.names[t])return CircuitExtended.pins(comp);
    if(CircuitExtended.ports.isGate(t)){if(bw===1&&comp.props.inputCount===2&&comp.props.outputCount===1&&['and','or','xor'].includes(t))return null;return CircuitExtended.ports.pins(comp);}
    if (t === 'not' || t === 'buffer') {
      if (bw === 1) return null;
      return { inputs: spreadPins(bw, i => `a${i}`, i => `A${i}`, 'left'), outputs: spreadPins(bw, i => `y${i}`, i => `Y${i}`, 'right') };
    }
    if (['const0','const1','switch','clock'].includes(t)) {
      const inputs = t === 'clock' ? [pin('en', 'EN', 'left', .5)] : [];
      const outputs = bw === 1 ? [pin('out', t === 'clock' ? 'CLK' : 'OUT', 'right', .5)] : spreadPins(bw, i => `out${i}`, i => t === 'clock' ? `CLK${i}` : `OUT${i}`, 'right');
      return { inputs, outputs };
    }
    if (t === 'variable') {
      if (bw === 1) return null;
      return { inputs: spreadPins(bw, i => `in${i}`, i => `IN${i}`, 'left'), outputs: spreadPins(bw, i => `out${i}`, i => `OUT${i}`, 'right') };
    }
    if (t === 'indicator') {
      if (bw === 1) return null;
      return { inputs: spreadPins(bw, i => `in${i}`, i => `IN${i}`, 'left'), outputs: [] };
    }
    if (t === 'register') {
      return { inputs: spreadPins(bw, i => `d${i}`, i => `D${i}`, 'left'), outputs: spreadPins(bw, i => `q${i}`, i => `Q${i}`, 'right') };
    }
    if (t === 'display' || t === 'seven_segment') {
      return { inputs: spreadPins(bw, i => `d${i}`, i => `D${i}`, 'left'), outputs: [] };
    }
    if (t === 'half_adder') {
      if (bw === 1) return null;
      return {
        inputs: spreadPins(bw * 2, i => i % 2 === 0 ? `a${Math.floor(i/2)}` : `b${Math.floor(i/2)}`, i => i % 2 === 0 ? `A${Math.floor(i/2)}` : `B${Math.floor(i/2)}`, 'left'),
        outputs: [...spreadPins(bw, i => `s${i}`, i => `S${i}`, 'right', .12, .74), pin('c', 'Cout', 'right', .88)]
      };
    }
    if (t === 'full_adder') {
      if (bw === 1) return null;
      const dataInputs = spreadPins(bw * 2, i => i % 2 === 0 ? `a${Math.floor(i/2)}` : `b${Math.floor(i/2)}`, i => i % 2 === 0 ? `A${Math.floor(i/2)}` : `B${Math.floor(i/2)}`, 'left', .10, .78);
      return { inputs: [...dataInputs, pin('cin', 'Cin', 'left', .90)], outputs: [...spreadPins(bw, i => `s${i}`, i => `S${i}`, 'right', .12, .74), pin('cout', 'Cout', 'right', .88)] };
    }
    if (t === 'dff') {
      if (bw === 1) return null;
      return { inputs: [...spreadPins(bw, i => `d${i}`, i => `D${i}`, 'left', .14, .72), pin('clk', 'CLK', 'left', .88)], outputs: [...spreadPins(bw, i => `q${i}`, i => `Q${i}`, 'right', .12, .45), ...spreadPins(bw, i => `nq${i}`, i => `!Q${i}`, 'right', .55, .88)] };
    }
    if (t === 'rs_latch') {
      if (bw === 1) return null;
      return { inputs: spreadPins(bw * 2, i => i % 2 === 0 ? `s${Math.floor(i/2)}` : `r${Math.floor(i/2)}`, i => i % 2 === 0 ? `S${Math.floor(i/2)}` : `R${Math.floor(i/2)}`, 'left'), outputs: [...spreadPins(bw, i => `q${i}`, i => `Q${i}`, 'right', .12, .45), ...spreadPins(bw, i => `nq${i}`, i => `!Q${i}`, 'right', .55, .88)] };
    }
    if (t === 'jk_ff') {
      if (bw === 1) return null;
      const dataInputs = spreadPins(bw * 2, i => i % 2 === 0 ? `j${Math.floor(i/2)}` : `k${Math.floor(i/2)}`, i => i % 2 === 0 ? `J${Math.floor(i/2)}` : `K${Math.floor(i/2)}`, 'left', .10, .78);
      return { inputs: [...dataInputs, pin('clk', 'CLK', 'left', .90)], outputs: [...spreadPins(bw, i => `q${i}`, i => `Q${i}`, 'right', .12, .45), ...spreadPins(bw, i => `nq${i}`, i => `!Q${i}`, 'right', .55, .88)] };
    }
    if (t === 'decoder') {
      const n = addressBits(comp);
      const outs = 1 << n;
      return { inputs: spreadPins(n, i => addressPinId(i), i => `A${i}`, 'left'), outputs: spreadPins(outs, i => `y${i}`, i => `Y${i}`, 'right', .07, .93) };
    }
    if (t === 'encoder') {
      const n = addressBits(comp);
      const ins = 1 << n;
      return { inputs: spreadPins(ins, i => `i${i}`, i => `I${i}`, 'left', .07, .93), outputs: spreadPins(n, i => addressPinId(i), i => `A${i}`, 'right') };
    }
    if (t === 'multiplexer') {
      const n = addressBits(comp);
      const groups = 1 << n;
      const dataInputs = [];
      for (let d = 0; d < groups; d++) for (let b = 0; b < bw; b++) dataInputs.push([d,b]);
      const inputs = spreadPins(dataInputs.length, i => muxDataPinId(dataInputs[i][0], dataInputs[i][1], bw), i => bw === 1 ? `D${dataInputs[i][0]}` : `D${dataInputs[i][0]}.${dataInputs[i][1]}`, 'left', .07, .86);
      const selectors = spreadPins(n, i => selectorPinId(i), i => `S${i}`, 'bottom', .32, .72);
      const outputs = bw === 1 ? [pin('y', 'Y', 'right', .5)] : spreadPins(bw, i => `y${i}`, i => `Y${i}`, 'right');
      return { inputs: [...inputs, ...selectors], outputs };
    }
    if (t === 'demultiplexer') {
      const n = addressBits(comp);
      const groups = 1 << n;
      const dataInputs = bw === 1 ? [pin('d', 'D', 'left', .5)] : spreadPins(bw, i => `d${i}`, i => `D${i}`, 'left', .12, .42);
      const selectors = spreadPins(n, i => selectorPinId(i), i => `S${i}`, 'bottom', .32, .72);
      const outPairs = [];
      for (let d = 0; d < groups; d++) for (let b = 0; b < bw; b++) outPairs.push([d,b]);
      const outputs = spreadPins(outPairs.length, i => demuxOutPinId(outPairs[i][0], outPairs[i][1], bw), i => bw === 1 ? `Y${outPairs[i][0]}` : `Y${outPairs[i][0]}.${outPairs[i][1]}`, 'right', .07, .93);
      return { inputs: [...dataInputs, ...selectors], outputs };
    }
    return null;
  }

  function dynamicNameFor(comp, base) {
    const t = comp.type;
    const bw = bitWidth(comp);
    if (t === 'decoder') return `Дешифратор ${addressBits(comp)}→${1 << addressBits(comp)}`;
    if (t === 'encoder') return `Шифратор ${1 << addressBits(comp)}→${addressBits(comp)}`;
    if (t === 'multiplexer') return `Мультиплексор ${1 << addressBits(comp)}→1${bw > 1 ? `, ${bw} бит` : ''}`;
    if (t === 'demultiplexer') return `Демультиплексор 1→${1 << addressBits(comp)}${bw > 1 ? `, ${bw} бит` : ''}`;
    if (bw > 1 && !['decoder','encoder'].includes(t)) return `${base.name} · ${bw} бит`;
    return base.name;
  }

  function buildDynamicDef(comp) {
    const base = defs[comp.type];
    if (!base) return null;
    normalizeComponentProps(comp);
    const pins = dynamicPinsFor(comp);
    const def = pins ? { ...base, inputs: pins.inputs, outputs: pins.outputs } : { ...base };
    def.name = dynamicNameFor(comp, base);
    if(CircuitExtended.ports.isGate(comp.type))def.desc=CircuitExtended.ports.description(comp);
    const pinCount = Math.max((def.inputs || []).filter(p => p.side === 'left').length, (def.outputs || []).filter(p => p.side === 'right').length);
    const bottomCount = (def.inputs || []).filter(p => p.side === 'bottom').length + (def.outputs || []).filter(p => p.side === 'bottom').length;
    def.h = comp.type==='contact'?20:Math.max(base.h || 70, 52 + pinCount * 16, bottomCount ? 100 : 0);
    def.w = comp.type==='contact'?20:Math.max(base.w || 100, bottomCount > 2 ? 156 : 0, (comp.type === 'encoder' ? 138 : 0));
    const rotation=comp.props.orientation||'east';
    const orient=p=>{
      if(rotation==='east')return p;
      const sides={south:{left:'top',right:'bottom',top:'right',bottom:'left'},west:{left:'right',right:'left',top:'bottom',bottom:'top'},north:{left:'bottom',right:'top',top:'left',bottom:'right'}};
      const flip=rotation==='west'||(rotation==='south'&&['left','right'].includes(p.side))||(rotation==='north'&&['top','bottom'].includes(p.side));
      return{...p,side:sides[rotation][p.side],y:flip?1-p.y:p.y};
    };
    def.inputs=def.inputs.map(orient);def.outputs=def.outputs.map(orient);
    if(['north','south'].includes(rotation)){const width=def.w;def.w=def.h;def.h=width;}
    return def;
  }

  function cleanInvalidWires(componentId = null) {
    let removed = 0;
    state.wires = (state.wires || []).filter(w => {
      if (!w || !w.from || !w.to) { removed++; return false; }
      if (componentId && w.from.cid !== componentId && w.to.cid !== componentId) return true;
      const from = getComp(w.from.cid);
      const to = getComp(w.to.cid);
      if (!from || !to) { removed++; return false; }
      const fromOk = getPins(from, 'out').some(p => p.id === w.from.pid);
      const toOk = getPins(to, 'in').some(p => p.id === w.to.pid);
      if (!fromOk || !toOk) { removed++; return false; }
      return true;
    });
    return removed;
  }

  const defs = {
    and: { group: 'GATES', name: 'И', img: 'and.png', w: 92, h: 62, inputs: [pin('a', 'A', 'left', .35), pin('b', 'B', 'left', .65)], outputs: [pin('y', 'Y', 'right', .5)] },
    or: { group: 'GATES', name: 'ИЛИ', img: 'or.png', w: 92, h: 62, inputs: [pin('a', 'A', 'left', .35), pin('b', 'B', 'left', .65)], outputs: [pin('y', 'Y', 'right', .5)] },
    xor: { group: 'GATES', name: 'Исключающее ИЛИ', img: 'xor.png', w: 96, h: 62, inputs: [pin('a', 'A', 'left', .35), pin('b', 'B', 'left', .65)], outputs: [pin('y', 'Y', 'right', .5)] },
    not: { group: 'GATES', name: 'НЕ', img: 'not.png', w: 92, h: 62, inputs: [pin('a', 'A', 'left', .5)], outputs: [pin('y', 'Y', 'right', .5)] },
    buffer: { group: 'GATES', name: 'Буфер', img: 'buffer.png', w: 92, h: 62, inputs: [pin('a', 'A', 'left', .5)], outputs: [pin('y', 'Y', 'right', .5)] },

    const0: { group: 'BASIC', name: 'Константа 0', img: 'const0.png', w: 90, h: 62, inputs: [], outputs: [pin('out', '0', 'right', .5)] },
    const1: { group: 'BASIC', name: 'Константа 1', img: 'const1.png', w: 90, h: 62, inputs: [], outputs: [pin('out', '1', 'right', .5)] },
    switch: { group: 'BASIC', name: 'Переключатель', img: 'switch.png', w: 92, h: 66, inputs: [], outputs: [pin('out', 'OUT', 'right', .5)] },
    indicator: { group: 'BASIC', name: 'Индикатор', img: 'indicator.png', w: 110, h: 72, inputs: [pin('in', 'IN', 'left', .5)], outputs: [] },
    clock: { group: 'BASIC', name: 'Тактовый генератор', img: 'clock.png', w: 90, h: 66, inputs: [pin('en', 'EN', 'left', .5)], outputs: [pin('out', 'CLK', 'right', .5)] },
    variable: { group: 'BASIC', name: 'Переменная', img: 'variable.png', w: 112, h: 58, inputs: [pin('in', 'IN', 'left', .5)], outputs: [pin('out', 'OUT', 'right', .5)] },

    half_adder: { group: 'ADDER', name: 'Полусумматор', img: 'half_adder.png', w: 128, h: 70, inputs: [pin('a', 'A', 'left', .35), pin('b', 'B', 'left', .65)], outputs: [pin('s', 'S', 'right', .35), pin('c', 'C', 'right', .65)] },
    full_adder: { group: 'ADDER', name: 'Полный сумматор', img: 'full_adder.png', w: 138, h: 78, inputs: [pin('a', 'A', 'left', .25), pin('b', 'B', 'left', .50), pin('cin', 'Cin', 'left', .75)], outputs: [pin('s', 'S', 'right', .35), pin('cout', 'Cout', 'right', .65)] },

    dff: { group: 'MEMORY', name: 'D-триггер', img: 'dff.png', w: 118, h: 74, inputs: [pin('d', 'D', 'left', .35), pin('clk', 'CLK', 'left', .65)], outputs: [pin('q', 'Q', 'right', .35), pin('nq', '!Q', 'right', .65)] },
    rs_latch: { group: 'MEMORY', name: 'RS-триггер', img: 'rs_latch.png', w: 126, h: 74, inputs: [pin('s', 'S', 'left', .35), pin('r', 'R', 'left', .65)], outputs: [pin('q', 'Q', 'right', .35), pin('nq', '!Q', 'right', .65)] },
    jk_ff: { group: 'MEMORY', name: 'JK-триггер', img: 'jk_ff.png', w: 126, h: 82, inputs: [pin('j', 'J', 'left', .25), pin('clk', 'CLK', 'left', .50), pin('k', 'K', 'left', .75)], outputs: [pin('q', 'Q', 'right', .35), pin('nq', '!Q', 'right', .65)] },
    register: { group: 'MEMORY', name: 'Регистр 4 бит', img: 'register.png', w: 138, h: 96, inputs: [pin('d0', 'D0', 'left', .20), pin('d1', 'D1', 'left', .40), pin('d2', 'D2', 'left', .60), pin('d3', 'D3', 'left', .80)], outputs: [pin('q0', 'Q0', 'right', .20), pin('q1', 'Q1', 'right', .40), pin('q2', 'Q2', 'right', .60), pin('q3', 'Q3', 'right', .80)] },

    multiplexer: { group: 'CODE CONVERTER', name: 'Мультиплексор 4→1', img: 'multiplexer.png', w: 136, h: 112, inputs: [pin('d0', 'D0', 'left', .17), pin('d1', 'D1', 'left', .32), pin('d2', 'D2', 'left', .47), pin('d3', 'D3', 'left', .62), pin('s0', 'S0', 'bottom', .42), pin('s1', 'S1', 'bottom', .66)], outputs: [pin('y', 'Y', 'right', .40)] },
    demultiplexer: { group: 'CODE CONVERTER', name: 'Демультиплексор 1→4', img: 'demultiplexer.png', w: 136, h: 112, inputs: [pin('d', 'D', 'left', .42), pin('s0', 'S0', 'bottom', .42), pin('s1', 'S1', 'bottom', .66)], outputs: [pin('y0', 'Y0', 'right', .17), pin('y1', 'Y1', 'right', .32), pin('y2', 'Y2', 'right', .47), pin('y3', 'Y3', 'right', .62)] },
    decoder: { group: 'CODE CONVERTER', name: 'Дешифратор 3→8', img: 'decoder.png', w: 148, h: 142, inputs: [pin('a', 'A0', 'left', .30), pin('b', 'A1', 'left', .50), pin('c', 'A2', 'left', .70)], outputs: [pin('y0', 'Y0', 'right', .11), pin('y1', 'Y1', 'right', .22), pin('y2', 'Y2', 'right', .33), pin('y3', 'Y3', 'right', .44), pin('y4', 'Y4', 'right', .55), pin('y5', 'Y5', 'right', .66), pin('y6', 'Y6', 'right', .77), pin('y7', 'Y7', 'right', .88)] },
    encoder: { group: 'CODE CONVERTER', name: 'Шифратор 8→3', img: null, w: 138, h: 142, inputs: spreadPins(8, i => `i${i}`, i => `I${i}`, 'left', .07, .93), outputs: spreadPins(3, i => addressPinId(i), i => `A${i}`, 'right') },

    seven_segment: { group: 'ADVANCED OUTPUT', name: 'Сегментный дисплей', img: 'seven_segment.png', w: 136, h: 92, inputs: [pin('d0','D0','left',.24), pin('d1','D1','left',.42), pin('d2','D2','left',.60), pin('d3','D3','left',.78)], outputs: [] },
    display: { group: 'ADVANCED OUTPUT', name: 'Числовой дисплей', img: 'display.png', w: 130, h: 82, inputs: [pin('d0','D0','left',.24), pin('d1','D1','left',.42), pin('d2','D2','left',.60), pin('d3','D3','left',.78)], outputs: [] }
  };


  Object.assign(defs,CircuitExtended.definitions());
  defs.register.name='Шина передачи (legacy)';
  defs.register.desc='Передаёт D в Q без памяти. Совместимость старых схем. Для хранения используйте тактовый регистр.';

  const groupLabels = {
    'BASIC': 'Ввод и вывод',
    'GATES': 'Логические элементы',
    'ADDER': 'СУММАТОРЫ',
    'MEMORY': 'ПАМЯТЬ',
    'ARITHMETIC':'Арифметика',
    'USER COMPONENTS':'Подсхемы',
    'CODE CONVERTER': 'Преобразователи',
    'ADVANCED OUTPUT': 'ДИСПЛЕИ'
  };


  const moduleDescriptions = {
    and: 'Входы: 2 · выходы: 1. Логическое И: выдаёт 1 только когда оба входа равны 1.',
    or: 'Входы: 2 · выходы: 1. Логическое ИЛИ: выдаёт 1, если хотя бы один вход равен 1.',
    xor: 'Входы: 2 · выходы: 1. Исключающее ИЛИ: выдаёт 1, когда входы различаются.',
    not: 'Входы: 1 · выходы: 1. Логическое НЕ: инвертирует входной сигнал.',
    buffer: 'Входы: 1 · выходы: 1. Буфер: передаёт входной сигнал без изменения.',
    const0: 'Входы: 0 · выходы: 1. Константа 0: постоянный логический уровень 0.',
    const1: 'Входы: 0 · выходы: 1. Константа 1: постоянный логический уровень 1.',
    switch: 'Входы: 0 · выходы: 1. Переключатель: вручную выдаёт 0 или 1.',
    indicator: 'Входы: 1 · выходы: 0. Индикатор: показывает состояние входного сигнала.',
    clock: 'Входы: 1 · выходы: 1. Тактовый генератор: формирует CLK; вход EN может разрешать генерацию.',
    variable: 'Входы: 1 · выходы: 1. Подключаемая переменная/метка: показывает имя сигнала и передаёт его дальше через OUT.',
    half_adder: 'Входы: 2 · выходы: 2. Полусумматор: складывает два бита и выдаёт сумму S и перенос C.',
    full_adder: 'Входы: 3 · выходы: 2. Полный сумматор: складывает A, B и входной перенос Cin.',
    dff: 'Входы: 2 · выходы: 2. D-триггер: запоминает D по фронту CLK и выдаёт Q/!Q.',
    rs_latch: 'Входы: 2 · выходы: 2. RS-триггер: S устанавливает, R сбрасывает, выходы Q/!Q.',
    jk_ff: 'Входы: 3 · выходы: 2. JK-триггер: J устанавливает, K сбрасывает, J=K=1 переключает.',
    register: 'Шина передачи для совместимости: D передаётся в Q без хранения. Для памяти используйте тактовый регистр.',
    multiplexer: 'Мультиплексор выбирает один из информационных входов D по адресным входам S. Поддерживает изменение адресной разрядности и разрядности данных.',
    demultiplexer: 'Демультиплексор передаёт вход D на один из выходов Y по адресным входам S. Поддерживает изменение адресной разрядности и разрядности данных.',
    decoder: 'Дешифратор включает один из выходов Y по двоичному адресу A. A0 — младший разряд.',
    encoder: 'Шифратор преобразует активный вход I в двоичный код A. Ожидает один активный вход; при нескольких активных входах показывает предупреждение.',
    seven_segment: 'Входы: 4 · выходы: 0. Сегментный дисплей: отображает цифру по D0–D3.',
    display: 'Входы: 4 · выходы: 0. Числовой дисплей: показывает число по D0–D3 в DEC, HEX или BIN.'
  };

  Object.entries(moduleDescriptions).forEach(([type, desc]) => { if (defs[type]) defs[type].desc = desc; });


  function loadImages() { return Promise.resolve(); }

  function snapshot() {
    return JSON.stringify({
      title: projectTitle.value, description: projectDescription,customDefs:state.customDefs,
      components: state.components,
      wires: state.wires,
      texts: state.texts,
      nextId: state.nextId,
      colorIndex: state.colorIndex,
      sourceColors: state.sourceColors,
      clock: state.clock,
      tickNo: state.tickNo,
      theme: state.theme,
      wireGlowMode: state.wireGlowMode
    });
  }

  function restoreSnapshot(raw) {
    const data = JSON.parse(raw);
    projectTitle.value = data.title || 'Новая схема';
    projectDescription = data.description || '';
    updateReport();
    state.truthTable = null; updateTruthPanel();
    state.components = (data.components || []).map(c => normalizeComponentProps(c));
    state.wires = data.wires || [];
    state.texts = data.texts || [];
    state.nextId = data.nextId || 1;
    state.colorIndex = data.colorIndex || 0;
    state.sourceColors = data.sourceColors || {};
    installCustomDefs(data.customDefs||[]);
    removeUnsupportedComponents();
    cleanInvalidWires();
    state.clock = !!data.clock;
    state.tickNo = data.tickNo || 0;
    if (data.theme) setTheme(data.theme);
    if (data.wireGlowMode) setWireGlowMode(data.wireGlowMode);
    state.selected = null;
    state.wireStart = null;
    state.dragging = null;
    state.selecting = null;
    simulate();
    updateHistoryButtons();
  }

  function pushHistory() {
    if (state.suppressHistory) return;
    state.truthTable = null; updateTruthPanel();
    state.undoStack.push(snapshot());
    if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }

  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(snapshot());
    restoreSnapshot(state.undoStack.pop());
    setStatus('Действие отменено.');
  }

  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(snapshot());
    restoreSnapshot(state.redoStack.pop());
    setStatus('Действие повторено.');
  }

  function updateHistoryButtons() {
    undoBtn.disabled = state.undoStack.length === 0;
    redoBtn.disabled = state.redoStack.length === 0;
  }

  function buildPalette() {
    paletteList.innerHTML = '';
    const groups = {};
    Object.entries(defs).forEach(([type, def]) => {
      groups[def.group] ||= [];
      groups[def.group].push([type, def]);
    });
    for (const [group, items] of Object.entries(groups)) {
      const wrap = document.createElement('div');
      wrap.className = 'category';
      wrap.dataset.group = `${group} ${groupLabels[group] || ''}`.toLowerCase();
      wrap.innerHTML = `<h3>${groupLabels[group] || group}</h3>`;
      const grid = document.createElement('div');
      grid.className = 'palette-grid';
      for (const [type, def] of items) {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.type = type;
        item.className = 'palette-item' + (def.custom ? ' custom-component' : '');
        item.title = def.desc || def.name;
        item.dataset.search = [type, def.name, def.group, groupLabels[def.group] || '', def.desc || ''].join(' ').toLowerCase();
        item.innerHTML = `<span class="palette-symbol">${CircuitSymbols.svg(type)}</span><span>${escapeHTML(def.name)}<small>${(def.inputs||[]).length} вход. · ${(def.outputs||[]).length} вых.</small></span>`;
        item.addEventListener('click', () => addComponent(type));
        grid.appendChild(item);
      }
      wrap.appendChild(grid);
      paletteList.appendChild(wrap);
    }
    const empty = document.createElement('div');
    empty.id = 'paletteEmpty';
    empty.className = 'palette-empty';
    empty.textContent = 'Ничего не найдено. Попробуй другое название: И, НЕ, дисплей, регистр, триггер.';
    paletteList.appendChild(empty);
    document.getElementById('moduleCount').textContent = Object.keys(defs).length;
    applyModuleSearch();
  }

  function applyModuleSearch() {
    if (!paletteList) return;
    const query = (moduleSearch?.value || '').trim().toLowerCase();
    let visibleCount = 0;
    paletteList.querySelectorAll('.category').forEach(category => {
      let categoryVisible = false;
      category.querySelectorAll('.palette-item').forEach(item => {
        const matches = !query || item.dataset.search.includes(query) || category.dataset.group.includes(query);
        item.classList.toggle('hidden', !matches);
        if (matches) { categoryVisible = true; visibleCount++; }
      });
      category.classList.toggle('hidden', !categoryVisible);
    });
    const empty = document.getElementById('paletteEmpty');
    if (empty) empty.classList.toggle('visible', visibleCount === 0);
  }

  function addComponent(type, x = null, y = null) {
    pushHistory();
    const def = defs[type];
    showPanel('properties');
    const viewX = viewport.scrollLeft / state.zoom + viewport.clientWidth / (2 * state.zoom);
    const viewY = viewport.scrollTop / state.zoom + viewport.clientHeight / (2 * state.zoom);
    const comp = {
      id: 'm' + state.nextId++, type,
      x: snap(x ?? viewX - def.w / 2 + Math.random() * 35),
      y: snap(y ?? viewY - def.h / 2 + Math.random() * 35),
      state: defaultState(type), props: defaultPropsFor(type), inputs: {}, outputs: {}, prevInputs: {}
    };
    normalizeComponentProps(comp);
    if (type === 'variable') {
      const label = prompt('Имя подключаемой переменной:', comp.state.label || 'X');
      if (label !== null && label.trim()) comp.state.label = label.trim().slice(0, 12);
    }
    state.components.push(comp);
    state.selected = { kind: 'component', id: comp.id };
    setTool('select');
    simulate();
    setStatus(`Добавлен модуль: ${def.name}`);
  }

  function defaultState(type) {
    if(type==='input')return{value:0};
    if(['ram','rom'].includes(type))return{memory:[],lastClkHigh:false};
    if(CircuitExtended.sequential.has(type))return{value:0,lastClkHigh:false};
    if (type === 'switch') return { on: false };
    if (type === 'variable') return { label: 'X', on: false };
    if (['dff','rs_latch','jk_ff'].includes(type)) return { q: '0', lastClkHigh: false };
    if (type === 'register') return { bits: ['0','0','0','0'] };
    if (type === 'display') return { mode: 'dec' };
    if (type === 'seven_segment') return { mode: 'dec' };
    return {};
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (WORLD_W * WORLD_H * state.zoom ** 2))); // ограничиваем DPR, чтобы большая доска не тормозила на высоком масштабе
    const cssW = Math.floor(WORLD_W * state.zoom);
    const cssH = Math.floor(WORLD_H * state.zoom);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    ctx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
    draw();
  }

  function setZoom(value, anchorEvent = null) {
    const next = Math.max(0.1, Math.min(3, Number(value) || 1));
    if (next === state.zoom) return;

    let anchorWorldX;
    let anchorWorldY;
    let anchorViewportX;
    let anchorViewportY;

    if (anchorEvent) {
      const rect = viewport.getBoundingClientRect();
      anchorViewportX = anchorEvent.clientX - rect.left;
      anchorViewportY = anchorEvent.clientY - rect.top;
      anchorWorldX = (viewport.scrollLeft + anchorViewportX) / state.zoom;
      anchorWorldY = (viewport.scrollTop + anchorViewportY) / state.zoom;
    } else {
      anchorViewportX = viewport.clientWidth / 2;
      anchorViewportY = viewport.clientHeight / 2;
      anchorWorldX = (viewport.scrollLeft + anchorViewportX) / state.zoom;
      anchorWorldY = (viewport.scrollTop + anchorViewportY) / state.zoom;
    }

    state.zoom = next;
    zoomSelect.value = String(next);
    resizeCanvas();
    viewport.scrollLeft = anchorWorldX * state.zoom - anchorViewportX;
    viewport.scrollTop = anchorWorldY * state.zoom - anchorViewportY;
    setStatus(`Масштаб: ${Math.round(state.zoom * 100)}%.`);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / state.zoom, y: (e.clientY - rect.top) / state.zoom };
  }

  function snap(v) { return Math.round(v / SNAP) * SNAP; }
  function getDef(comp) {
    if (!comp) return null;
    if (typeof comp === 'string') return defs[comp] || null;
    return buildDynamicDef(comp);
  }
  let simulationMap=null;
  function getComp(id) { return simulationMap?simulationMap.get(id):state.components.find(c => c.id === id); }
  function getText(id) { return state.texts.find(t => t.id === id); }

  function removeUnsupportedComponents() {
    const supported = new Set(Object.keys(defs).filter(type => defs[type]));
    const removed = new Set();
    state.components = (state.components || []).filter(c => {
      const ok = c && supported.has(c.type);
      if (!ok && c && c.id) removed.add(c.id);
      return ok;
    });
    if (removed.size) {
      state.wires = (state.wires || []).filter(w => w && w.from && w.to && !removed.has(w.from.cid) && !removed.has(w.to.cid));
    }
    return removed.size;
  }

  function getPins(comp, dir = null) {
    if (!comp) return [];
    const def = getDef(comp);
    const arr = [];
    if (!def) return arr;
    for (const p of (def.inputs || [])) arr.push({ ...p, dir: 'in' });
    for (const p of (def.outputs || [])) arr.push({ ...p, dir: 'out' });
    return dir ? arr.filter(p => p.dir === dir) : arr;
  }

  function pinPos(comp, pinDef) {
    const def = getDef(comp);
    if (pinDef.side === 'top' || pinDef.side === 'bottom') {
      return {
        x: comp.x + def.w * pinDef.y,
        y: comp.y + (pinDef.side === 'top' ? 0 : def.h)
      };
    }
    return {
      x: comp.x + (pinDef.side === 'left' ? 0 : def.w),
      y: comp.y + def.h * pinDef.y
    };
  }

  function hitTestPin(pos) {
    for (let i = state.components.length - 1; i >= 0; i--) {
      const comp = state.components[i];
      for (const p of getPins(comp)) {
        const pp = pinPos(comp, p);
        if (Math.hypot(pos.x - pp.x, pos.y - pp.y) <= 9) return { comp, pin: p };
      }
    }
    return null;
  }

  function hitTestComponent(pos) {
    for (let i = state.components.length - 1; i >= 0; i--) {
      const comp = state.components[i];
      const def = getDef(comp);
      if (!def) continue;
      if (pos.x >= comp.x && pos.x <= comp.x + def.w && pos.y >= comp.y && pos.y <= comp.y + def.h) return comp;
    }
    return null;
  }

  function textBounds(t) {
    ctx.save();
    ctx.font = `${t.size || 18}px Arial`;
    const width = Math.max(30, ctx.measureText(t.text || '').width);
    ctx.restore();
    return { x: t.x - 5, y: t.y - (t.size || 18), w: width + 10, h: (t.size || 18) + 10 };
  }

  function hitTestText(pos) {
    for (let i = state.texts.length - 1; i >= 0; i--) {
      const t = state.texts[i];
      const b = textBounds(t);
      if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) return t;
    }
    return null;
  }

  function hitTestWire(pos) {
    let found = null;
    for (const wire of state.wires) {
      const points = wirePoints(wire);
      for (let i=0; i<points.length-1; i++) {
        if (distanceToSegment(pos, points[i], points[i+1]) < 7) found = wire;
      }
    }
    return found;
  }

  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx*dx + dy*dy;
    if (!len2) return Math.hypot(p.x-a.x, p.y-a.y);
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy)/len2));
    return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy));
  }

  function connect(a, b) {
    const out = a?.pin.dir === 'out' ? a : b?.pin.dir === 'out' ? b : null;
    const inn = a?.pin.dir === 'in' ? a : b?.pin.dir === 'in' ? b : null;
    if (!out || !inn || out.comp.id === inn.comp.id) {
      setStatus('Соединение должно идти от выхода одного модуля к входу другого.');
      return;
    }
    const series=(component,dir,p)=>{
      const m=p.id.match(/^(.+?)(\d+)$/);if(!m)return[p];
      return getPins(component,dir).filter(pin=>{const n=pin.id.match(/^(.+?)(\d+)$/);return n&&n[1]===m[1];}).sort((a,b)=>Number(a.id.match(/\d+$/)[0])-Number(b.id.match(/\d+$/)[0]));
    };
    const outs=state.busConnect?series(out.comp,'out',out.pin):[out.pin];
    const ins=state.busConnect?series(inn.comp,'in',inn.pin):[inn.pin];
    if(outs.length!==ins.length){setStatus(`Разрядности жгутов не совпадают: ${outs.length} и ${ins.length}.`);return;}
    pushHistory();const route=state.wireStart?.pin.dir==='out'?state.wireBends:[...state.wireBends].reverse();
    const busKey=`${out.comp.id}:${outs[0].id}`;
    const busColor=state.sourceColors[busKey]||WIRE_COLORS[state.colorIndex++%WIRE_COLORS.length];
    outs.forEach((pin,i)=>{
      state.wires=state.wires.filter(w=>!(w.to.cid===inn.comp.id&&w.to.pid===ins[i].id));
      const sourceKey=`${out.comp.id}:${pin.id}`;state.sourceColors[sourceKey] ||= busColor;
      state.wires.push({id:'w'+state.nextId++,from:{cid:out.comp.id,pid:pin.id},to:{cid:inn.comp.id,pid:ins[i].id},color:state.sourceColors[sourceKey],...(route.length?{bends:structuredClone(route)}:{})});
    });state.wireBends=[];
    state.wireStart = null;
    state.issueFocus = null;
    state.selected = null;
    simulate();
    setStatus('Провод добавлен. Цвет закреплён за выходом-источником.');
  }

  function wirePoints(wire) {
    const fromComp = getComp(wire.from.cid);
    const toComp = getComp(wire.to.cid);
    if (!fromComp || !toComp) return [];
    const fromPin = getPins(fromComp, 'out').find(p => p.id === wire.from.pid);
    const toPin = getPins(toComp, 'in').find(p => p.id === wire.to.pid);
    if (!fromPin || !toPin) return [];
    const a = pinPos(fromComp, fromPin);
    const b = pinPos(toComp, toPin);
    if(wire.bends?.length){const anchors=[a,...wire.bends,b],points=[a];for(let i=1;i<anchors.length;i++){points.push({x:anchors[i].x,y:anchors[i-1].y},anchors[i]);}return points;}
    const indexOffset = (hashCode(wire.id) % 7 - 3) * 6;
    const midX = Math.round((a.x + b.x) / 2 + indexOffset);
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }

  function hashCode(s) {
    let h = 0;
    for (let i=0; i<s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function setStatus(text) { statusText.textContent = text; }
  const SIG = { ZERO: '0', ONE: '1', X: 'X', Z: 'Z' };

  function toSignal(v) {
    if (v === SIG.ONE || v === true || v === 1) return SIG.ONE;
    if (v === SIG.ZERO || v === false || v === 0) return SIG.ZERO;
    if (v === SIG.X || v === 'x' || v === 'unknown') return SIG.X;
    return SIG.Z;
  }

  function bool(v) { return toSignal(v) === SIG.ONE; }
  function signalText(v) { return toSignal(v); }
  function signalKnown(v) { return toSignal(v) === SIG.ZERO || toSignal(v) === SIG.ONE; }
  function signalUnknown(v) { return toSignal(v) === SIG.X || toSignal(v) === SIG.Z; }
  function getInputSignal(comp, id) { return toSignal((comp.inputs || {})[id]); }
  function getInput(comp, id) { return bool(getInputSignal(comp, id)); }
  function hasInput(comp, id) { return Object.prototype.hasOwnProperty.call(comp.inputs || {}, id) && getInputSignal(comp, id) !== SIG.Z; }
  function setOut(comp, id, v) { comp.outputs[id] = toSignal(v); }
  function sigNot(a) { a = toSignal(a); if (a === SIG.ONE) return SIG.ZERO; if (a === SIG.ZERO) return SIG.ONE; return SIG.X; }
  function sigAnd(...vals) { vals = vals.map(toSignal); if (vals.includes(SIG.ZERO)) return SIG.ZERO; if (vals.some(signalUnknown)) return SIG.X; return SIG.ONE; }
  function sigOr(...vals) { vals = vals.map(toSignal); if (vals.includes(SIG.ONE)) return SIG.ONE; if (vals.some(signalUnknown)) return SIG.X; return SIG.ZERO; }
  function sigXor(...vals) { vals = vals.map(toSignal); if (vals.some(signalUnknown)) return SIG.X; return vals.filter(v => v === SIG.ONE).length % 2 ? SIG.ONE : SIG.ZERO; }
  function sigEq(a, b) { a = toSignal(a); b = toSignal(b); if (signalUnknown(a) || signalUnknown(b)) return SIG.X; return a === b ? SIG.ONE : SIG.ZERO; }
  function signalNum(v) { const s = toSignal(v); return s === SIG.ONE ? 1 : s === SIG.ZERO ? 0 : NaN; }
  function cssVar(name, fallback) {
    if (!themeCache.has(name)) themeCache.set(name, getComputedStyle(document.body).getPropertyValue(name).trim() || fallback);
    return themeCache.get(name);
  }

  function addIssue(type, message, detail = '', target = null, fix = '') {
    state.signalIssues.push({ type, message, detail, target, fix });
  }

  function mergeSignals(existing, incoming, targetLabel, driverLabel, target = null) {
    const a = toSignal(existing);
    const b = toSignal(incoming);
    if (a === SIG.Z) return b;
    if (b === SIG.Z) return a;
    if (a === b) return a;
    if ((a === SIG.ZERO && b === SIG.ONE) || (a === SIG.ONE && b === SIG.ZERO)) {
      state.simStats.conflicts++;
      addIssue('conflict', `Конфликт на входе ${targetLabel}`, `Одновременно приходят 0 и 1; последний источник: ${driverLabel}`, target, 'Оставьте для этого входа один источник сигнала или добавьте логический элемент для объединения сигналов.');
      return SIG.X;
    }
    return SIG.X;
  }

  function outputSnapshot() {
    return state.components.map(c => `${c.id}:${Object.keys(c.outputs || {}).sort().map(k => `${k}=${toSignal(c.outputs[k])}`).join('|')}`).join(';');
  }

  function resetInputBus() {
    state.components.forEach(c => {
      c.prevInputs = { ...(c.inputs || {}) };
      c.inputs = {};
      c.inputDrivers = {};
    });
  }

  function propagateWires() {
    resetInputBus();
    for (const w of state.wires) {
      const from = getComp(w.from.cid);
      const to = getComp(w.to.cid);
      if (!from || !to) {
        addIssue('broken', `Провод ${w.id} ссылается на удалённый модуль`, 'Удалите этот провод или пересоздайте соединение.', { kind: 'wire', id: w.id }, 'Удалите повреждённый провод и проведите соединение заново.');
        continue;
      }
      const fromPinOk = getPins(from, 'out').some(p => p.id === w.from.pid);
      const toPinOk = getPins(to, 'in').some(p => p.id === w.to.pid);
      if (!fromPinOk || !toPinOk) {
        addIssue('broken', `Провод ${w.id} подключён к несуществующему пину`, `${w.from.cid}.${w.from.pid} → ${w.to.cid}.${w.to.pid}`, { kind: 'wire', id: w.id }, 'Удалите повреждённый провод или измените разрядность элемента обратно.');
        continue;
      }
      const driver = `${from.id}.${w.from.pid}`;
      const target = `${to.id}.${w.to.pid}`;
      const incoming = toSignal((from.outputs || {})[w.from.pid]);
      const old = Object.prototype.hasOwnProperty.call(to.inputs, w.to.pid) ? to.inputs[w.to.pid] : SIG.Z;
      to.inputs[w.to.pid] = mergeSignals(old, incoming, target, driver, { kind: 'pin', cid: to.id, pid: w.to.pid });
      to.inputDrivers[w.to.pid] = (to.inputDrivers[w.to.pid] || []).concat(driver);
    }
  }

  function auditDisconnectedInputs() {
    for (const c of state.components) {
      const def = getDef(c);
      for (const p of def.inputs || []) {
        if (!Object.prototype.hasOwnProperty.call(c.inputs || {}, p.id)) {
          state.simStats.disconnected++;
          // Ручные источники допустимо оставлять без входа: они работают как генераторы 0/1.
          if (!['switch','button','variable'].includes(c.type)) {
            addIssue('z', `Вход ${c.id}.${p.id} не подключён`, 'В расчёте используется состояние Z/неопределённость.', { kind: 'pin', cid: c.id, pid: p.id }, 'Подключите вход к выходу источника или добавьте константу/переменную.');
          }
        }
      }
    }
  }

  function auditUnknownOutputs() {
    let unknown = 0;
    for (const c of state.components) {
      for (const [pinId, value] of Object.entries(c.outputs || {})) {
        const sig = toSignal(value);
        if (sig === SIG.X || sig === SIG.Z) {
          unknown++;
          if (sig === SIG.X) {
            addIssue('x', `Выход ${c.id}.${pinId} имеет X`, 'Сигнал неопределён: проверьте входы элемента и возможные конфликты.', { kind: 'pin', cid: c.id, pid: pinId }, 'Проверьте входные провода этого модуля и устраните конфликт/неопределённость.');
          }
        }
      }
    }
    state.simStats.unknown = unknown;
  }

  function auditStructuralIssues() {
    auditUnusedOutputs();
    auditWireCrossings();
  }

  function auditUnusedOutputs() {
    const used = new Set(state.wires.map(w => `${w.from.cid}:${w.from.pid}`));
    for (const c of state.components) {
      const def = getDef(c);
      if (!def) return;
      for (const p of def.outputs || []) {
        const key = `${c.id}:${p.id}`;
        if (!used.has(key) && !['led','indicator','display','seven_segment'].includes(c.type)) {
          addIssue('unused', `Выход ${c.id}.${p.id} никуда не подключён`, 'Это не всегда ошибка, но схема может быть незавершённой.', { kind: 'pin', cid: c.id, pid: p.id }, 'Подключите выход к следующему модулю или оставьте как есть, если это намеренный свободный выход.');
        }
      }
    }
  }

  function auditWireCrossings() {
    const reported = new Set();
    for (let i = 0; i < state.wires.length; i++) {
      for (let j = i + 1; j < state.wires.length; j++) {
        const a = state.wires[i], b = state.wires[j];
        if (!a || !b) continue;
        if (a.from.cid === b.from.cid || a.to.cid === b.to.cid || a.from.cid === b.to.cid || a.to.cid === b.from.cid) continue;
        if (polylineIntersects(wirePoints(a), wirePoints(b))) {
          const key = `${a.id}:${b.id}`;
          if (!reported.has(key)) {
            reported.add(key);
            addIssue('cross', `Провода ${a.id} и ${b.id} пересекаются`, 'Визуально это может выглядеть как соединение, хотя электрического узла нет.', { kind: 'wire', id: a.id }, 'Разведите провода, добавьте промежуточные точки или перенесите один из модулей.');
          }
        }
      }
    }
  }

  function polylineIntersects(pa, pb) {
    if (pa.length < 2 || pb.length < 2) return false;
    for (let i = 0; i < pa.length - 1; i++) {
      for (let j = 0; j < pb.length - 1; j++) {
        if (segmentsIntersect(pa[i], pa[i+1], pb[j], pb[j+1])) {
          if (samePoint(pa[i], pb[j]) || samePoint(pa[i], pb[j+1]) || samePoint(pa[i+1], pb[j]) || samePoint(pa[i+1], pb[j+1])) continue;
          return true;
        }
      }
    }
    return false;
  }

  function samePoint(a, b) { return a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1; }

  function simulate(dt = 0) {
    simulationMap=new Map(state.components.map(c=>[c.id,c]));
    let clockChanged = dt === 0;
    if (state.running && dt > 0) {
      state.tickNo += dt;
      if (state.tickNo >= 500/state.clockHz) { state.tickNo %= 500/state.clockHz; state.clock = !state.clock; clockChanged = true; }
    }

    state.signalIssues = [];
    state.simStats = { passes: 0, stable: true, unknown: 0, disconnected: 0, conflicts: 0 };

    // Гарантируем, что все выходы существуют в четырёхзначной логике 0/1/X/Z.
    state.components.forEach(c => {
      c.outputs = c.outputs || {};
      const def = getDef(c);
      if (!def) return;
      const validOutputs = new Set((def.outputs || []).map(p => p.id));
      Object.keys(c.outputs || {}).forEach(id => { if (!validOutputs.has(id)) delete c.outputs[id]; });
      for (const p of def.outputs || []) {
        if (!Object.prototype.hasOwnProperty.call(c.outputs, p.id)) c.outputs[p.id] = SIG.Z;
        else c.outputs[p.id] = toSignal(c.outputs[p.id]);
      }
    });

    const memory=state.components.filter(c=>['dff','jk_ff'].includes(c.type)||CircuitExtended.sequential.has(c.type)||defs[c.type]?.source);
    const MAX_PASSES=Math.max(32,state.components.length+2);
    const settle=()=>{
      for(let pass=0;pass<MAX_PASSES;pass++){
        const before=outputSnapshot();propagateWires();state.components.forEach(c=>computeComponent(c,true));
        state.simStats.passes++;
        if(before===outputSnapshot())return true;
      }
      return false;
    };
    let stable=settle();
    propagateWires();
    memory.forEach(c=>computeComponent(c,false));
    stable=settle()&&stable;
    state.simStats.stable=stable;
    if(!stable)addIssue('loop','Схема не стабилизировалась','Возможна комбинаторная петля.',null,'Разорвите обратную связь элементом памяти.');
    propagateWires();
    auditDisconnectedInputs();
    auditUnknownOutputs();
    if (state.showIssueMarkers) auditStructuralIssues();

    simulationMap=null;
    recordTrace();
    const now = performance.now();
    if (!state.suppressHistory && (clockChanged || now - state.lastAutoRender > 160)) {
      state.lastAutoRender = now;
      updateInspector();
      updateDiagnostics();
      requestDraw();
    }
  }

  function computeComponent(c,holdMemory=false) {
    normalizeComponentProps(c);
    if(CircuitExtended.compute(c,{hold:holdMemory}))return;
    const t = c.type;
    const bw = bitWidth(c);
    if(holdMemory&&['dff','jk_ff'].includes(t)){
      if(bw===1){setOut(c,'q',toSignal(c.state.q));setOut(c,'nq',sigNot(c.state.q));}
      else{c.state.qBits=Array.isArray(c.state.qBits)?c.state.qBits:[];for(let i=0;i<bw;i++){setOut(c,'q'+i,toSignal(c.state.qBits[i]??'0'));setOut(c,'nq'+i,sigNot(c.state.qBits[i]??'0'));}}
      return;
    }
    const input = id => getInputSignal(c, id);
    const has = id => hasInput(c, id);
    const pid = (legacy, prefix, i) => pinIdForWidth(c, legacy, prefix, i);

    const readAddress = (prefix, n) => {
      const vals = [];
      for (let i = 0; i < n; i++) vals.push(input(prefix === 's' ? selectorPinId(i) : addressPinId(i)));
      if (vals.some(signalUnknown)) return null;
      return vals.reduce((sum, v, i) => sum + signalNum(v) * (1 << i), 0);
    };
    const setBus = (legacy, prefix, values) => {
      for (let i = 0; i < values.length; i++) setOut(c, pid(legacy, prefix, i), values[i]);
    };
    const readBus = (legacy, prefix) => {
      const vals = [];
      for (let i = 0; i < bw; i++) vals.push(input(pid(legacy, prefix, i)));
      return vals;
    };

    if (t === 'switch') { setBus('out', 'out', Array(bw).fill(c.state.on ? SIG.ONE : SIG.ZERO)); return; }
    if (t === 'variable') {
      const vals = [];
      for (let i = 0; i < bw; i++) {
        const inId = pid('in', 'in', i);
        vals.push(has(inId) ? input(inId) : (c.state.on ? SIG.ONE : SIG.ZERO));
      }
      setBus('out', 'out', vals); return;
    }
    if (t === 'clock') {
      const enabled = !has('en') || input('en') === SIG.ONE;
      setBus('out', 'out', Array(bw).fill(enabled ? (state.clock ? SIG.ONE : SIG.ZERO) : SIG.ZERO)); return;
    }
    if (t === 'const0') { setBus('out', 'out', Array(bw).fill(SIG.ZERO)); return; }
    if (t === 'const1' || t === 'power') { setBus('out', 'out', Array(bw).fill(SIG.ONE)); return; }


    if (t === 'not') { for (let i = 0; i < bw; i++) setOut(c, pid('y','y',i), sigNot(input(pid('a','a',i)))); return; }
    if (t === 'buffer') { for (let i = 0; i < bw; i++) setOut(c, pid('y','y',i), input(pid('a','a',i))); return; }

    if (t === 'eq') return setOut(c, 'y', sigEq(input('a'), input('b')));
    if (t === 'half_adder' || t === 'full_adder') {
      let carry = t === 'full_adder' ? input('cin') : SIG.ZERO;
      if (signalUnknown(carry)) carry = SIG.X;
      for (let i = 0; i < bw; i++) {
        const a = input(pid('a','a',i)), b = input(pid('b','b',i));
        if ([a,b,carry].some(signalUnknown)) { setOut(c, pid('s','s',i), SIG.X); carry = SIG.X; }
        else { const sum = signalNum(a) + signalNum(b) + signalNum(carry); setOut(c, pid('s','s',i), sum % 2 ? SIG.ONE : SIG.ZERO); carry = sum >= 2 ? SIG.ONE : SIG.ZERO; }
      }
      setOut(c, t === 'half_adder' ? 'c' : 'cout', carry); return;
    }
    if (t === 'dff') {
      const clk = input('clk');
      if (clk === SIG.X) addIssue('clock', `Неопределённый CLK у ${c.id}`, 'D-триггер не может надёжно определить фронт.', { kind: 'pin', cid: c.id, pid: 'clk' }, 'Подключите CLK к стабильному тактовому генератору или ручному источнику.');
      const clkHigh = clk === SIG.ONE;
      if (bw === 1) { if (clkHigh && !c.state.lastClkHigh) c.state.q = input('d'); c.state.lastClkHigh = clkHigh; setOut(c,'q', toSignal(c.state.q)); setOut(c,'nq', sigNot(c.state.q)); return; }
      c.state.qBits = Array.isArray(c.state.qBits) ? c.state.qBits.slice(0, bw) : Array(bw).fill(SIG.ZERO);
      while (c.state.qBits.length < bw) c.state.qBits.push(SIG.ZERO);
      if (clkHigh && !c.state.lastClkHigh) for (let i = 0; i < bw; i++) c.state.qBits[i] = input(`d${i}`);
      c.state.lastClkHigh = clkHigh;
      for (let i = 0; i < bw; i++) { setOut(c, `q${i}`, toSignal(c.state.qBits[i])); setOut(c, `nq${i}`, sigNot(c.state.qBits[i])); }
      return;
    }
    if (t === 'rs_latch') {
      if (bw === 1) {
        const s = input('s'), r = input('r');
        if (s === SIG.ONE && r === SIG.ONE) { c.state.q = SIG.X; addIssue('invalid', `Запрещённое состояние RS у ${c.id}`, 'S=1 и R=1 одновременно дают неопределённый выход.', { kind: 'component', id: c.id }, 'Не подавайте 1 одновременно на S и R; добавьте блокировку или измените входные сигналы.'); }
        else if (signalUnknown(s) || signalUnknown(r)) c.state.q = SIG.X;
        else if (s === SIG.ONE && r === SIG.ZERO) c.state.q = SIG.ONE;
        else if (r === SIG.ONE && s === SIG.ZERO) c.state.q = SIG.ZERO;
        setOut(c,'q', toSignal(c.state.q)); setOut(c,'nq', sigNot(c.state.q)); return;
      }
      c.state.qBits = Array.isArray(c.state.qBits) ? c.state.qBits.slice(0, bw) : Array(bw).fill(SIG.ZERO);
      while (c.state.qBits.length < bw) c.state.qBits.push(SIG.ZERO);
      for (let i = 0; i < bw; i++) {
        const sIn = input(`s${i}`), rIn = input(`r${i}`);
        if (sIn === SIG.ONE && rIn === SIG.ONE) { c.state.qBits[i] = SIG.X; addIssue('invalid', `Запрещённое состояние RS у ${c.id}.${i}`, 'S=1 и R=1 одновременно дают неопределённый выход.', { kind: 'component', id: c.id }, 'Не подавайте 1 одновременно на S и R.'); }
        else if (signalUnknown(sIn) || signalUnknown(rIn)) c.state.qBits[i] = SIG.X;
        else if (sIn === SIG.ONE && rIn === SIG.ZERO) c.state.qBits[i] = SIG.ONE;
        else if (rIn === SIG.ONE && sIn === SIG.ZERO) c.state.qBits[i] = SIG.ZERO;
        setOut(c, `q${i}`, toSignal(c.state.qBits[i])); setOut(c, `nq${i}`, sigNot(c.state.qBits[i]));
      }
      return;
    }
    if (t === 'jk_ff') {
      const clk = input('clk');
      const clkHigh = clk === SIG.ONE;
      if (clk === SIG.X) addIssue('clock', `Неопределённый CLK у ${c.id}`, 'JK-триггер не может надёжно определить фронт.', { kind: 'pin', cid: c.id, pid: 'clk' }, 'Подключите CLK к стабильному тактовому генератору или ручному источнику.');
      if (bw === 1) {
        if (clkHigh && !c.state.lastClkHigh) {
          const j = input('j'), k = input('k');
          if (signalUnknown(j) || signalUnknown(k)) c.state.q = SIG.X;
          else if (j === SIG.ONE && k === SIG.ZERO) c.state.q = SIG.ONE;
          else if (j === SIG.ZERO && k === SIG.ONE) c.state.q = SIG.ZERO;
          else if (j === SIG.ONE && k === SIG.ONE) c.state.q = sigNot(c.state.q);
        }
        c.state.lastClkHigh = clkHigh; setOut(c,'q', toSignal(c.state.q)); setOut(c,'nq', sigNot(c.state.q)); return;
      }
      c.state.qBits = Array.isArray(c.state.qBits) ? c.state.qBits.slice(0, bw) : Array(bw).fill(SIG.ZERO);
      while (c.state.qBits.length < bw) c.state.qBits.push(SIG.ZERO);
      if (clkHigh && !c.state.lastClkHigh) for (let i = 0; i < bw; i++) {
        const j = input(`j${i}`), k = input(`k${i}`);
        if (signalUnknown(j) || signalUnknown(k)) c.state.qBits[i] = SIG.X;
        else if (j === SIG.ONE && k === SIG.ZERO) c.state.qBits[i] = SIG.ONE;
        else if (j === SIG.ZERO && k === SIG.ONE) c.state.qBits[i] = SIG.ZERO;
        else if (j === SIG.ONE && k === SIG.ONE) c.state.qBits[i] = sigNot(c.state.qBits[i]);
      }
      c.state.lastClkHigh = clkHigh;
      for (let i = 0; i < bw; i++) { setOut(c, `q${i}`, toSignal(c.state.qBits[i])); setOut(c, `nq${i}`, sigNot(c.state.qBits[i])); }
      return;
    }
    if (t === 'register') { for (let i = 0; i < bw; i++) setOut(c, `q${i}`, input(`d${i}`)); return; }
    if (t === 'multiplexer') {
      const n = addressBits(c);
      const selected = readAddress('s', n);
      if (selected === null) { for (let b = 0; b < bw; b++) setOut(c, muxOutPinId(b, bw), SIG.X); return; }
      for (let b = 0; b < bw; b++) setOut(c, muxOutPinId(b, bw), input(muxDataPinId(selected, b, bw)));
      return;
    }
    if (t === 'demultiplexer') {
      const n = addressBits(c);
      const selected = readAddress('s', n);
      const groups = 1 << n;
      const data = [];
      for (let b = 0; b < bw; b++) data.push(input(demuxDataPinId(b, bw)));
      for (let group = 0; group < groups; group++) for (let b = 0; b < bw; b++) setOut(c, demuxOutPinId(group, b, bw), selected === null || signalUnknown(data[b]) ? SIG.X : (group === selected ? data[b] : SIG.ZERO));
      return;
    }
    if (t === 'decoder') {
      const n = addressBits(c);
      const active = readAddress('a', n);
      const count = 1 << n;
      for (let i = 0; i < count; i++) setOut(c, `y${i}`, active === null ? SIG.X : (i === active ? SIG.ONE : SIG.ZERO));
      return;
    }
    if (t === 'encoder') {
      const n = addressBits(c);
      const count = 1 << n;
      const vals = Array.from({ length: count }, (_, i) => input(`i${i}`));
      if (vals.some(signalUnknown)) { for (let i = 0; i < n; i++) setOut(c, addressPinId(i), SIG.X); return; }
      const active = vals.map((v,i) => v === SIG.ONE ? i : -1).filter(i => i >= 0);
      if (active.length > 1) {
        addIssue('invalid', `У шифратора ${c.id} активны несколько входов`, `Активные входы: ${active.map(i => 'I'+i).join(', ')}.`, { kind: 'component', id: c.id }, 'Оставьте активным только один вход или соберите приоритетный шифратор.');
        for (let i = 0; i < n; i++) setOut(c, addressPinId(i), SIG.X); return;
      }
      const value = active.length ? active[0] : 0;
      for (let i = 0; i < n; i++) setOut(c, addressPinId(i), (value & (1 << i)) ? SIG.ONE : SIG.ZERO);
      return;
    }
    if (t === 'converter') { for (let i=0;i<4;i++) setOut(c, 'b'+i, input('a'+i)); return; }
    if (getDef(c)?.custom) { return computeCustomComponent(c,holdMemory); }
    if (t === 'matrix') { for (let i=0;i<4;i++) setOut(c,'c'+i, input('r'+i)); }
  }


  function requestDraw() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      draw();
    });
  }

  function draw() {
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    drawGrid();
    drawWires();
    if (state.wireStart) drawWirePreview();
    state.components.forEach(drawComponent);
    state.texts.forEach(drawText);
    drawIssueMarkers();
    drawSelectionRect();
  }

  function drawGrid() {
    ctx.save(); ctx.fillStyle = cssVar('--board-bg','#f6f8f9');ctx.fillRect(0,0,WORLD_W,WORLD_H);
    ctx.fillStyle = cssVar('--grid-line','#d6dfe3');
    ctx.beginPath();
    for(let x=0;x<=WORLD_W;x+=GRID) for(let y=0;y<=WORLD_H;y+=GRID) ctx.rect(x,y,1.3,1.3);
    ctx.fill();ctx.restore();
  }

  function drawWires() {
    const glowAll = state.wireGlowMode === 'all';
    for (const w of state.wires) {
      const pts = wirePoints(w);
      if (pts.length < 2) continue;
      const from = getComp(w.from.cid);
      const sig = from ? toSignal(from.outputs[w.from.pid]) : SIG.Z;
      const active = sig === SIG.ONE;
      const unknown = sig === SIG.X;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (glowAll) {
        ctx.strokeStyle = w.color;
        ctx.lineWidth = active ? 2.7 : 1.8;
        ctx.globalAlpha = active ? 1 : .6;
        ctx.setLineDash([]);
        ctx.shadowColor = w.color;
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = active ? w.color : unknown ? '#f97316' : cssVar('--wire-off', '#94a3b8');
        ctx.lineWidth = active ? 2.7 : 1.8;
        ctx.globalAlpha = active ? 1 : unknown ? .95 : .72;
        ctx.setLineDash(unknown ? [9, 7] : []);
        ctx.shadowColor = active ? w.color : unknown ? '#f97316' : 'transparent';
        ctx.shadowBlur = 0;
      }
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i=1; i<pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      if (isWireSelected(w.id)) {
        ctx.shadowBlur = 0; ctx.strokeStyle = '#f97316'; ctx.lineWidth = 8; ctx.globalAlpha = .32;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i=1; i<pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      if(isWireSelected(w.id))for(const b of w.bends||[]){ctx.fillStyle=cssVar('--accent','#087f73');ctx.globalAlpha=1;ctx.fillRect(b.x-4,b.y-4,8,8);}
      ctx.restore();
    }
  }

  function drawWirePreview() {
    const p = pinPos(state.wireStart.comp, state.wireStart.pin);
    ctx.save();
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 3; ctx.setLineDash([8,6]);
    ctx.beginPath();ctx.moveTo(p.x,p.y);let last=p;for(const point of [...state.wireBends,state.mouse]){ctx.lineTo(point.x,last.y);ctx.lineTo(point.x,point.y);last=point;}ctx.stroke();
    ctx.restore();
  }

  function drawComponent(c) {
    const def=getDef(c);if(!def)return;
    const selected=isComponentSelected(c.id), pins=getPins(c);
    if(c.type==='contact'){ctx.save();ctx.strokeStyle=selected?cssVar('--accent','#087f73'):cssVar('--component-text','#364d59');ctx.fillStyle=cssVar('--board-bg','#f6f8f9');ctx.lineWidth=2;ctx.beginPath();ctx.arc(c.x+10,c.y+10,7,0,Math.PI*2);ctx.fill();ctx.stroke();pins.forEach(p=>drawPin(c,p));ctx.restore();return;}
    const extraBottom=pins.some(p=>p.side==='bottom')?18:0;
    ctx.save();ctx.fillStyle=cssVar('--component-fill','#fff');
    ctx.strokeStyle=selected?cssVar('--accent','#087f73'):cssVar('--component-border','#b8c8ce');
    ctx.lineWidth=selected?2:1;
    ctx.shadowColor='rgba(25,55,67,.07)';ctx.shadowBlur=8;ctx.shadowOffsetY=2;
    roundRect(ctx,c.x-7,c.y-10,def.w+14,def.h+34+extraBottom,7);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.stroke();
    if(c.type==='variable') drawVariableOverlay(c);
    else {
      if(def.custom){ctx.save();ctx.font='600 17px Segoe UI,Arial';ctx.fillStyle=cssVar('--component-text','#364d59');ctx.textAlign='center';ctx.fillText(def.name,c.x+def.w/2,c.y+def.h/2,def.w-20);ctx.restore();}
      else if(c.type==='input'||c.type==='probe'){drawBusDisplay(c);}
      else {
      const sig=c.type==='switch'?(c.state.on?'1':'0'):c.type==='indicator'?getInputSignal(c,bitWidth(c)===1?'in':'in0'):toSignal(c.outputs.out);
      CircuitSymbols.draw(ctx,c,def,cssVar('--component-text','#364d59'),cssVar('--accent','#087f73'),sig);
      drawStateOverlay(c);
      }
    }
    ctx.fillStyle=cssVar('--muted','#75818c');ctx.font='500 10px Segoe UI, Arial';ctx.textAlign='center';
    ctx.fillText(def.name,c.x+def.w/2,c.y+def.h+(extraBottom?34:18),def.w+8);
    pins.forEach(p=>drawPin(c,p));ctx.restore();
  }

  function drawCustomOverlay(c) {
    const def = getDef(c);
    ctx.save();
    const grad = ctx.createLinearGradient(c.x, c.y, c.x + def.w, c.y + def.h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#a7d916';
    ctx.lineWidth = 2;
    roundRect(ctx, c.x + 5, c.y + 7, def.w - 10, def.h - 14, 11);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 13px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = String(def.name || 'USER').slice(0, 16);
    ctx.fillText(title, c.x + def.w / 2, c.y + def.h / 2 - 6);
    ctx.fillStyle = '#c7f04a';
    ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
    ctx.fillText(`${(def.inputs||[]).length} IN · ${(def.outputs||[]).length} OUT`, c.x + def.w / 2, c.y + def.h / 2 + 13);
    ctx.restore();
  }

  function drawStateOverlay(c) {
    const def = getDef(c);
    if (c.type === 'display') { drawNumericDisplay(c); return; }
    if (c.type === 'seven_segment') { drawSevenSegmentDisplay(c); return; }
    if (c.type === 'variable') { drawVariableOverlay(c); return; }
    let text = '';
    if (c.type === 'switch') text = c.state.on ? '1' : '0';
    if (c.type === 'clock') text = signalText(c.outputs[bitWidth(c) === 1 ? 'out' : 'out0'] || SIG.Z) === SIG.ONE ? 'CLK 1' : 'CLK 0';
    if (c.type === 'indicator' && bitWidth(c) === 1) return;
    if (c.type === 'indicator') {
      if (bitWidth(c) === 1) text = signalText(getInputSignal(c,'in'));
      else text = Array.from({ length: Math.min(bitWidth(c), 8) }, (_, i) => signalText(getInputSignal(c, 'in' + i))).reverse().join('');
    }
    if (!text) return;
    ctx.save();
    const active = text.includes('1') || /^[1-9A-F]$/.test(text);
    const unknown = text.includes('X') || text.includes('Z');
    ctx.fillStyle = active ? cssVar('--accent-soft','#e8f5f1') : unknown ? '#fcebd7' : cssVar('--category-bg','#f5f7f8');
    ctx.strokeStyle = 'rgba(15,23,42,.25)'; ctx.lineWidth = 1;
    roundRect(ctx, c.x + def.w - 36, c.y + 5, 31, 22, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--ink','#263b46'); ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.x + def.w - 20.5, c.y + 16);
    ctx.restore();
  }



  function readNibble(c) {
    const width = Math.max(1, Math.min(bitWidth(c), 16));
    const bits = Array.from({ length: width }, (_, i) => getInputSignal(c, 'd' + i));
    if (bits.some(signalUnknown)) return null;
    return bits.reduce((acc,v,i) => acc + (v === SIG.ONE ? (1<<i) : 0), 0);
  }

  function displayText(c) {
    const n = readNibble(c);
    if (n === null) return 'X';
    const width = Math.max(1, Math.min(bitWidth(c), 16));
    const mode = c.state.mode || 'dec';
    if (mode === 'bin') return n.toString(2).padStart(width, '0');
    if (mode === 'hex') return n.toString(16).toUpperCase();
    return String(n);
  }

  function drawVariableOverlay(c) {
    const def=getDef(c),outId=bitWidth(c)===1?'out':'out0',inId=bitWidth(c)===1?'in':'in0';
    const sig=toSignal(c.outputs[outId]);ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=cssVar('--component-text','#364d59');ctx.font='600 18px Segoe UI, Arial';
    ctx.fillText(String(c.state.label||'X'),c.x+def.w/2,c.y+def.h/2-4,def.w-15);
    ctx.font='10px Consolas,monospace';ctx.fillStyle=cssVar('--muted','#75818c');
    ctx.fillText(`${hasInput(c,inId)?'IN → OUT':'ВХОД'} · ${sig}`,c.x+def.w/2,c.y+def.h/2+16);ctx.restore();
  }

  function drawNumericDisplay(c) {
    const def = getDef(c);
    const text = displayText(c);
    ctx.save();
    ctx.fillStyle = cssVar('--display-bg', '#07111f');
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
    roundRect(ctx, c.x + 28, c.y + 13, def.w - 40, def.h - 26, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--display-text', '#a7d916');
    ctx.shadowColor = cssVar('--display-text', '#a7d916'); ctx.shadowBlur = 8;
    const mode = (c.state.mode || 'dec').toUpperCase();
    ctx.font = text.length > 3 ? 'bold 18px Consolas, monospace' : 'bold 28px Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.x + def.w/2 + 8, c.y + def.h/2 + 1);
    ctx.shadowBlur = 0; ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 9px Arial';
    ctx.fillText(mode, c.x + def.w/2 + 8, c.y + def.h - 12);
    ctx.restore();
  }

  const SEGMENTS = {
    '0': 'abcedf', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fbgc',
    '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd',
    'A': 'abcefg', 'B': 'fgecd', 'C': 'afed', 'D': 'bgecd', 'E': 'afged', 'F': 'afge'
  };

  function drawSevenSegmentDisplay(c) {
    const def = getDef(c);
    const n = readNibble(c);
    const mode = c.state.mode || 'dec';
    const char = n === null ? 'X' : (mode === 'hex' ? n.toString(16).toUpperCase() : String(n % 10));
    ctx.save();
    ctx.fillStyle = cssVar('--display-bg', '#07111f');
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
    roundRect(ctx, c.x + 40, c.y + 9, def.w - 52, def.h - 18, 12); ctx.fill(); ctx.stroke();
    const x = c.x + 60, y = c.y + 19, w = 42, h = 58, t = 8;
    const on = cssVar('--display-text', '#a7d916');
    const off = document.body.classList.contains('theme-dark') ? '#172033' : '#1e293b';
    const active = SEGMENTS[char] || '';
    const seg = {
      a:[x+t,y,w-2*t,t], b:[x+w-t,y+t,t,h/2-t], c:[x+w-t,y+h/2,t,h/2-t], d:[x+t,y+h-t,w-2*t,t],
      e:[x,y+h/2,t,h/2-t], f:[x,y+t,t,h/2-t], g:[x+t,y+h/2-t/2,w-2*t,t]
    };
    for (const [id, r] of Object.entries(seg)) {
      ctx.fillStyle = active.includes(id) ? on : off;
      ctx.globalAlpha = active.includes(id) ? 1 : .38;
      roundRect(ctx, r[0], r[1], r[2], r[3], 4); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
    ctx.fillText((mode === 'hex' ? 'HEX' : 'DEC') + ' ' + (n === null ? 'X' : n), c.x + def.w/2 + 14, c.y + def.h - 7);
    ctx.restore();
  }

  function drawPin(c, p) {
    const pp = pinPos(c, p);
    const isOut = p.dir === 'out';
    const sig = isOut ? toSignal(c.outputs[p.id]) : toSignal(c.inputs[p.id]);
    const v = sig === SIG.ONE;
    const selected = state.wireStart?.comp.id === c.id && state.wireStart?.pin.id === p.id;
    ctx.save();
    ctx.fillStyle = selected ? '#f97316' : (sig === SIG.X ? '#f97316' : v ? cssVar('--accent','#087f73') : cssVar('--pin-off', '#e2e8f0'));
    ctx.strokeStyle = sig === SIG.X ? '#c2410c' : v ? cssVar('--accent','#087f73') : cssVar('--pin-stroke-off', '#64748b');
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pp.x, pp.y, selected ? 7 : 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cssVar('--component-text', '#334155'); ctx.font = '10px Arial';
    if (p.side === 'left') {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(p.label, pp.x - 10, pp.y);
    } else if (p.side === 'right') {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(p.label, pp.x + 10, pp.y);
    } else if (p.side === 'top') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.label, pp.x, pp.y - 10);
    } else if (p.side === 'bottom') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(p.label, pp.x, pp.y + 10);
    }
    ctx.restore();
  }



  function drawText(t) {
    const selected = isTextSelected(t.id);
    ctx.save();
    ctx.font = `bold ${t.size || 18}px Arial`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (selected) {
      const b = textBounds(t);
      ctx.fillStyle = 'rgba(249,115,22,.12)';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = (!t.color || t.color === '#0f172a') ? cssVar('--component-text', '#0f172a') : t.color;
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }


  function drawIssueMarkers() {
    if (!state.showIssueMarkers || !(state.signalIssues || []).length) return;
    const seen = new Set();
    state.signalIssues.forEach((issue, idx) => {
      const t = issue.target;
      if (!t) return;
      const key = `${t.kind}:${t.id || t.cid}:${t.pid || ''}`;
      if (seen.has(key) && state.issueFocus !== idx) return;
      seen.add(key);
      const focus = state.issueFocus === idx;
      const color = issueColor(issue.type);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = focus ? 5 : 3;
      ctx.setLineDash(focus ? [] : [8, 5]);
      ctx.globalAlpha = focus ? 1 : .86;
      if (t.kind === 'component') {
        const c = getComp(t.id);
        if (c) {
          const d = getDef(c);
          roundRect(ctx, c.x - 13, c.y - 16, d.w + 26, d.h + 46, 16);
          ctx.stroke();
          drawBang(c.x + d.w + 13, c.y - 14, color, focus);
        }
      } else if (t.kind === 'pin') {
        const c = getComp(t.cid);
        if (c) {
          const pin = getPins(c).find(p => p.id === t.pid);
          if (pin) {
            const pp = pinPos(c, pin);
            ctx.beginPath(); ctx.arc(pp.x, pp.y, focus ? 15 : 12, 0, Math.PI * 2); ctx.stroke();
            drawBang(pp.x + 15, pp.y - 16, color, focus);
          }
        }
      } else if (t.kind === 'wire') {
        const w = state.wires.find(x => x.id === t.id);
        const pts = w ? wirePoints(w) : [];
        if (pts.length > 1) {
          ctx.lineWidth = focus ? 9 : 6;
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          const mid = pts[Math.floor(pts.length / 2)];
          drawBang(mid.x + 10, mid.y - 18, color, focus);
        }
      }
      ctx.restore();
    });
  }

  function issueColor(type) {
    if (type === 'conflict' || type === 'invalid' || type === 'loop') return '#dc2626';
    if (type === 'x' || type === 'clock') return '#f97316';
    if (type === 'cross') return '#7c3aed';
    return '#2563eb';
  }

  function drawBang(x, y, color, focus) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, focus ? 11 : 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${focus ? 16 : 13}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 1);
    ctx.restore();
  }

  function drawSelectionRect() {
    if (!state.selecting) return;
    const r = normalizeRect(state.selecting.start, state.selecting.end);
    ctx.save();
    ctx.fillStyle = 'rgba(53,92,168,.10)';
    ctx.strokeStyle = '#355ca8';
    ctx.setLineDash([8,5]);
    ctx.lineWidth = 2;
    ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
  }

  function isComponentSelected(id) {
    return state.selected?.kind === 'component' && state.selected.id === id || state.selected?.kind === 'multi' && state.selected.components.includes(id);
  }
  function isWireSelected(id) {
    return state.selected?.kind === 'wire' && state.selected.id === id || state.selected?.kind === 'multi' && state.selected.wires.includes(id);
  }
  function isTextSelected(id) {
    return state.selected?.kind === 'text' && state.selected.id === id || state.selected?.kind === 'multi' && state.selected.texts.includes(id);
  }

  function selectedIds() {
    if (!state.selected) return { components: [], wires: [], texts: [] };
    if (state.selected.kind === 'component') return { components: [state.selected.id], wires: [], texts: [] };
    if (state.selected.kind === 'wire') return { components: [], wires: [state.selected.id], texts: [] };
    if (state.selected.kind === 'text') return { components: [], wires: [], texts: [state.selected.id] };
    return { components: [...state.selected.components], wires: [...state.selected.wires], texts: [...state.selected.texts] };
  }

  function normalizeRect(a, b) {
    return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(a.x-b.x), h: Math.abs(a.y-b.y) };
  }

  function rectIntersects(a, b) {
    return a.x <= b.x+b.w && a.x+a.w >= b.x && a.y <= b.y+b.h && a.y+a.h >= b.y;
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function segmentsIntersect(a, b, c, d) {
    const orient = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const onSeg = (p, q, r) => Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSeg(a, c, b)) return true;
    if (o2 === 0 && onSeg(a, d, b)) return true;
    if (o3 === 0 && onSeg(c, a, d)) return true;
    if (o4 === 0 && onSeg(c, b, d)) return true;
    return false;
  }

  function segmentIntersectsRect(a, b, r) {
    if (pointInRect(a, r) || pointInRect(b, r)) return true;
    const tl = { x: r.x, y: r.y }, tr = { x: r.x + r.w, y: r.y };
    const br = { x: r.x + r.w, y: r.y + r.h }, bl = { x: r.x, y: r.y + r.h };
    return segmentsIntersect(a, b, tl, tr) || segmentsIntersect(a, b, tr, br) || segmentsIntersect(a, b, br, bl) || segmentsIntersect(a, b, bl, tl);
  }

  function wireIntersectsRect(wire, r) {
    const pts = wirePoints(wire);
    for (let i = 0; i < pts.length - 1; i++) {
      if (segmentIntersectsRect(pts[i], pts[i + 1], r)) return true;
    }
    return false;
  }

  function wiresBetweenSelectedComponents(componentIds) {
    const set = new Set(componentIds);
    return state.wires.filter(w => set.has(w.from.cid) && set.has(w.to.cid)).map(w => w.id);
  }

  function selectArea(r, mode = 'replace') {
    const components = state.components.filter(c => {
      const d = getDef(c); return rectIntersects(r, { x:c.x-8, y:c.y-12, w:d.w+16, h:d.h+38 });
    }).map(c => c.id);
    const texts = state.texts.filter(t => rectIntersects(r, textBounds(t))).map(t => t.id);
    const wires = Array.from(new Set([
      ...state.wires.filter(w => wireIntersectsRect(w, r)).map(w => w.id),
      ...wiresBetweenSelectedComponents(components)
    ]));

    if (mode === 'add' && state.selected) {
      const old = selectedIds();
      state.selected = {
        kind: 'multi',
        components: Array.from(new Set([...old.components, ...components])),
        wires: Array.from(new Set([...old.wires, ...wires])),
        texts: Array.from(new Set([...old.texts, ...texts]))
      };
    } else if (mode === 'remove' && state.selected) {
      const old = selectedIds();
      state.selected = {
        kind: 'multi',
        components: old.components.filter(id => !components.includes(id)),
        wires: old.wires.filter(id => !wires.includes(id)),
        texts: old.texts.filter(id => !texts.includes(id))
      };
    } else if (!components.length && !texts.length && !wires.length) {
      state.selected = null;
    } else {
      state.selected = { kind: 'multi', components, wires, texts };
    }

    let ids = selectedIds();
    if (!ids.components.length && !ids.wires.length && !ids.texts.length) {
      state.selected = null;
      ids = selectedIds();
    }
    setStatus(`Выделено: модулей ${ids.components.length}, проводов ${ids.wires.length}, текстов ${ids.texts.length}.`);
    updateInspector(); draw();
  }

  function addTextAt(pos) {
    const txt = prompt('Введите подпись. Для подключаемой переменной начните с @, например @A:', 'A');
    if (txt === null || !txt.trim()) return;
    const raw = txt.trim();
    if (raw.startsWith('@')) {
      pushHistory();
      const label = (raw.slice(1).trim() || 'X').slice(0, 12);
      const def = defs.variable;
      const comp = {
        id: 'm' + state.nextId++, type: 'variable',
        x: snap(pos.x - def.w / 2), y: snap(pos.y - def.h / 2),
        state: { ...defaultState('variable'), label }, inputs: {}, outputs: {}, prevInputs: {}
      };
      state.components.push(comp);
      state.selected = { kind: 'component', id: comp.id };
      setTool('select');
      simulate();
      setStatus(`Подключаемая переменная «${label}» добавлена. У неё есть IN и OUT.`);
      return;
    }
    pushHistory();
    const t = { id: 't' + state.nextId++, x: snap(pos.x), y: snap(pos.y), text: raw, size: 18, color: '#0f172a' };
    state.texts.push(t);
    state.selected = { kind: 'text', id: t.id };
    setTool('select');
    setStatus('Текстовая подпись добавлена. Двойной клик — редактирование.');
    draw(); updateInspector();
  }

  function editSelection() {
    const ids = selectedIds();
    const textId = ids.texts[0];
    if (textId) {
      const t = getText(textId);
      if (!t) return;
      const txt = prompt('Изменить текст:', t.text);
      if (txt === null) return;
      pushHistory();
      t.text = txt.trim() || t.text;
      setStatus('Текст изменён.');
      draw(); updateInspector();
      return;
    }
    if (ids.components.length === 1) {
      const c = getComp(ids.components[0]);
      if (!c) return;
      if (c.type === 'switch') { pushHistory(); c.state.on = !c.state.on; simulate(); setStatus('Состояние переключателя изменено.'); return; }
      if (c.type === 'variable') {
        const label = prompt('Имя переменной:', c.state.label || 'X');
        if (label === null) return;
        pushHistory();
        c.state.label = (label.trim() || c.state.label || 'X').slice(0, 12);
        simulate(); setStatus('Переменная отредактирована.'); return;
      }
      if (c.type === 'display' || c.type === 'seven_segment') {
        const allowed = c.type === 'display' ? 'dec / hex / bin' : 'dec / hex';
        const mode = prompt(`Формат вывода (${allowed}):`, c.state.mode || 'dec');
        if (mode === null) return;
        const m = mode.trim().toLowerCase();
        if ((c.type === 'display' && ['dec','hex','bin'].includes(m)) || (c.type === 'seven_segment' && ['dec','hex'].includes(m))) {
          pushHistory(); c.state.mode = m; simulate(); setStatus(`Формат дисплея: ${m.toUpperCase()}.`); return;
        }
        setStatus('Формат не изменён: введено недопустимое значение.'); return;
      }
      setStatus('Редактирование доступно для текста, переменной, переключателя и дисплеев.');
      return;
    }
    setStatus('Выбери один объект для редактирования.');
  }

  function deleteSelection() {
    if (!state.selected) return;
    pushHistory();
    const ids = selectedIds();
    const compSet = new Set(ids.components);
    const wireSet = new Set(ids.wires);
    const textSet = new Set(ids.texts);
    state.components = state.components.filter(c => !compSet.has(c.id));
    state.texts = state.texts.filter(t => !textSet.has(t.id));
    state.wires = state.wires.filter(w => !wireSet.has(w.id) && !compSet.has(w.from.cid) && !compSet.has(w.to.cid));
    state.selected = null; state.wireStart = null;
    simulate(); setStatus('Выделение удалено.');
  }

  function copySelection() {
    const ids = selectedIds();
    if (!ids.components.length && !ids.texts.length && !ids.wires.length) { setStatus('Нечего копировать.'); return; }
    const compSet = new Set(ids.components);
    const wireSet = new Set(ids.wires);
    const textSet = new Set(ids.texts);
    const comps = state.components.filter(c => compSet.has(c.id)).map(c => structuredClone(c));
    const texts = state.texts.filter(t => textSet.has(t.id)).map(t => structuredClone(t));
    const wires = state.wires.filter(w => wireSet.has(w.id) || (compSet.has(w.from.cid) && compSet.has(w.to.cid))).map(w => structuredClone(w));
    state.clipboard = { components: comps, texts, wires };
    setStatus(`Скопировано: модулей ${comps.length}, проводов ${wires.length}, текстов ${texts.length}.`);
  }

  function pasteClipboard() {
    if (!state.clipboard) { setStatus('Буфер копирования пуст.'); return; }
    pushHistory();
    const idMap = new Map();
    const newComps = state.clipboard.components.map(c => {
      const n = structuredClone(c); const oldId = n.id; n.id = 'm' + state.nextId++; n.x += 48; n.y += 48; n.inputs = {}; n.outputs = {}; n.prevInputs = {}; idMap.set(oldId, n.id); return n;
    });
    const newTexts = state.clipboard.texts.map(t => { const n = structuredClone(t); n.id = 't' + state.nextId++; n.x += 48; n.y += 48; return n; });
    const newWires = state.clipboard.wires.filter(w => idMap.has(w.from.cid) && idMap.has(w.to.cid)).map(w => {
      const n = structuredClone(w); n.id = 'w' + state.nextId++; n.from.cid = idMap.get(w.from.cid); n.to.cid = idMap.get(w.to.cid);if(n.bends)n.bends=n.bends.map(p=>({x:p.x+48,y:p.y+48})); const key = `${n.from.cid}:${n.from.pid}`; state.sourceColors[key] = n.color || WIRE_COLORS[state.colorIndex++ % WIRE_COLORS.length]; n.color = state.sourceColors[key]; return n;
    });
    state.components.push(...newComps); state.texts.push(...newTexts); state.wires.push(...newWires);
    state.selected = { kind: 'multi', components: newComps.map(c=>c.id), wires: newWires.map(w=>w.id), texts: newTexts.map(t=>t.id) };
    simulate(); setStatus('Фрагмент вставлен со смещением.');
  }

  function updateDiagnostics() {
    if (!diagnosticsInfo) return;
    const issues = state.signalIssues || [];
    const stats = state.simStats || { passes: 0, stable: true, unknown: 0, disconnected: 0, conflicts: 0 };
    const status = stats.stable && !issues.length ? '<span class="ok">Ошибок не найдено</span>' : '<span class="warn">Есть предупреждения</span>';
    const critical = issues.filter(i => ['conflict','invalid','loop'].includes(i.type)).length;
    const warnings = Math.max(0, issues.length - critical);
    const rows = issues.slice(0, 14).map((i, idx) => {
      const fix = i.fix || issueAdvice(i.type);
      return `<li class="diag-item diag-${escapeHTML(i.type)}" data-issue-index="${idx}">
        <button type="button" class="diag-focus" data-issue-index="${idx}" title="Показать на схеме">Показать</button>
        <b>${escapeHTML(i.message)}</b><br>
        <span>${escapeHTML(i.detail || '')}</span>
        ${fix ? `<em>Как исправить: ${escapeHTML(fix)}</em>` : ''}
      </li>`;
    }).join('');
    diagnosticsInfo.innerHTML = `
      <p>${status}</p>
      <p class="muted">Проходов стабилизации: ${stats.passes}. Неизвестных выходов: ${stats.unknown}. Неподключённых входов: ${stats.disconnected}. Конфликтов: ${stats.conflicts}.</p>
      <p class="diag-summary">Критичных: ${critical}. Предупреждений: ${warnings}. Маркеры на поле: ${state.showIssueMarkers ? 'включены' : 'выключены'}.</p>
      ${issues.length ? `<ul class="diag-list">${rows}${issues.length > 14 ? `<li>…и ещё ${issues.length - 14}</li>` : ''}</ul>` : '<p class="muted">Сигналы рассчитываются в логике 0/1/X/Z. Нажми «Проверить схему», чтобы подсветить проблемные места на поле.</p>'}
    `;
  }

  function issueAdvice(type) {
    const advice = {
      conflict: 'Оставьте один источник на вход или объедините сигналы логическим элементом.',
      z: 'Подключите вход или добавьте константу/переменную.',
      x: 'Проверьте входы модуля и устраните источник неопределённости.',
      clock: 'Подайте стабильный CLK от генератора или ручного источника.',
      invalid: 'Измените входные комбинации, запрещённые для этого элемента.',
      loop: 'Разорвите обратную связь элементом памяти.',
      unused: 'Подключите выход, если он должен участвовать в схеме.',
      cross: 'Разведите провода, чтобы пересечение не выглядело как узел.',
      broken: 'Удалите повреждённый провод и создайте соединение заново.'
    };
    return advice[type] || '';
  }

  function bindComponentPropertyControls(comp) {
    const bitInput = document.getElementById('propBitWidth');
    const addressInput = document.getElementById('propAddressBits');
    const warningBox = document.getElementById('propValidationWarning');

    const clearWarning = input => {
      if (input) input.setCustomValidity('');
      if (warningBox) {
        warningBox.textContent = '';
        warningBox.hidden = true;
      }
    };

    const showWarning = (input, message, restoreValue) => {
      if (warningBox) {
        warningBox.textContent = message;
        warningBox.hidden = false;
      }
      if (input) {
        input.setCustomValidity(message);
        input.reportValidity();
        input.value = restoreValue;
        window.setTimeout(() => input.setCustomValidity(''), 0);
      }
      setStatus(message);
    };

    const apply = (kind, rawValue, input) => {
      const c = getComp(comp.id);
      if (!c) return;
      normalizeComponentProps(c);

      const ranges={bitWidth:[1,16,'Разрядность'],addressBits:[1,5,'Адресная разрядность'],inputCount:[2,16,'Число входов'],outputCount:[1,8,'Число выходов']};
      const [min,max,label]=ranges[kind],currentValue=c.props[kind]||defaultPropsFor(c.type)[kind]||1;
      const parsed=parsePositiveRange(rawValue,min,max,currentValue,label);
      if(!parsed.ok){showWarning(input,parsed.message,currentValue);return;}
      const nextProps={...c.props,[kind]:parsed.value};
      try{
        if(CircuitExtended.ports.isGate(c.type))CircuitExtended.ports.check(nextProps);
        if(['multiplexer','demultiplexer'].includes(c.type)&&2**nextProps.addressBits*nextProps.bitWidth>96)throw new Error('Максимум 96 разрядов данных. Уменьшите число каналов или разрядность.');
      }catch(error){showWarning(input,error.message,currentValue);return;}
      clearWarning(input);
      const oldProps = JSON.stringify(c.props || {});
      const newProps = JSON.stringify(nextProps);
      if (oldProps === newProps) { updateInspector(); return; }
      pushHistory();
      c.props = nextProps;
      normalizeComponentProps(c);
      const removed = cleanInvalidWires(c.id);
      state.wireStart = null;
      simulate(0);
      setStatus(removed ? `Порты изменены. Удалено несовместимых проводов: ${removed}. Ctrl Z — отменить.` : 'Порты изменены.');
      updateInspector();
      draw();
    };

    if (bitInput) {
      bitInput.addEventListener('input', () => { bitInput.setCustomValidity(''); });
      bitInput.addEventListener('change', () => apply('bitWidth', bitInput.value, bitInput));
    }
    for(const [id,kind]of [['propInputCount','inputCount'],['propOutputCount','outputCount']]){const control=document.getElementById(id);if(control)control.addEventListener('change',()=>apply(kind,control.value,control));}
    const channel=document.getElementById('propChannelCount');if(channel)channel.addEventListener('change',()=>{apply('addressBits',Math.log2(Number(channel.value)),null);channel.value=String(2**comp.props.addressBits);});
    if (addressInput) {
      addressInput.addEventListener('input', () => { addressInput.setCustomValidity(''); });
      addressInput.addEventListener('change', () => apply('addressBits', addressInput.value, addressInput));
    }
  }

  let lastInspectorSelected=null;
  function updateInspector() {
    document.getElementById('boardSummary').textContent = `${state.components.length} блоков · ${state.wires.length} соединений`;
    if(selectionInfo.contains(document.activeElement)&&isEditableTarget(document.activeElement)&&state.selected?.id===lastInspectorSelected)return;
    lastInspectorSelected=state.selected?.id;
    const ids = selectedIds();
    [copyBtn,deleteBtn,editBtn].forEach(b => b.disabled = !state.selected);
    pasteBtn.disabled = !state.clipboard;
    if (!state.selected) { selectionInfo.innerHTML = '<div class="inspector-empty"><span>⌖</span><b>Выберите компонент</b>Нажмите на блок, чтобы посмотреть его параметры и сигналы.</div>'; return; }
    if (state.selected.kind === 'component') {
      const c = getComp(state.selected.id); if (!c) return;
      const def = getDef(c);
      const ins = Object.entries(c.inputs).map(([k,v]) => `${k}=${signalText(v)}`).join(', ') || 'нет';
      const outs = Object.entries(c.outputs).map(([k,v]) => `${k}=${signalText(v)}`).join(', ') || 'нет';
      const props = normalizeComponentProps(c).props;
      const pinInfo = `${(def.inputs || []).length} IN · ${(def.outputs || []).length} OUT`;
      const gate=CircuitExtended.ports.isGate(c.type),channels=['decoder','encoder','multiplexer','demultiplexer'].includes(c.type);
      const bitLabel=['const0','const1','switch','clock','input'].includes(c.type)?'Выходных разрядов':['indicator','probe','display','seven_segment'].includes(c.type)?'Входных разрядов':'Разрядность данных';
      const bitControl = ['decoder','encoder','contact'].includes(c.type)||def.custom ? '' : `<label class="prop-row"><span>${bitLabel}</span><input id="propBitWidth" type="number" min="${LIMITS.minBitWidth}" max="${LIMITS.maxBitWidth}" value="${props.bitWidth}"></label>`;
      const countControls=gate?`<div class="port-count-grid"><label>${props.bitWidth>1?'Входных шин':'Входов'}<input id="propInputCount" type="number" min="2" max="16" value="${props.inputCount}"></label><label>${props.bitWidth>1?'Выходных шин':'Выходов'}<input id="propOutputCount" type="number" min="1" max="8" value="${props.outputCount}"></label></div><p class="port-hint">Все входы участвуют в операции. Выходы — копии одного результата.</p>`:'';
      const channelLabel=['multiplexer','encoder'].includes(c.type)?'Входных каналов':'Выходных каналов';
      const channelControl=channels?`<label class="prop-row"><span>${channelLabel}</span><select id="propChannelCount">${[2,4,8,16,32].map(n=>`<option value="${n}" ${n===2**props.addressBits?'selected':''}>${n}</option>`).join('')}</select></label>`:'';
      const addressControl = ['ram','rom'].includes(c.type)?`<label class="prop-row"><span>Адресных разрядов</span><input id="propAddressBits" type="number" min="1" max="5" value="${props.addressBits}"></label>`:'';
      const portHeading=`<div class="port-heading"><b>Порты</b><span>${(def.inputs||[]).length} вход. · ${(def.outputs||[]).length} вых.</span></div>`;
      const orientationControl=`<label class="prop-row"><span>Направление</span><select id="propOrientation">${[['east','Вправо →'],['south','Вниз ↓'],['west','Влево ←'],['north','Вверх ↑']].map(([v,label])=>`<option value="${v}" ${(c.props.orientation||'east')===v?'selected':''}>${label}</option>`).join('')}</select></label>`;
      const extraControls = (c.type==='input'?`<label class="prop-row"><span>Значение (0–${2**bitWidth(c)-1})</span><input id="propValue" type="number" min="0" max="${2**bitWidth(c)-1}" value="${c.state.value||0}"></label>`:'')+(['ram','rom'].includes(c.type)?`<label class="memory-label">Содержимое памяти (DEC или 0xHEX)<textarea id="propMemory" spellcheck="false">${(c.state.memory||[]).map(v=>v===null?'X':v).join(' ')}</textarea></label><button id="applyMemoryBtn" class="full-width">Записать содержимое</button>`:'')+(c.type==='shifter'?`<label class="prop-row"><span>Направление</span><select id="propDirection"><option value="left" ${c.state.direction!=='right'?'selected':''}>Влево</option><option value="right" ${c.state.direction==='right'?'selected':''}>Вправо</option></select></label>`:'');
      selectionInfo.innerHTML = `<p><span class="badge">${def.group}</span></p><p><b>${escapeHTML(def.name)}</b></p><div class="desc-card">${escapeHTML(def.desc || 'Описание модуля пока не задано.')}</div><div class="prop-box">${portHeading}${countControls}${channelControl}${bitControl}${addressControl}${orientationControl}${extraControls}${def.source?'<button id="openSubcircuitBtn" class="full-width">Открыть подсхему →</button>':''}<p id="propValidationWarning" class="prop-warning" hidden></p><p class="muted">${pinInfo}. A0/S0 — младший разряд. Допустимы только целые положительные значения. При уменьшении числа портов несовместимые провода удаляются; действие можно отменить.</p></div><p class="muted">ID: ${escapeHTML(c.id)}</p><p>Входы: ${escapeHTML(ins)}</p><p>Выходы: ${escapeHTML(outs)}</p>`;
      bindComponentPropertyControls(c);
      bindExtendedControls(c);
      document.getElementById('openSubcircuitBtn')?.addEventListener('click',()=>openSubcircuit(c));
    } else if (state.selected.kind === 'wire') {
      const w = state.wires.find(x => x.id === state.selected.id);
      selectionInfo.innerHTML = w ? `<p><b>Провод</b></p><p class="muted">${w.from.cid}.${w.from.pid} → ${w.to.cid}.${w.to.pid}</p><label class="prop-row"><span>Цвет источника</span><input id="propWireColor" type="color" value="${w.color}"></label><p class="muted">Двойной клик по проводу добавляет точку маршрута. Квадратные точки можно перетаскивать.</p><button id="resetWireRoute">Автомаршрут</button>` : '';
      if(w){document.getElementById('propWireColor')?.addEventListener('change',e=>{pushHistory();const key=`${w.from.cid}:${w.from.pid}`;state.sourceColors[key]=e.target.value;state.wires.filter(p=>p.from.cid===w.from.cid&&p.from.pid===w.from.pid).forEach(p=>p.color=e.target.value);draw();});document.getElementById('resetWireRoute')?.addEventListener('click',()=>{pushHistory();delete w.bends;draw();});}
    } else if (state.selected.kind === 'text') {
      const t = getText(state.selected.id);
      selectionInfo.innerHTML = t ? `<p><b>Текстовая подпись</b></p><p class="muted">ID: ${t.id}</p><p>${escapeHTML(t.text)}</p><p class="muted">Двойной клик или кнопка «Редактировать».</p>` : '';
    } else {
      selectionInfo.innerHTML = `<p><b>Выделенная область</b></p><p>Модулей: ${ids.components.length}</p><p>Проводов: ${ids.wires.length}</p><p>Текстов: ${ids.texts.length}</p><p class="muted">Можно удалить, скопировать или вставить фрагмент.</p>`;
    }
  }

  function startMultiDrag(pos) {
    const ids = selectedIds();
    const components = ids.components
      .map(id => {
        const c = getComp(id);
        return c ? { id, x: c.x, y: c.y } : null;
      })
      .filter(Boolean);
    const texts = ids.texts
      .map(id => {
        const t = getText(id);
        return t ? { id, x: t.x, y: t.y } : null;
      })
      .filter(Boolean);
    if (!components.length && !texts.length) return false;
    state.dragging = { kind: 'multi', start: { ...pos }, components, texts, historyPushed: false };
    setStatus(`Перемещение области: модулей ${components.length}, текстов ${texts.length}.`);
    updateInspector();
    draw();
    return true;
  }

  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function cancelInteraction() {
    state.wireStart=null;state.wireBends=[];state.selected=null;state.selecting=null;state.pendingSelect=null;state.dragging=null;state.panning=null;
    canvas.classList.remove('panning');updateInspector();setStatus('Выбор и незавершённый провод сброшены.');draw();
  }
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();cancelInteraction();});
  canvas.addEventListener('pointercancel',cancelInteraction);

  function cutWire(wire) {
    pushHistory();state.wires=state.wires.filter(w=>w.id!==wire.id);
    state.selected=null;state.wireStart=null;state.wireBends=[];state.issueFocus=null;simulate();
    setStatus('Провод удалён целиком. Ctrl Z — восстановить.');
  }

  function setTool(tool) {
    state.tool = tool;
    state.wireStart = null;state.wireBends=[];
    [selectToolBtn, wireToolBtn, textToolBtn, panToolBtn, document.getElementById('cutTool')].filter(Boolean).forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
    canvas.className = `tool-${tool}`;
    setStatus(tool === 'select' ? 'Выбор: клик по объекту — выбор; удерживай мышь и тяни по пустому месту — область.' : tool === 'wire' ? 'Провод: выбери выход, затем вход.' : tool === 'cut' ? 'Ножницы: нажмите на провод, чтобы удалить его целиком. Esc — сбросить выбор.' : tool === 'text' ? 'Текст/переменная: введи обычную подпись или @A для подключаемой переменной.' : 'Поле: тащи рабочую область для перемещения.');
    draw();
  }

  function ensureDragHistory(pos) {
    if (!state.dragging || state.dragging.historyPushed) return;
    const start = state.dragging.start || pos;
    if (Math.abs(pos.x - start.x) < 1 && Math.abs(pos.y - start.y) < 1) return;
    pushHistory();
    state.dragging.historyPushed = true;
  }

  function nudgeSelection(dx, dy) {
    const ids = selectedIds();
    if (!ids.components.length && !ids.texts.length) return false;
    pushHistory();
    ids.components.forEach(id => {
      const c = getComp(id);
      if (c) { c.x = snap(c.x + dx); c.y = snap(c.y + dy); }
    });
    ids.texts.forEach(id => {
      const t = getText(id);
      if (t) { t.x = snap(t.x + dx); t.y = snap(t.y + dy); }
    });
    simulate();
    setStatus(`Выделение сдвинуто на ${dx}, ${dy}.`);
    return true;
  }

  canvas.addEventListener('pointerdown', e => {
    if(e.button>1)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    document.querySelector('.menu').open=false;
    const pos = getPos(e); state.mouse = pos;
    if (state.tool === 'pan' || e.button === 1 || e.altKey) {
      state.panning = { x: e.clientX, y: e.clientY, sl: viewport.scrollLeft, st: viewport.scrollTop };
      canvas.classList.add('panning');
      return;
    }
    if (state.tool === 'text') { addTextAt(pos); return; }
    if(state.tool==='cut'){const w=hitTestWire(pos);if(w)cutWire(w,pos);else setStatus('Нажмите непосредственно на провод.');return;}
    if (state.tool === 'wire') {
      const hitPin = hitTestPin(pos);
      if (hitPin) {
        if (!state.wireStart) { state.wireBends=[];state.wireStart = hitPin; setStatus(`Выбран вывод ${hitPin.pin.label}. Теперь нажми на ${hitPin.pin.dir === 'out' ? 'вход' : 'выход'} другого модуля.`); }
        else if(state.wireStart.comp.id===hitPin.comp.id&&state.wireStart.pin.id===hitPin.pin.id)cancelInteraction();else connect(state.wireStart, hitPin);
        draw(); return;
      }
      if(state.wireStart){if(!e.shiftKey){cancelInteraction();return;}if(state.wireBends.length>=16){setStatus('Максимум 16 точек маршрута.');return;}state.wireBends.push({x:snap(pos.x),y:snap(pos.y)});setStatus('Точка маршрута добавлена. Нажмите вход для завершения; Esc или пустое поле — отмена.');draw();return;}
      return;
    }
    if(state.selected?.kind==='wire'){const w=state.wires.find(w=>w.id===state.selected.id),i=(w?.bends||[]).findIndex(p=>Math.hypot(p.x-pos.x,p.y-pos.y)<10);if(i>=0){state.dragging={kind:'bend',id:w.id,index:i,start:{...pos},historyPushed:false};return;}}
    const txt = hitTestText(pos);
    if (txt) {
      if (state.selected?.kind === 'multi' && state.selected.texts.includes(txt.id) && startMultiDrag(pos)) return;
      state.selected = { kind: 'text', id: txt.id };
      state.dragging = { kind: 'text', id: txt.id, dx: pos.x - txt.x, dy: pos.y - txt.y, start: { ...pos }, historyPushed: false };
      updateInspector(); draw(); return;
    }
    const comp = hitTestComponent(pos);
    if (comp) {
      if (state.selected?.kind === 'multi' && state.selected.components.includes(comp.id) && startMultiDrag(pos)) return;
      state.selected = { kind: 'component', id: comp.id };
      state.dragging = { kind: 'component', id: comp.id, dx: pos.x - comp.x, dy: pos.y - comp.y, start: { ...pos }, historyPushed: false };
      updateInspector(); draw(); return;
    }
    const wire = hitTestWire(pos);
    if (wire) { state.selected = state.selected?.kind==='wire'&&state.selected.id===wire.id?null:{ kind: 'wire', id: wire.id }; updateInspector(); draw(); return; }
    state.selected=null;updateInspector();draw();
    state.pendingSelect = { start: pos, end: pos, mode: e.shiftKey ? 'add' : (e.altKey ? 'remove' : 'replace') };
  });

  window.addEventListener('pointermove', e => {
    const pos = getPos(e); state.mouse = pos;
    if (state.panning) {
      viewport.scrollLeft = state.panning.sl - (e.clientX - state.panning.x);
      viewport.scrollTop = state.panning.st - (e.clientY - state.panning.y);
      return;
    }
    if (state.dragging) {
      ensureDragHistory(pos);
      if(state.dragging.kind==='bend'){const w=state.wires.find(w=>w.id===state.dragging.id);if(w)w.bends[state.dragging.index]={x:Math.max(0,Math.min(WORLD_W,snap(pos.x))),y:Math.max(0,Math.min(WORLD_H,snap(pos.y)))};}
      else if (state.dragging.kind === 'component') {
        const c = getComp(state.dragging.id); if (c) { c.x = Math.max(30,Math.min(WORLD_W-getDef(c).w-30,snap(pos.x-state.dragging.dx))); c.y = Math.max(30,Math.min(WORLD_H-getDef(c).h-60,snap(pos.y-state.dragging.dy))); }
      } else if (state.dragging.kind === 'text') {
        const t = getText(state.dragging.id); if (t) { t.x = snap(pos.x - state.dragging.dx); t.y = snap(pos.y - state.dragging.dy); }
      } else if (state.dragging.kind === 'multi') {
        const dx = pos.x - state.dragging.start.x;
        const dy = pos.y - state.dragging.start.y;
        for (const item of state.dragging.components) {
          const c = getComp(item.id);
          if (c) { c.x = snap(item.x + dx); c.y = snap(item.y + dy); }
        }
        for (const item of state.dragging.texts) {
          const t = getText(item.id);
          if (t) { t.x = snap(item.x + dx); t.y = snap(item.y + dy); }
        }
      }
      requestDraw(); return;
    }
    if (state.pendingSelect) {
      state.pendingSelect.end = pos;
      const r = normalizeRect(state.pendingSelect.start, state.pendingSelect.end);
      if (r.w > 6 || r.h > 6) {
        state.selecting = state.pendingSelect;
        state.pendingSelect = null;
        state.selected = null;
        updateInspector();
      }
    }
    if (state.selecting) { state.selecting.end = pos; requestDraw(); return; }
    if (state.wireStart) requestDraw();
  });

  window.addEventListener('pointerup', () => {
    if (state.pendingSelect) {
      state.pendingSelect = null;
      state.selected = null;
      updateInspector();
      draw();
    }
    if (state.selecting) {
      const r = normalizeRect(state.selecting.start, state.selecting.end);
      const mode = state.selecting.mode || 'replace';
      state.selecting = null;
      if (r.w > 8 || r.h > 8) selectArea(r, mode); else { state.selected = null; updateInspector(); draw(); }
    }
    state.dragging = null;
    state.panning = null;
    canvas.classList.remove('panning');
  });

  canvas.addEventListener('dblclick', e => {
    if(state.tool==='cut'||state.tool==='wire')return;
    const pos = getPos(e);
    const text = hitTestText(pos);
    if (text) { state.selected = { kind: 'text', id: text.id }; editSelection(); return; }
    const comp = hitTestComponent(pos);
    if(!comp){const w=hitTestWire(pos);if(w){if((w.bends?.length||0)>=16)return;pushHistory();(w.bends||=[]).push({x:snap(pos.x),y:snap(pos.y)});state.selected={kind:'wire',id:w.id};updateInspector();draw();}return;}
    if (comp.type === 'switch') { pushHistory(); comp.state.on = !comp.state.on; setStatus(`Переключатель ${comp.id}: ${comp.state.on ? 1 : 0}`); }
    else if (comp.type === 'variable') { pushHistory(); comp.state.on = !comp.state.on; setStatus(`Переменная ${comp.state.label || comp.id}: ${comp.state.on ? 1 : 0}`); }
    else if (comp.type === 'display' || comp.type === 'seven_segment') { pushHistory(); cycleDisplayMode(comp); }
    simulate();
  });

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); exportJSON(); return; }
    if (document.getElementById('importDialog').open || document.getElementById('themeDialog')?.open) return;
    if(e.key==='Escape'){e.preventDefault();cancelInteraction();return;}
    if(isEditableTarget(e.target))return;
    if((e.ctrlKey||e.metaKey)&&key==='a'){e.preventDefault();state.selected={kind:'multi',components:state.components.map(c=>c.id),wires:state.wires.map(w=>w.id),texts:state.texts.map(t=>t.id)};updateInspector();draw();return;}
    if (key === '/') { e.preventDefault(); moduleSearch.focus(); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'c') { e.preventDefault(); copySelection(); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'v') { e.preventDefault(); pasteClipboard(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (state.selected) { e.preventDefault(); deleteSelection(); } return; }

    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && state.selected) {
      e.preventDefault();
      const step = e.shiftKey ? GRID : SNAP;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      nudgeSelection(dx, dy);
      return;
    }
    if (key === 'v' && !e.ctrlKey && !e.metaKey) setTool('select');
    if (key === 'w' && !e.ctrlKey && !e.metaKey) setTool('wire');
    if (key === 't' && !e.ctrlKey && !e.metaKey) setTool('text');
    if (key === 'h' && !e.ctrlKey && !e.metaKey) setTool('pan');
    if (key === 'c' && !e.ctrlKey && !e.metaKey) setTool('cut');
  });

  runBtn.addEventListener('click', () => { state.running = !state.running; runBtn.classList.toggle('active', state.running); runBtn.textContent = state.running ? 'Ⅱ Пауза' : '▷ Запустить'; setStatus(state.running ? 'Симуляция запущена.' : 'Симуляция остановлена.'); });
  tickBtn.addEventListener('click', () => { state.clock = !state.clock; simulate(); setStatus('Выполнен один такт clock.'); });
  if (checkBtn) checkBtn.addEventListener('click', runCircuitCheck);
  if (checkBtnSide) checkBtnSide.addEventListener('click', runCircuitCheck);
  if (clearCheckBtn) clearCheckBtn.addEventListener('click', clearCircuitCheck);
  if (clearCheckBtnSide) clearCheckBtnSide.addEventListener('click', clearCircuitCheck);
  if (truthBtn) truthBtn.addEventListener('click', generateTruthTable);
  if (truthBtnSide) truthBtnSide.addEventListener('click', generateTruthTable);
  if (exportTruthCsvBtn) exportTruthCsvBtn.addEventListener('click', exportTruthCSV);
  if (exportTruthHtmlBtn) exportTruthHtmlBtn.addEventListener('click', exportTruthHTML);
  if (exportPngBtn) exportPngBtn.addEventListener('click', exportPNG);
  if (diagnosticsInfo) diagnosticsInfo.addEventListener('click', e => {
    const btn = e.target.closest('[data-issue-index]');
    if (!btn) return;
    focusIssue(Number(btn.dataset.issueIndex));
  });
  clearBtn.addEventListener('click', () => { if(confirm('Очистить поле?')) { pushHistory(); resetBoard(); } });
  sampleBtn.addEventListener('click', () => { pushHistory(); createSample(); });
  // Theme events and persistence live in themes.js.
  saveBtn.addEventListener('click', exportJSON);
  loadBtn.addEventListener('click', () => loadFile.click());
  loadFile.addEventListener('change', importJSON);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  copyBtn.addEventListener('click', copySelection);
  pasteBtn.addEventListener('click', pasteClipboard);
  editBtn.addEventListener('click', editSelection);
  deleteBtn.addEventListener('click', deleteSelection);
  [selectToolBtn, wireToolBtn, textToolBtn, panToolBtn, document.getElementById('cutTool')].filter(Boolean).forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));
  zoomSelect.addEventListener('change', () => setZoom(zoomSelect.value));
  zoomInBtn.addEventListener('click', () => setZoom(nextZoom(1)));
  zoomOutBtn.addEventListener('click', () => setZoom(nextZoom(-1)));
  if (wireGlowAllToggle) wireGlowAllToggle.addEventListener('change', () => setWireGlowMode(wireGlowAllToggle.checked ? 'all' : 'active'));
  viewport.addEventListener('wheel', e => { if(state.tool!=='pan'||!e.deltaY)return;e.preventDefault();setZoom(nextZoom(e.deltaY < 0 ? 1 : -1), e); }, { passive: false });



  function getTruthInputs() {
    const result=[];
    for(const c of state.components){
      if(c.type==='input')for(let i=0;i<bitWidth(c);i++)result.push({cid:c.id,bit:i,label:`${c.id}.D${i}`});
      else if(['switch','variable'].includes(c.type)&&!state.wires.some(w=>w.to.cid===c.id))result.push({cid:c.id,label:c.state.label||c.id});
    }
    return result;
  }

  function getTruthOutputs() {
    const result = [];
    const seen = new Set();
    const add = (key, label, getter) => {
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ key, label, getter });
    };

    for (const c of state.components) {
      if (c.type === 'led' || c.type === 'indicator') {
        for(let i=0;i<bitWidth(c);i++)add(`${c.id}:in${i}`,`${getDef(c).name} ${c.id}${bitWidth(c)>1?'.'+i:''}`,()=>getInputSignal(c,bitWidth(c)===1?'in':'in'+i));
      } else if (c.type === 'display' || c.type === 'seven_segment') {
        add(`${c.id}:value`, `${getDef(c).name} ${c.id}`, () => displayTruthValue(c));
      }
    }

    for (const c of state.components) {
      const def = getDef(c);
      if (!def) return;
      for (const p of def.outputs || []) {
        const used = state.wires.some(w => w.from && w.from.cid === c.id && w.from.pid === p.id);
        if (!used) add(`${c.id}:${p.id}`, `${getDef(c).name} ${c.id}.${p.label || p.id}`, () => toSignal((c.outputs || {})[p.id]));
      }
    }
    for(const c of state.components.filter(c=>c.type==='probe'))for(let i=0;i<bitWidth(c);i++)add(`${c.id}:in${i}`,`${c.id}.D${i}`,()=>getInputSignal(c,'in'+i));
    return result;
  }

  function displayTruthValue(c) {
    const width = Math.max(1, Math.min(bitWidth(c), 16));
    const vals = Array.from({ length: width }, (_, i) => getInputSignal(c, 'd' + i));
    if (vals.some(v => v === SIG.X)) return 'X';
    if (vals.some(v => v === SIG.Z)) return 'Z';
    const n = vals.reduce((sum, v, i) => sum + (v === SIG.ONE ? (1 << i) : 0), 0);
    if (c.type === 'seven_segment') return n.toString(16).toUpperCase();
    const mode = (c.state && c.state.mode) || 'dec';
    if (mode === 'hex') return '0x' + n.toString(16).toUpperCase();
    if (mode === 'bin') return n.toString(2).padStart(width, '0');
    return String(n);
  }

  function captureComponentRuntime() {
    return state.components.map(c => ({
      id: c.id,
      state: structuredClone(c.state || {}),
      inputs: structuredClone(c.inputs || {}),
      outputs: structuredClone(c.outputs || {}),
      prevInputs: structuredClone(c.prevInputs || {})
    }));
  }

  function restoreComponentRuntime(runtime) {
    const map = new Map(runtime.map(x => [x.id, x]));
    for (const c of state.components) {
      const saved = map.get(c.id);
      if (!saved) continue;
      c.state = structuredClone(saved.state || {});
      c.inputs = structuredClone(saved.inputs || {});
      c.outputs = structuredClone(saved.outputs || {});
      c.prevInputs = structuredClone(saved.prevInputs || {});
    }
  }

  function setTruthInputValue(item, bit) {
    const c = getComp(item.cid);
    if (!c) return;
    if(c.type==='input'){const mask=2**item.bit;c.state.value=bit?((c.state.value||0)|mask):((c.state.value||0)&~mask);}
    else c.state.on = !!bit;
  }

  function generateTruthTable() {
    const inputs = getTruthInputs();
    const outputs = getTruthOutputs();
    const warnings = [];
    if (!inputs.length) warnings.push('Не найдено ручных входов без входного подключения. Добавьте переключатель или переменную.');
    if (!outputs.length) warnings.push('Не найдено видимых выходов. Добавьте индикатор, дисплей или оставьте выход модуля свободным.');
    if (inputs.length > 12) warnings.push(`Слишком много входов (${inputs.length}). Таблица ограничена 12 входами, чтобы не строить больше 4096 строк.`);
    if (state.components.some(c => ['dff','rs_latch','jk_ff'].includes(c.type)||CircuitExtended.sequential.has(c.type))) warnings.push('В схеме есть элементы памяти. Таблица отражает текущую установившуюся реакцию при переборе входов, но не заменяет временную диаграмму.');

    if(inputs.length>12){state.truthTable=null;updateTruthPanel();truthInfo.textContent=warnings.join(' ');setStatus('Таблица не построена: максимум 12 ручных входов.');return;}
    const limitedInputs = inputs;
    const runtime = captureComponentRuntime();
    const showMarkers = state.showIssueMarkers;
    const rows = [];
    const rowCount = limitedInputs.length ? (1 << limitedInputs.length) : 0;
    state.suppressHistory = true;
    try {
      for (let mask = 0; mask < rowCount; mask++) {
        restoreComponentRuntime(runtime);
        limitedInputs.forEach((item, idx) => setTruthInputValue(item, (mask >> (limitedInputs.length - idx - 1)) & 1));
        state.showIssueMarkers = false;
        simulate(0);
        const inputValues = limitedInputs.map((item, idx) => String((mask >> (limitedInputs.length - idx - 1)) & 1));
        const outputValues = outputs.map(out => String(out.getter()));
        rows.push({ inputValues, outputValues });
      }
    } finally {
      restoreComponentRuntime(runtime);
      state.suppressHistory = false;
      state.showIssueMarkers = showMarkers;
      simulate(0);
    }

    state.truthTable = { inputs: limitedInputs.map(x => x.label), outputs: outputs.map(x => x.label), rows, warnings, generatedAt: new Date().toISOString() };
    updateTruthPanel();
    setStatus(rows.length ? `Таблица истинности построена: ${rows.length} строк.` : 'Таблица истинности не построена: недостаточно входов или выходов.');
  }

  function updateTruthPanel() {
    if (!truthInfo) return;
    const table = state.truthTable;
    const disabled = !table || !table.rows || !table.rows.length;
    if (exportTruthCsvBtn) exportTruthCsvBtn.disabled = disabled;
    if (exportTruthHtmlBtn) exportTruthHtmlBtn.disabled = disabled;
    if (disabled) {
      truthInfo.innerHTML = '<p class="muted">Таблица ещё не построена. Используются ручные источники без входного подключения: переключатели и переменные.</p>';
      return;
    }
    const heads = [...table.inputs, ...table.outputs].map(h => `<th>${escapeHTML(h)}</th>`).join('');
    const rows = table.rows.slice(0, 18).map(r => `<tr>${[...r.inputValues, ...r.outputValues].map(v => `<td>${escapeHTML(v)}</td>`).join('')}</tr>`).join('');
    const more = table.rows.length > 18 ? `<p class="muted">Показаны первые 18 строк из ${table.rows.length}. Полная таблица доступна через CSV/HTML.</p>` : '';
    const warnings = table.warnings && table.warnings.length ? `<ul class="truth-warnings">${table.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>` : '';
    truthInfo.innerHTML = `${warnings}<div class="truth-scroll"><table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>${more}`;
  }

  function truthCSVText() {
    const t = state.truthTable;
    if (!t) return '';
    const quote = v => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = [[...t.inputs, ...t.outputs].map(quote).join(',')];
    for (const r of t.rows) lines.push([...r.inputValues, ...r.outputValues].map(quote).join(','));
    return lines.join('\n');
  }

  function truthHTMLText() {
    const t = state.truthTable;
    if (!t) return '';
    const heads = [...t.inputs, ...t.outputs].map(h => `<th>${escapeHTML(h)}</th>`).join('');
    const rows = t.rows.map(r => `<tr>${[...r.inputValues, ...r.outputValues].map(v => `<td>${escapeHTML(v)}</td>`).join('')}</tr>`).join('\n');
    const warnings = t.warnings && t.warnings.length ? `<section><h2>Предупреждения</h2><ul>${t.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul></section>` : '';
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Таблица истинности — Logic Studio</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#172033}table{border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:center}th{background:#355ca8;color:#fff}h1{color:#355ca8}</style></head><body><h1>Таблица истинности</h1>${warnings}<table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }

  function downloadText(filename, text, mime='text/plain;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportTruthCSV() {
    if (!state.truthTable || !state.truthTable.rows.length) generateTruthTable();
    if (!state.truthTable || !state.truthTable.rows.length) return;
    downloadText('logic_studio_truth_table.csv', truthCSVText(), 'text/csv;charset=utf-8');
    setStatus('Таблица истинности экспортирована в CSV.');
  }

  function exportTruthHTML() {
    if (!state.truthTable || !state.truthTable.rows.length) generateTruthTable();
    if (!state.truthTable || !state.truthTable.rows.length) return;
    downloadText('logic_studio_truth_table.html', truthHTMLText(), 'text/html;charset=utf-8');
    setStatus('Таблица истинности экспортирована в HTML.');
  }

  function downloadBlob(filename, blob) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportPNGFromDataURL() {
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'logic_studio_scheme.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Рабочая область экспортирована в PNG.');
  }

  function exportPNG() {
    draw();
    try {
      if (!canvas.toBlob) {
        exportPNGFromDataURL();
        return;
      }
      canvas.toBlob(blob => {
        if (blob) {
          downloadBlob('logic_studio_scheme.png', blob);
          setStatus('Рабочая область экспортирована в PNG.');
        } else {
          exportPNGFromDataURL();
        }
      }, 'image/png');
    } catch (err) {
      try {
        exportPNGFromDataURL();
      } catch (fallbackErr) {
        console.error('PNG export failed:', err, fallbackErr);
        alert('Не удалось экспортировать PNG. Открой проект через локальный сервер или обнови браузер.');
        setStatus('PNG не экспортирован: браузер заблокировал сохранение canvas.');
      }
    }
  }

  function runCircuitCheck() {
    state.showIssueMarkers = true;
    state.issueFocus = null;
    state.lastManualCheck = Date.now();
    simulate(0);
    updateDiagnostics();
    draw();
    const count = (state.signalIssues || []).length;
    setStatus(count ? `Проверка завершена: найдено предупреждений ${count}. Нажми «Показать» в диагностике, чтобы перейти к месту.` : 'Проверка завершена: ошибок и предупреждений не найдено.');
  }

  function clearCircuitCheck() {
    state.showIssueMarkers = false;
    state.issueFocus = null;
    state.lastManualCheck = 0;
    simulate(0);
    updateDiagnostics();
    draw();
    setStatus('Маркеры проверки скрыты. Пунктирная подсветка убрана с поля.');
  }

  function focusIssue(index) {
    const issue = (state.signalIssues || [])[index];
    if (!issue) return;
    state.showIssueMarkers = true;
    state.issueFocus = index;
    const center = issueTargetCenter(issue.target);
    if (center) {
      viewport.scrollLeft = Math.max(0, center.x * state.zoom - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, center.y * state.zoom - viewport.clientHeight / 2);
    }
    setStatus(`Показана проблема: ${issue.message}`);
    draw();
  }

  function issueTargetCenter(target) {
    if (!target) return null;
    if (target.kind === 'component') {
      const c = getComp(target.id); if (!c) return null;
      const d = getDef(c); if (!d) return null;
      return { x: c.x + d.w / 2, y: c.y + d.h / 2 };
    }
    if (target.kind === 'pin') {
      const c = getComp(target.cid); if (!c) return null;
      const p = getPins(c).find(pin => pin.id === target.pid); if (!p) return null;
      return pinPos(c, p);
    }
    if (target.kind === 'wire') {
      const w = state.wires.find(x => x.id === target.id); if (!w) return null;
      const pts = wirePoints(w); if (!pts.length) return null;
      return pts[Math.floor(pts.length / 2)];
    }
    return null;
  }

  function setWireGlowMode(mode) {
    state.wireGlowMode = mode === 'all' ? 'all' : 'active';
    if (wireGlowAllToggle) wireGlowAllToggle.checked = state.wireGlowMode === 'all';
    if (wireGlowLabel) wireGlowLabel.textContent = state.wireGlowMode === 'all' ? 'Все' : 'Активные';
    writeStorage('logic_studio_wire_glow', state.wireGlowMode);
    setStatus(state.wireGlowMode === 'all'
      ? 'Подсветка проводов: светятся все подключённые жгутики независимо от сигнала.'
      : 'Подсветка проводов: светятся только активные жгутики с сигналом 1.');
    draw();
  }

  function nextZoom(dir) {
    const values = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
    let idx = values.findIndex(v => v >= state.zoom - 0.001);
    if (idx < 0) idx = 2;
    return values[Math.max(0, Math.min(values.length-1, idx + dir))];
  }


  function setTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('theme-dark', state.theme === 'dark');
    themeCache.clear();
    themeBtn.textContent = state.theme === 'dark' ? '☀ Светлая' : '☾ Тёмная';
    themeBtn.title = state.theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему';
    writeStorage('logic_studio_theme', state.theme);
    draw();
  }

  function cycleDisplayMode(comp) {
    const modes = comp.type === 'display' ? ['dec', 'hex', 'bin'] : ['dec', 'hex'];
    const idx = modes.indexOf(comp.state.mode || 'dec');
    comp.state.mode = modes[(idx + 1) % modes.length];
    setStatus(`${getDef(comp).name}: формат ${comp.state.mode.toUpperCase()}.`);
  }

  function resetBoard() {
    projectTitle.value='Новая схема';projectDescription='';updateReport();state.truthTable=null;updateTruthPanel();
    state.components = []; state.wires = []; state.texts = []; state.selected = null; state.wireStart = null; state.sourceColors = {}; state.colorIndex = 0; state.showIssueMarkers = false; state.issueFocus = null;
    simulate(); setStatus('Поле очищено.');
  }

  function createSample() {
    resetBoard();projectTitle.value='Полусумматор';projectDescription='Полусумматор складывает два бита. Сумма S = A XOR B, перенос C = A AND B. Дважды нажмите вход A или B, чтобы изменить сигнал.';updateReport();
    const a=make('switch',120,120,{on:true}),b=make('switch',120,260,{on:false});
    const sum=make('xor',390,120),carry=make('and',390,260);
    const s=make('indicator',660,120),c=make('indicator',660,260);
    connectById(a.id,'out',sum.id,'a');connectById(b.id,'out',sum.id,'b');
    connectById(a.id,'out',carry.id,'a');connectById(b.id,'out',carry.id,'b');
    connectById(sum.id,'y',s.id,'in');connectById(carry.id,'y',c.id,'in');
    addTextSilent('ПОЛУСУММАТОР',120,65);addTextSilent('A',80,160);addTextSilent('B',80,300);
    addTextSilent('S · сумма',690,95);addTextSilent('C · перенос',690,235);
    simulate();fitCircuit();setStatus('Полусумматор · двойной клик по входу меняет 0 / 1.');
  }

  function make(type, x, y, patchState = {}, patchProps = {}) {
    const c = { id: 'm'+state.nextId++, type, x, y, state: { ...defaultState(type), ...patchState }, props: { ...defaultPropsFor(type), ...patchProps }, inputs: {}, outputs: {}, prevInputs: {} };
    normalizeComponentProps(c);
    state.components.push(c); return c;
  }
  function addTextSilent(text, x, y) { state.texts.push({ id: 't'+state.nextId++, x, y, text, size: 18, color: '#0f172a' }); }

  function connectById(cid1, pid1, cid2, pid2) {
    const c1 = getComp(cid1), c2 = getComp(cid2);
    const p1 = getPins(c1,'out').find(p => p.id === pid1);
    const p2 = getPins(c2,'in').find(p => p.id === pid2);
    const sourceKey = `${c1.id}:${p1.id}`;
    if (!state.sourceColors[sourceKey]) state.sourceColors[sourceKey] = WIRE_COLORS[state.colorIndex++ % WIRE_COLORS.length];
    state.wires.push({ id:'w'+state.nextId++, from:{cid:c1.id,pid:p1.id}, to:{cid:c2.id,pid:p2.id}, color: state.sourceColors[sourceKey] });
  }

  function projectData() {
    return {version:'logic-studio-v2',title:projectTitle.value||'Новая схема',description:projectDescription,customDefs:state.customDefs,components:state.components,wires:state.wires,texts:state.texts,nextId:state.nextId,colorIndex:state.colorIndex,sourceColors:state.sourceColors};
  }
  function exportJSON() {
    const data=JSON.stringify(projectData(),null,2);saveLocal();
    downloadText('logic_studio_board.json',data,'application/json');setStatus('Схема скачана в JSON.');
  }

  async function importJSON(e) {
    const file=e.target.files[0];if(!file)return;
    try {if(file.size>2_000_000)throw new Error('Размер файла не должен превышать 2 МБ.');loadProjectText(await file.text());document.getElementById('importDialog').close();}
    catch(err){showImportError(err.message);}
    finally{e.target.value='';}
  }

  function loadProjectText(text, history=true) {
    const data=prepareProject(typeof CircuitCode==='undefined'?CircuitSchema.parse(text):CircuitCode.parse(text));
    if(history)pushHistory();
    installCustomDefs(data.customDefs||[]);
    Object.assign(state,{components:data.components,wires:data.wires,texts:data.texts,nextId:data.nextId,colorIndex:data.colorIndex,sourceColors:data.sourceColors,selected:null,wireStart:null,wireBends:[],dragging:null,selecting:null,pendingSelect:null,clock:false,tickNo:0,truthTable:null,showIssueMarkers:false,issueFocus:null});
    projectTitle.value=data.title;projectDescription=data.description;updateReport();updateTruthPanel();simulate();fitCircuit();
    setStatus(`Открыта схема «${data.title}»: ${data.components.length} блоков, ${data.wires.length} соединений.`);saveLocal();
  }
  function prepareProject(raw) {
    const data=CircuitSchema.normalize(raw);
    const lookup=Object.fromEntries((data.customDefs||[]).map(d=>[d.type,d]));
    const projectPins=(c,dir)=>lookup[c.type]?lookup[c.type][dir==='out'?'outputs':'inputs']:getPins(c,dir);
    data.components=data.components.map(c=>normalizeComponentProps({...c,state:{...defaultState(c.type),...c.state}}));
    const map=new Map(data.components.map(c=>[c.id,c]));
    for(const w of data.wires) {
      if(!projectPins(map.get(w.from.cid),'out').some(p=>p.id===w.from.pid)||!projectPins(map.get(w.to.cid),'in').some(p=>p.id===w.to.pid)) throw new Error(`Провод ${w.id}: отсутствует выход ${w.from.pid} или вход ${w.to.pid}.`);
    }
    for(const def of data.customDefs||[]){
      if(!def.source)continue;
      const internal=new Map(def.source.components.map(c=>[c.id,normalizeComponentProps(c)]));
      for(const w of def.source.wires)if(!projectPins(internal.get(w.from.cid),'out').some(p=>p.id===w.from.pid)||!projectPins(internal.get(w.to.cid),'in').some(p=>p.id===w.to.pid))throw new Error(`Подсхема ${def.name}: неверные пины провода ${w.id}.`);
      for(const [ports,dir]of [[def.source.inputs,'in'],[def.source.outputs,'out']])for(const port of ports)if(!projectPins(internal.get(port.cid),dir).some(p=>p.id===port.pid))throw new Error(`Подсхема ${def.name}: неверный порт ${port.pid}.`);
    }
    return data;
  }

  function showImportError(message) {
    const dialog=document.getElementById('importDialog');if(!dialog.open)dialog.showModal();
    const error=document.getElementById('importError');error.textContent=message;error.hidden=false;
  }
  function updateReport() {
    document.getElementById('reportCard').hidden=!projectDescription;
    document.getElementById('reportText').textContent=projectDescription;
  }
  function fitCircuit() {
    if(!state.components.length&&!state.texts.length){viewport.scrollLeft=0;viewport.scrollTop=0;return;}
    const boxes=[...state.components.map(c=>{const d=getDef(c);return{x:c.x-30,y:c.y-30,w:d.w+90,h:d.h+85};}),...state.texts.map(textBounds)];
    const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y));
    const maxX=Math.max(...boxes.map(b=>b.x+b.w)),maxY=Math.max(...boxes.map(b=>b.y+b.h));
    const target=Math.min(1,(viewport.clientWidth-40)/(maxX-minX),(viewport.clientHeight-40)/(maxY-minY));
    const z=[.1,.25,.5,.75,1].filter(v=>v<=target).pop()||.1;setZoom(z);
    viewport.scrollLeft=Math.max(0,(minX+maxX)/2*z-viewport.clientWidth/2);
    viewport.scrollTop=Math.max(0,(minY+maxY)/2*z-viewport.clientHeight/2);
  }
  function saveLocal() {
    if(navigation.length){document.getElementById('saveState').textContent='Подсхема · вернитесь в проект для сохранения';return;}
    const text=JSON.stringify(projectData());if(text===lastSaved)return;
    const ok=writeStorage('logic_studio_board',text);if(ok)lastSaved=text;
    document.getElementById('saveState').textContent=ok?'Сохранено в этом браузере':'Автосохранение недоступно · скачайте JSON';
  }
  function openSubcircuit(c) {
    const def=defs[c.type];if(!def?.source)return;
    if(navigation.length>=8){setStatus('Максимум 8 уровней подсхем.');return;}
    saveLocal();navigation.push({project:structuredClone(projectData()),type:c.type,undo:state.undoStack,redo:state.redoStack});
    const source={...structuredClone(def.source),title:def.name,description:`Редактирование подсхемы «${def.name}». Порты привязаны к исходным пинам. После изменений нажмите «К проекту».`,customDefs:state.customDefs};
    loadProjectText(JSON.stringify(source),false);state.undoStack=[];state.redoStack=[];updateHistoryButtons();
    document.getElementById('backToProject').hidden=false;showPanel('properties');
  }
  function returnToProject() {
    const entry=navigation.at(-1);if(!entry)return;
    try{
      const original=entry.project.customDefs.find(d=>d.type===entry.type);
      const updated={...original,table:{},source:{components:structuredClone(state.components),wires:structuredClone(state.wires),inputs:original.source.inputs,outputs:original.source.outputs}};
      const library=state.customDefs.map(d=>d.type===entry.type?updated:d);
      const clean=CircuitSchema.normalizeLibrary(library);
      const map=new Map(updated.source.components.map(c=>[c.id,c]));
      const lookup=Object.fromEntries(clean.map(d=>[d.type,d]));
      for(const [ports,dir]of [[updated.source.inputs,'in'],[updated.source.outputs,'out']])for(const port of ports){const child=map.get(port.cid),pins=lookup[child.type]?lookup[child.type][dir==='in'?'inputs':'outputs']:getPins(child,dir);if(!pins.some(p=>p.id===port.pid))throw new Error(`Порт ${port.cid}.${port.pid} удалён или изменён. Восстановите его перед возвратом.`);}
      navigation.pop();loadProjectText(JSON.stringify(entry.project),false);state.undoStack=entry.undo;state.redoStack=entry.redo;pushHistory();installCustomDefs(clean);simulate();saveLocal();
      document.getElementById('backToProject').hidden=!navigation.length;setStatus('Изменения подсхемы применены ко всем её экземплярам.');
    }catch(err){setStatus('Не удалось применить подсхему: '+err.message);}
  }
  function showPanel(name) {
    document.querySelectorAll('[data-panel]').forEach(b=>{const active=b.dataset.panel===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    document.querySelectorAll('.inspector-panel').forEach(p=>p.hidden=p.id!=='panel-'+name);
  }

  function bindExtendedControls(c) {
    document.getElementById('propOrientation')?.addEventListener('change',e=>{pushHistory();c.props.orientation=e.target.value;simulate();});
    const value=document.getElementById('propValue');
    if(value)value.addEventListener('change',()=>{const n=Number(value.value);if(value.value===''||!Number.isInteger(n)||n<0||n>=2**bitWidth(c)){value.value=c.state.value||0;setStatus('Значение вне диапазона разрядности.');return;}pushHistory();c.state.value=n;simulate();});
    const direction=document.getElementById('propDirection');
    if(direction)direction.addEventListener('change',()=>{pushHistory();c.state.direction=direction.value;simulate();});
    const memory=document.getElementById('applyMemoryBtn');
    if(memory)memory.addEventListener('click',()=>{
      const text=document.getElementById('propMemory').value.trim();const parts=text?text.split(/[\s,;]+/):[];
      const limit=2**addressBits(c),max=2**bitWidth(c)-1;
      const vals=parts.map(v=>v==='X'?null:/^(?:0x[\da-f]+|\d+)$/i.test(v)?Number(v):NaN);
      if(vals.length>limit||vals.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>max))){setStatus(`Память: до ${limit} слов со значениями 0–${max}, DEC / 0xHEX / X.`);return;}
      pushHistory();c.state.memory=vals;simulate();setStatus('Содержимое памяти обновлено.');
    });
  }
  function drawBusDisplay(c) {
    const def=getDef(c),n=bitWidth(c);let value=c.type==='input'?(c.state.value||0):0;
    if(c.type==='probe'){const bits=Array.from({length:n},(_,i)=>getInputSignal(c,'in'+i));value=bits.some(signalUnknown)?null:bits.reduce((a,b,i)=>a+(b==='1'?2**i:0),0);}
    ctx.save();ctx.fillStyle=cssVar('--component-text','#364d59');ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 25px Consolas,monospace';ctx.fillText(value===null?'X':String(value),c.x+def.w/2,c.y+def.h/2-5,def.w-20);
    ctx.fillStyle=cssVar('--muted','#75818c');ctx.font='10px Consolas,monospace';ctx.fillText(`${n} BIT · ${value===null?'X':'0x'+value.toString(16).toUpperCase()}`,c.x+def.w/2,c.y+def.h/2+19);ctx.restore();
  }
  const trace={recording:false,rows:[],labels:[],start:0,last:''};
  function recordTrace() {
    if(!trace.recording||state.suppressHistory)return;
    const outputs=getTruthOutputs().slice(0,12);const labels=outputs.map(o=>o.label),values=outputs.map(o=>String(o.getter()));
    const key=JSON.stringify([labels,values,state.clock]);if(key===trace.last)return;
    if(JSON.stringify(labels)!==JSON.stringify(trace.labels)){trace.rows=[];trace.start=performance.now();trace.labels=labels;}
    trace.last=key;trace.rows.push({ms:Math.round(performance.now()-trace.start),values});
    if(trace.rows.length>256)trace.rows.shift();renderTrace();
  }
  function renderTrace() {
    const target=document.getElementById('traceInfo');if(!trace.rows.length){target.textContent='Нет записанных сигналов. Подключите выходы и начните запись.';return;}
    const rows=trace.rows.slice(-64),width=220,h=trace.labels.length*35+25;
    const min=rows[0].ms,max=Math.max(min+1,rows.at(-1).ms),x=time=>60+(time-min)/(max-min)*150;
    const lines=trace.labels.map((label,i)=>{
      const base=22+i*35,bit=rows.every(r=>['0','1','X','Z'].includes(r.values[i]));let path='';
      rows.forEach((r,j)=>{const y=base+(r.values[i]==='1'?-8:r.values[i]==='0'?8:0);if(j===0)path=`M${x(r.ms)},${y}`;else path+=`H${x(r.ms)}V${y}`;});
      const last=rows.at(-1).values[i];
      return `<text x="0" y="${base+4}" fill="currentColor" font-size="8">${escapeHTML(label.slice(0,10))}</text><path d="${path}" fill="none" stroke="${bit?'var(--accent)':'#9460cc'}" stroke-width="1.4"/><text x="213" y="${base+4}" fill="currentColor" font-size="8">${escapeHTML(last.slice(0,8))}</text>`;
    }).join('');
    target.innerHTML=`<div class="trace-scroll"><svg viewBox="0 0 ${width+50} ${h}" role="img" aria-label="Временная диаграмма записанных сигналов">${lines}<text x="60" y="${h-3}" font-size="8" fill="currentColor">${min} мс</text><text x="170" y="${h-3}" font-size="8" fill="currentColor">${max} мс</text></svg></div><p>${trace.rows.length} событий · запись ${trace.recording?'идёт':'остановлена'}</p>`;
  }
  document.getElementById('traceBtn').addEventListener('click',()=>{trace.recording=!trace.recording;document.getElementById('traceBtn').textContent=trace.recording?'Остановить':'Запись';if(trace.recording&&!trace.rows.length)trace.start=performance.now();trace.last='';recordTrace();renderTrace();});
  document.getElementById('traceClearBtn').addEventListener('click',()=>{trace.rows=[];trace.last='';trace.start=performance.now();renderTrace();});
  document.getElementById('traceExportBtn').addEventListener('click',()=>{if(!trace.rows.length){setStatus('Сначала запишите сигналы.');return;}const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';downloadText('logic_studio_trace.csv',[['ms',...trace.labels].map(quote).join(','),...trace.rows.map(r=>[r.ms,...r.values].map(quote).join(','))].join('\n'),'text/csv;charset=utf-8');});

  function customStorageKey() { return 'mirea_logic_custom_defs'; }

  function readCustomDefsFromStorage() { return state.customDefs || []; }

  function saveCustomDefsToStorage() { saveLocal(); }

  function installCustomDefs(list) {
    Object.keys(defs).forEach(k=>{if(defs[k]?.custom)delete defs[k];});
    state.customDefs=CircuitSchema.normalizeLibrary(list);
    state.customDefs.forEach(d=>defs[d.type]=d);
    updateCustomLibraryInfo();if(paletteList)buildPalette();
  }

  function sanitizeCustomDef(def) {
    if (!def || !def.type || !String(def.type).startsWith('custom_')) return null;
    const inputs = Array.isArray(def.inputs) ? def.inputs : [];
    const outputs = Array.isArray(def.outputs) ? def.outputs : [];
    if (!outputs.length) return null;
    return {
      ...def,
      group: 'USER COMPONENTS',
      custom: true,
      img: '',
      w: Number(def.w) || Math.max(116, 78 + Math.max(inputs.length, outputs.length) * 12),
      h: Number(def.h) || Math.max(70, 34 + Math.max(inputs.length, outputs.length) * 18),
      inputs,
      outputs,
      table: def.table || {},
      desc: def.desc || 'Пользовательский компонент, созданный из выделенного фрагмента схемы.'
    };
  }

  function updateCustomLibraryInfo() {
    if (!componentLibraryInfo) return;
    const n = (state.customDefs || []).length;
    componentLibraryInfo.textContent = n ? `В библиотеке пользовательских компонентов: ${n}.` : 'Пользовательских компонентов пока нет.';
  }

  function createCustomFromSelection() {
    const ids=selectedIds().components, comps=ids.map(getComp).filter(Boolean);
    if(!comps.length){setStatus('Выделите блоки будущей подсхемы.');return;}
    if(state.customDefs.length>=24){setStatus('Лимит библиотеки: 24 подсхемы.');return;}
    const source=buildSubcircuitSource(new Set(ids),comps);
    if(source.inputs.length>32||!source.outputs.length||source.outputs.length>32){setStatus('Подсхема должна иметь до 32 входов и от 1 до 32 выходов.');return;}
    const name=prompt('Название подсхемы:','Моя подсхема');if(!name?.trim())return;
    const inputPins=layoutPins(source.inputs.map((p,i)=>({id:'i'+i,label:p.label,side:'left'})));
    const outputPins=layoutPins(source.outputs.map((p,i)=>({id:'o'+i,label:p.label,side:'right'})));
    const sequential=comps.some(c=>['dff','jk_ff','rs_latch','clock','ram','rom'].includes(c.type)||CircuitExtended.sequential.has(c.type)||defs[c.type]?.source);
    const table=!sequential&&inputPins.length<=10?buildCustomTruthTable(source,inputPins,outputPins):{};
    pushHistory();
    const type='custom_'+state.nextId++;
    installCustomDefs([...state.customDefs,{type,name:name.trim().slice(0,60),inputs:inputPins,outputs:outputPins,table,source}]);
    simulate();saveLocal();setStatus(`Подсхема «${name.trim()}» добавлена в библиотеку и сохраняется вместе с проектом.`);
  }

  function layoutPins(pins) {
    const n = Math.max(1, pins.length);
    return pins.map((p, i) => ({ ...p, y: n === 1 ? .5 : (i + 1) / (n + 1) }));
  }

  function makeUniqueLabels(items, fallbackPrefix) {
    const used = new Map();
    return items.map((item, i) => {
      let base = String(item.label || `${fallbackPrefix}${i+1}`).replace(/\s+/g, '').slice(0, 10) || `${fallbackPrefix}${i+1}`;
      const count = (used.get(base) || 0) + 1;
      used.set(base, count);
      return { ...item, label: count > 1 ? `${base}${count}` : base };
    });
  }

  function buildSubcircuitSource(selectedSet, selectedComponents) {
    const selectedIds = new Set([...selectedSet]);
    const inputMap = new Map();
    const outputMap = new Map();

    for (const c of selectedComponents) {
      const def = getDef(c);
      for (const p of def.inputs || []) {
        const drivenByInside = state.wires.some(w => selectedIds.has(w.from.cid) && w.to.cid === c.id && w.to.pid === p.id);
        if (!drivenByInside) inputMap.set(`${c.id}:${p.id}`, { cid: c.id, pid: p.id, label: p.label || p.id, y: c.y + def.h * p.y });
      }
      for (const p of def.outputs || []) {
        const drivesInside = state.wires.some(w => w.from.cid === c.id && w.from.pid === p.id && selectedIds.has(w.to.cid));
        const drivesOutside = state.wires.some(w => w.from.cid === c.id && w.from.pid === p.id && !selectedIds.has(w.to.cid));
        if (!drivesInside || drivesOutside) outputMap.set(`${c.id}:${p.id}`, { cid: c.id, pid: p.id, label: p.label || p.id, y: c.y + def.h * p.y });
      }
    }

    const inputs = makeUniqueLabels([...inputMap.values()].sort((a,b)=>a.y-b.y), 'I');
    const outputs = makeUniqueLabels([...outputMap.values()].sort((a,b)=>a.y-b.y), 'O');
    return {
      components: selectedComponents.map(c => structuredClone(c)),
      wires: state.wires.filter(w => selectedIds.has(w.from.cid) && selectedIds.has(w.to.cid)).map(w => structuredClone(w)),
      inputs,
      outputs
    };
  }

  function buildCustomTruthTable(source, inputPins, outputPins) {
    const table = {};
    const total = 1 << inputPins.length;
    for (let mask = 0; mask < total; mask++) {
      const external = {};
      for (let i = 0; i < inputPins.length; i++) external[inputPins[i].id] = (mask & (1 << i)) ? SIG.ONE : SIG.ZERO;
      const outputs = simulateSubcircuit(source, external, inputPins, outputPins);
      const key = inputPins.map(p => external[p.id]).join('');
      table[key] = outputs;
    }
    return table;
  }

  function simulateSubcircuit(source, external, inputPins, outputPins) {
    const comps = source.components.map(c => ({ ...structuredClone(c), inputs: {}, outputs: {}, prevInputs: {}, inputDrivers: {} }));
    const map = new Map(comps.map(c => [c.id, c]));
    const inputByPin = new Map(inputPins.map((p, i) => [p.id, source.inputs[i]]));
    const outputByPin = new Map(outputPins.map((p, i) => [p.id, source.outputs[i]]));

    for (const c of comps) {
      const def = defs[c.type] || getDef(c);
      c.outputs = {};
      for (const p of (def?.outputs || [])) c.outputs[p.id] = SIG.Z;
    }
    for (let pass = 0; pass < 24; pass++) {
      const before = comps.map(c => `${c.id}:${JSON.stringify(c.outputs)}`).join('|');
      comps.forEach(c => { c.inputs = {}; });
      for (const [extPin, target] of inputByPin.entries()) {
        const c = map.get(target.cid);
        if (c) c.inputs[target.pid] = external[extPin] || SIG.ZERO;
      }
      for (const w of source.wires) {
        const from = map.get(w.from.cid), to = map.get(w.to.cid);
        if (!from || !to) continue;
        const incoming = toSignal((from.outputs || {})[w.from.pid]);
        const old = Object.prototype.hasOwnProperty.call(to.inputs, w.to.pid) ? to.inputs[w.to.pid] : SIG.Z;
        to.inputs[w.to.pid] = mergeSignalsPure(old, incoming);
      }
      comps.forEach(evalPureComponent);
      const after = comps.map(c => `${c.id}:${JSON.stringify(c.outputs)}`).join('|');
      if (before === after) break;
    }
    const result = {};
    for (const [outPin, sourcePin] of outputByPin.entries()) {
      const c = map.get(sourcePin.cid);
      result[outPin] = c ? toSignal((c.outputs || {})[sourcePin.pid]) : SIG.X;
    }
    return result;
  }

  function mergeSignalsPure(a, b) {
    a = toSignal(a); b = toSignal(b);
    if (a === SIG.Z) return b;
    if (b === SIG.Z) return a;
    if (a === b) return a;
    return SIG.X;
  }

  function evalPureComponent(c) { computeComponent(c,true); }

  const subcircuitCache=new WeakMap();
  let subcircuitDepth=0;
  function computeCustomComponent(c,holdMemory=false) {
    const def=getDef(c);
    if(def.source){
      if(subcircuitDepth>=8){def.outputs.forEach(p=>setOut(c,p.id,SIG.X));return;}
      subcircuitDepth++;
      try{
        let cached=subcircuitCache.get(c);
        if(!cached||cached.state!==c.state||cached.source!==def.source){
          const saved=new Map((c.state.childStates||[]).map(s=>[s.id,s.state]));
          const comps=def.source.components.map(child=>normalizeComponentProps({...structuredClone(child),state:{...defaultState(child.type),...structuredClone(child.state),...structuredClone(saved.get(child.id)||{})},inputs:{},outputs:{}}));
          cached={state:c.state,source:def.source,comps,map:new Map(comps.map(x=>[x.id,x]))};subcircuitCache.set(c,cached);
        }
        const{comps,map}=cached;
        const propagate=()=>{
          comps.forEach(child=>child.inputs={});
          def.inputs.forEach((p,i)=>{const target=def.source.inputs[i],child=map.get(target.cid);child.inputs[target.pid]=getInputSignal(c,p.id);});
          for(const w of def.source.wires){const from=map.get(w.from.cid),to=map.get(w.to.cid);to.inputs[w.to.pid]=mergeSignalsPure(to.inputs[w.to.pid],from.outputs[w.from.pid]);}
        };
        const settle=()=>{for(let pass=0;pass<Math.max(32,comps.length+2);pass++){const before=JSON.stringify(comps.map(x=>x.outputs));propagate();comps.forEach(x=>computeComponent(x,true));if(before===JSON.stringify(comps.map(x=>x.outputs)))break;}};
        settle();propagate();
        if(!holdMemory){comps.filter(child=>['dff','jk_ff'].includes(child.type)||CircuitExtended.sequential.has(child.type)||defs[child.type]?.source).forEach(child=>computeComponent(child,false));settle();}
        def.outputs.forEach((p,i)=>{const source=def.source.outputs[i];setOut(c,p.id,map.get(source.cid).outputs[source.pid]);});
        c.state.childStates=comps.map(child=>({id:child.id,state:structuredClone(child.state)}));
      }finally{subcircuitDepth--;}
      return;
    }
    const vals=def.inputs.map(p=>getInputSignal(c,p.id));
    if(vals.some(signalUnknown)){def.outputs.forEach(p=>setOut(c,p.id,SIG.X));return;}
    const row=def.table[vals.join('')]||{};def.outputs.forEach(p=>setOut(c,p.id,row[p.id]||SIG.X));
  }

  function exportCustomLibrary() {
    setStatus('Пользовательские компоненты отключены.');
  }

  function importCustomLibrary(e) {
    if (e && e.target) e.target.value = '';
    setStatus('Пользовательские компоненты отключены.');
  }

  function frame(ts) {
    const dt = state.lastTime ? ts - state.lastTime : 0;
    state.lastTime = ts;
    state.simAccumulator += Math.min(dt, 80);
    if (state.running && state.simAccumulator >= 50) {
      const step = state.simAccumulator;
      state.simAccumulator = 0;
      simulate(step);
    }
    requestAnimationFrame(frame);
  }

  if (moduleSearch) moduleSearch.addEventListener('input', applyModuleSearch);
  if (createCustomBtn) createCustomBtn.addEventListener('click', createCustomFromSelection);
  if (exportCustomBtn) exportCustomBtn.addEventListener('click', exportCustomLibrary);
  if (importCustomBtn && importCustomFile) importCustomBtn.addEventListener('click', () => importCustomFile.click());
  if (importCustomFile) importCustomFile.addEventListener('change', importCustomLibrary);

  document.querySelectorAll('[data-panel]').forEach(b=>{
    b.addEventListener('click',()=>showPanel(b.dataset.panel));
    b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-panel]')];const next=tabs[(tabs.indexOf(b)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];showPanel(next.dataset.panel);next.focus();});
  });
  showPanel('properties');
  if(typeof CircuitWorkbench!=='undefined')CircuitWorkbench.attach({read:projectData,load:loadProjectText,validate:prepareProject,definition:(c,library)=>library.find(d=>d.type===c.type)||getDef(c),download:downloadText});
  document.getElementById('synthesizeBtn').addEventListener('click',()=>{const error=document.getElementById('expressionError');try{const data=CircuitSynthesis.build(document.getElementById('expressionText').value);loadProjectText(JSON.stringify(data));error.hidden=true;setStatus('Схема построена из формул. Общие подвыражения объединены.');}catch(err){error.textContent=err.message;error.hidden=false;}});
  document.getElementById('backToProject').addEventListener('click',returnToProject);
  document.getElementById('busMode').addEventListener('change',e=>{state.busConnect=e.target.checked;setStatus(state.busConnect?'Жгут: один клик соединяет все разряды группы.':'Провод: соединяется один пин.');});
  document.getElementById('clockRate').addEventListener('change',e=>state.clockHz=Number(e.target.value));
  document.getElementById('fitBtn').addEventListener('click',fitCircuit);
  projectTitle.addEventListener('focus',()=>projectTitle.dataset.before=projectTitle.value);
  projectTitle.addEventListener('change',()=>{const title=projectTitle.value.trim()||'Новая схема';projectTitle.value=projectTitle.dataset.before||'Новая схема';pushHistory();projectTitle.value=title;saveLocal();});
  document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{try{loadProjectText(JSON.stringify(CircuitExamples[b.dataset.example]));}catch(err){showImportError(err.message);}}));
  document.querySelectorAll('.menu-content button').forEach(b=>b.addEventListener('click',()=>b.closest('details').open=false));
  document.addEventListener('click',e=>{if(!e.target.closest('.menu'))document.querySelector('.menu').open=false;});
  window.addEventListener('pagehide',saveLocal);
  setInterval(()=>{if(!state.dragging&&!state.suppressHistory)saveLocal();},2000);

  loadImages().then(() => {
    installCustomDefs([]);
    setTheme(state.theme);
    if(typeof CircuitThemes!=='undefined')CircuitThemes.attach(mode=>{state.theme=mode;themeCache.clear();themeBtn.textContent=mode==='dark'?'☀ Светлая':'☾ Тёмная';draw();});
    setWireGlowMode(state.wireGlowMode);
    updateTruthPanel();
    buildPalette(); resizeCanvas();
    const saved=readStorage('logic_studio_board','');
    if(saved){try{loadProjectText(saved,false);}catch{createSample();setStatus('Не удалось восстановить сохранённый проект. Открыт пример.');}}else createSample();
    state.undoStack = []; state.redoStack = []; updateHistoryButtons();
    runBtn.classList.add('active'); runBtn.textContent = 'Ⅱ Пауза';
    setTool('select');
    fitCircuit();
    requestAnimationFrame(frame);
  });
  window.addEventListener('resize', resizeCanvas);
})();
