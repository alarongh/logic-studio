const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
const allowed = new Set(['index.html', 'styles.css', 'app.js', 'schema.js', 'symbols.js', 'extended.js', 'synthesis.js', 'examples.js', 'favicon.svg', 'AI_IMPORT.md', 'CIRCUIT_CODE.md', 'circuit-code.js', 'themes.js', 'workbench.js']);
http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html'; } catch { res.writeHead(400).end(); return; }
  if (!allowed.has(name) && !/^examples\/[\w-]+\.json$/.test(name)) { res.writeHead(404).end(); return; }
  const file = path.join(root, name);
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('Logic Studio: http://127.0.0.1:4173'));
