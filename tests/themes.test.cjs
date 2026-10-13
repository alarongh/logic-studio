const {test}=require('node:test');
const assert=require('node:assert/strict');
const themes=require('../themes.js');
function check(c){for(const surface of [c.panel,c.board]){assert.ok(themes.contrast(surface,c.ink)>=4.5,JSON.stringify(c));assert.ok(themes.contrast(surface,c.accent)>=3,JSON.stringify(c));}}
test('presets and readable custom colors remain unchanged',()=>{
 for(const [preset,values]of Object.entries(themes.presets)){const c=themes.normalize({preset});for(const key of ['board','panel','ink','accent','mode'])assert.equal(c[key],values[key]);check(c);}
 const custom={preset:'ocean',accent:'#abcdef',board:'#152737',panel:'#1c3445',ink:'#e4edf4',mode:'dark'};assert.deepEqual(themes.normalize(custom),custom);
});
test('black-on-black saved palettes recover readable controls and canvas symbols',()=>{
 const broken={preset:'light',accent:'#000000',board:'#000000',panel:'#000000',ink:'#000000'};
 const c=themes.normalize(broken);check(c);assert.equal(c.mode,'dark');assert.notEqual(c.ink,'#000000');assert.notEqual(c.accent,'#000000');assert.deepEqual(themes.normalize(c),c);
 const vars=themes.variables(c);assert.equal(vars['--component-text'],c.ink);assert.equal(vars['--component-fill'],c.panel);
});
test('invalid storage and incompatible background colors normalize safely',()=>{
 for(const raw of [null,[],42,'invalid',{preset:'toString',ink:'bad'},{preset:'ocean',board:'#121212',panel:'#dddddd',ink:'#121212'},{board:'#757575',panel:'#808080',ink:'#787878'}])check(themes.normalize(raw));
});
