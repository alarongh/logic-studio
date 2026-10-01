const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'schema.js', 'symbols.js', 'extended.js', 'synthesis.js', 'examples.js', 'favicon.svg', 'AI_IMPORT.md']) fs.copyFileSync(path.join(root, name), path.join(out, name));
fs.cpSync(path.join(root, 'examples'), path.join(out, 'examples'), { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Static site built in dist/');
