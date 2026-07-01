/**
 * 통합 시작 스크립트 — `npm run start-with-tunnel` 또는 `start.bat` 으로 실행.
 *
 * 1. node server.js 백그라운드 실행 (localhost:8788)
 * 2. cloudflared quick tunnel 시작 → 외부 URL 획득 (https://*.trycloudflare.com)
 * 3. 외부 URL 을 Worker 의 TUNNEL_URL secret 으로 등록 (wrangler 사용)
 * 4. 두 프로세스 keep alive. Ctrl+C 시 모두 종료.
 *
 * 사전 조건:
 *   - cloudflared 설치 (winget install --id Cloudflare.cloudflared)
 *   - wrangler login 완료
 *   - claude CLI Max 로그인 완료
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8788;
const QA_BOT_DIR = path.resolve(__dirname, '..');

/**
 * cloudflared 바이너리 경로 결정.
 * 1) 환경변수 CLOUDFLARED_BIN
 * 2) PATH 의 `cloudflared`
 * 3) winget 기본 설치 위치 (Windows)
 * 4) Mac/Linux 일반 위치
 */
function findCloudflared() {
  if (process.env.CLOUDFLARED_BIN && fs.existsSync(process.env.CLOUDFLARED_BIN)) {
    return process.env.CLOUDFLARED_BIN;
  }
  if (process.platform === 'win32') {
    const wingetBase = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetBase)) {
      for (const dir of fs.readdirSync(wingetBase)) {
        if (dir.toLowerCase().startsWith('cloudflare.cloudflared')) {
          const exe = path.join(wingetBase, dir, 'cloudflared.exe');
          if (fs.existsSync(exe)) return exe;
        }
      }
    }
    for (const guess of [
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    ]) {
      if (fs.existsSync(guess)) return guess;
    }
  }
  return 'cloudflared'; // PATH 에 있다고 가정
}

const CLOUDFLARED = findCloudflared();

const procs = [];

function log(tag, msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${tag}] ${msg}`);
}

function spawnProc(tag, cmd, args, options = {}) {
  const opts = { shell: process.platform === 'win32', ...options };
  log(tag, `${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, opts);
  child.stdout.on('data', (d) => process.stdout.write(`[${tag}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${tag}] ${d}`));
  child.on('exit', (code) => {
    log(tag, `exited (code=${code})`);
    if (code !== 0 && code !== null) {
      log('launcher', `${tag} died unexpectedly — exiting all`);
      shutdown();
    }
  });
  procs.push({ tag, child });
  return child;
}

function shutdown() {
  for (const { tag, child } of procs) {
    log('launcher', `killing ${tag}`);
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid, '/T', '/F'], { shell: true });
      } else {
        child.kill('SIGTERM');
      }
    } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/* ───── 1. server ───── */
spawnProc('server', 'node', ['server.js'], { cwd: __dirname });

/* ───── 2. cloudflared ───── */
log('launcher', `cloudflared bin: ${CLOUDFLARED}`);
const tunnel = spawnProc('tunnel', CLOUDFLARED, ['tunnel', '--url', `http://localhost:${PORT}`]);

let tunnelUrl = null;
const urlRegex = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/;

function onTunnelLine(line) {
  if (tunnelUrl) return;
  const m = line.match(urlRegex);
  if (m) {
    tunnelUrl = m[1];
    log('launcher', `Tunnel URL detected: ${tunnelUrl}`);
    setTimeout(() => registerTunnelUrl(tunnelUrl), 3000); // 터널 안정화 대기 3초
  }
}

// cloudflared 가 URL 을 stderr 로 출력. 후처리:
tunnel.stderr.on('data', (d) => d.toString().split(/\r?\n/).forEach(onTunnelLine));
tunnel.stdout.on('data', (d) => d.toString().split(/\r?\n/).forEach(onTunnelLine));

/* ───── 3. wrangler secret put TUNNEL_URL ───── */
function registerTunnelUrl(url) {
  log('launcher', `Registering TUNNEL_URL with Worker: ${url}`);

  const wr = spawn('npx', ['wrangler', 'secret', 'put', 'TUNNEL_URL'], {
    cwd: QA_BOT_DIR,
    shell: true,
  });
  wr.stdout.on('data', (d) => process.stdout.write(`[wrangler] ${d}`));
  wr.stderr.on('data', (d) => process.stderr.write(`[wrangler] ${d}`));
  wr.on('exit', (code) => {
    if (code === 0) {
      log('launcher', `✨ TUNNEL_URL 등록 완료. qa.html 에서 챗 가능: ${url}`);
    } else {
      log('launcher', `wrangler exit ${code} — TUNNEL_URL 등록 실패. 수동 등록:`);
      log('launcher', `  cd qa/bot && echo ${url} | npx wrangler secret put TUNNEL_URL`);
    }
  });
  wr.stdin.write(url + '\n');
  wr.stdin.end();
}

log('launcher', 'Started. Waiting for tunnel URL...');
log('launcher', 'Ctrl+C 로 모두 종료.');
