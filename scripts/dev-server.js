#!/usr/bin/env node
/**
 * 로컬 정적 미리보기 서버 — apps/qa-collab.html, apps/qa-planner.html 을
 * 확인용으로 서빙. Cloudflare Worker 없이 UI 만 볼 때 사용.
 *
 * 사용:  node scripts/dev-server.js  →  http://localhost:4000
 *
 * 확장자 없는 경로도 자동 처리 — /apps/qa-collab → /apps/qa-collab.html.
 * 즐겨찾기 안정성 위한 편의 기능. 명시적으로 .html 붙여도 그대로 동작.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
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

/** 파일 확인 순서:
 *  1. 요청 경로 그대로 (파일 존재)
 *  2. 디렉토리면 index.html
 *  3. 확장자 없으면 `.html` 붙여서 재시도 (즐겨찾기 편의: /apps/qa-collab → /apps/qa-collab.html)
 *  모두 실패면 404. */
function resolveFile(urlPath, cb) {
  const tryPath = path.join(ROOT, urlPath);
  if (!tryPath.startsWith(ROOT)) return cb(new Error('403'));
  fs.stat(tryPath, (err, stat) => {
    if (!err) {
      if (stat.isDirectory()) return cb(null, path.join(tryPath, 'index.html'));
      return cb(null, tryPath);
    }
    // 확장자 없는 경로면 .html 시도
    if (!path.extname(urlPath)) {
      const htmlPath = path.join(ROOT, urlPath + '.html');
      if (!htmlPath.startsWith(ROOT)) return cb(new Error('403'));
      fs.stat(htmlPath, (err2, stat2) => {
        if (!err2 && stat2.isFile()) return cb(null, htmlPath);
        cb(err);
      });
      return;
    }
    cb(err);
  });
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  resolveFile(urlPath, (err, filePath) => {
    if (err) {
      const code = err.message === '403' ? 403 : 404;
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`${code} — ${urlPath}`);
      return;
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
  console.log(`👉 협업자 창:  http://localhost:${PORT}/apps/qa-collab`);
  console.log(`👉 기획자 창:  http://localhost:${PORT}/apps/qa-planner\n`);
  console.log(`   (\`.html\` 붙여도 동작 — 확장자 없는 경로 자동 해석)\n`);
  console.log('⚠️  백엔드 (Worker) 는 CORS 로 막힘 — UI·팝업·배너 구조만 확인 가능\n');
});
