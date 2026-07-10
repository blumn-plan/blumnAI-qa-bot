#!/usr/bin/env node
/**
 * 로컬 정적 미리보기 서버 — apps/qa-collab.html, apps/qa-planner.html 을
 * 확인용으로 서빙. Cloudflare Worker 없이 UI 만 볼 때 사용.
 *
 * 사용:  node scripts/dev-server.js  →  http://localhost:8080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('403');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 — ${urlPath}\n\n확장자 없는 경로면 파일에 확장자를 붙여 접근해보세요.`);
      return;
    }
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 — ${urlPath}`);
        return;
      }
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';
      // localhost 개발 편의 위해 permissive CORS. GitHub 등 외부 fetch 시 필요.
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });
}).listen(PORT, () => {
  console.log(`\n📂 blumnAI-qa-bot 로컬 dev 서버`);
  console.log(`   Root: ${ROOT}`);
  console.log(`   URL:  http://localhost:${PORT}\n`);
  console.log(`👉 협업자 창:  http://localhost:${PORT}/apps/qa-collab.html`);
  console.log(`👉 기획자 창:  http://localhost:${PORT}/apps/qa-planner.html\n`);
  console.log('⚠️  백엔드 (Worker) 는 CORS 로 막힘 — UI·팝업·배너 구조만 확인 가능\n');
});
