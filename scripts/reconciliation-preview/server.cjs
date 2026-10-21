const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const compiler = require('next/dist/compiled/webpack/webpack');
compiler.init();

const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.next-runtime/p06-preview');
const port = Number(process.env.P06_PREVIEW_PORT || 3216);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Некорректный P06_PREVIEW_PORT');
// Optional explicit local snapshot. No database access or connection to cameras.
let snapshotMarkup = '';
let snapshotRoute = '';
if (process.env.P06_SNAPSHOT_FILE) {
  const snapshotPath = path.resolve(process.env.P06_SNAPSHOT_FILE);
  const stat = fs.statSync(snapshotPath);
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('Некорректный размер локального среза');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8').replace(/^\uFEFF/, ''));
  if (!snapshot.dataset || !/^snapshot-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(snapshot.dataset.shiftId) || !snapshot.presentation) throw new Error('Некорректный локальный срез');
  snapshotRoute = '/reconciliation/' + snapshot.dataset.shiftId;
  const safe = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  snapshotMarkup = '<script id="reconciliation-snapshot" type="application/json">' + safe + '</script>';
}

const build = compiler.webpack({
  mode: 'development',
  devtool: false,
  entry: path.join(__dirname, 'entry.tsx'),
  output: { path: output, filename: 'demo.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'tsx-loader.cjs') }] },
  optimization: { minimize: false },
});

build.run((err, stats) => {
  build.close(() => {});
  if (err || stats.hasErrors()) {
    console.error(err || stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--build-only')) {
    console.log('P06: компонент собран; сервер не запущен.');
    return;
  }
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Сверка смены — тестовый виджет</title><link rel="stylesheet" href="/demo.css"></head><body><div id="root"></div><script defer src="/demo.js"></script></body></html>`;
  const assets = {
    '/demo.js': [path.join(output, 'demo.js'), 'text/javascript; charset=utf-8'],
    '/demo.css': [path.join(root, 'src/components/reconciliation/reconciliation.css'), 'text/css; charset=utf-8'],
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/' || url.pathname === '/reconciliation/demo' || (snapshotRoute && url.pathname === snapshotRoute)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const content = url.pathname === snapshotRoute ? html.replace('<title>Сверка смены — тестовый виджет</title>', '<title>Сверка смены — локальный срез</title>').replace('<script defer', snapshotMarkup + '<script defer') : html;
      res.end(req.method === 'HEAD' ? undefined : content);
      return;
    }
    const asset = assets[url.pathname];
    if (!asset) { res.writeHead(404); res.end('Не найдено'); return; }
    res.setHeader('Content-Type', asset[1]);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(asset[0]).pipe(res);
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`P06 demo: http://127.0.0.1:${port}/`);
    if (snapshotRoute) console.log(`P06 snapshot: http://127.0.0.1:${port}${snapshotRoute}`);
    console.log('Локальный просмотр, без записи в базы данных и без управления камерами.');
  });
});
