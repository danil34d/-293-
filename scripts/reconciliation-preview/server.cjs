const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const compiler = require('next/dist/compiled/webpack/webpack');
compiler.init();

const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.next-runtime/p06-preview');
const port = Number(process.env.P06_PREVIEW_PORT || 3216);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Некорректный P06_PREVIEW_PORT');

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
    if (url.pathname === '/' || url.pathname === '/reconciliation/demo') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : html);
      return;
    }
    const asset = assets[url.pathname];
    if (!asset) { res.writeHead(404); res.end('Не найдено'); return; }
    res.setHeader('Content-Type', asset[1]);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(asset[0]).pipe(res);
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`P06: http://127.0.0.1:${port}/ — только тестовые данные, без БД и камер.`));
});
