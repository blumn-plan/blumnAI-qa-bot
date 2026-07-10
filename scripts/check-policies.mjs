#!/usr/bin/env node
/**
 * 정책 md 규약 검증 CLI — docs/02-WIRE-POLICIES.md 규칙 기준.
 *
 * 사용: node scripts/check-policies.mjs [정책폴더경로 ...]
 *   기본 경로: projects/(*)/docs/policies
 *   예: node scripts/check-policies.mjs projects/admin_v1/docs/policies
 *       node scripts/check-policies.mjs                     # 모든 프로젝트 자동 감지
 *
 * 검증 항목 (02-WIRE-POLICIES §본문 구조 4가지 + 파일명):
 *   1. 파일명 <이름>_v<major>.<minor>.<patch>.md 패턴
 *   2. h1 타이틀에 파일명과 동일한 v<X.Y.Z> 버전 포함
 *   3. ##·### 헤더에 §번호 표기 (§1, §2-1 등)
 *   4. 각 절 본문 7줄 이내 (경고, 실패 X)
 *   5. 시각 명세(색·문구·버튼) 힌트 감지 (경고)
 *
 * exit code:
 *   0 - 모든 파일 규약 통과
 *   1 - 하나 이상 실패 (fail 항목 있음)
 *   2 - 스캔 대상 폴더 없음 or 파일 0개
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const targetDirs = args.length > 0 ? args : autoDetectPolicyDirs();

if (targetDirs.length === 0) {
  console.error('❌ 검증할 정책 폴더 없음.');
  console.error('   projects/<프로젝트id>/docs/policies 폴더가 있는지 확인하거나 명시적으로 경로 인자 지정.');
  process.exit(2);
}

let totalFiles = 0;
let totalFails = 0;
let totalWarns = 0;
const results = [];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) {
    console.error(`⚠️  경로 없음: ${dir} — 스킵`);
    continue;
  }
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f.toLowerCase() !== 'readme.md')
    .sort();
  for (const f of files) {
    const fullPath = path.join(dir, f);
    totalFiles++;
    const raw = fs.readFileSync(fullPath, 'utf8');
    const report = checkFile(f, raw);
    results.push({ file: fullPath, ...report });
    totalFails += report.fails.length;
    totalWarns += report.warns.length;
  }
}

console.log();
console.log(`📊 정책 md 규약 검증 리포트`);
console.log(`  스캔 폴더: ${targetDirs.length}개 (${targetDirs.join(', ')})`);
console.log(`  대상 파일: ${totalFiles}개`);
console.log(`  실패: ${totalFails}건 · 경고: ${totalWarns}건`);
console.log();

for (const r of results) {
  if (r.fails.length === 0 && r.warns.length === 0) {
    console.log(`  ✅ ${r.file}`);
    continue;
  }
  console.log(`  ${r.fails.length ? '❌' : '⚠️ '} ${r.file}`);
  for (const f of r.fails) console.log(`      · ❌ ${f}`);
  for (const w of r.warns) console.log(`      · ⚠️  ${w}`);
}
console.log();

if (totalFiles === 0) {
  console.error('❌ 스캔 대상 파일 0개.');
  process.exit(2);
}
if (totalFails > 0) {
  console.error(`❌ 실패 ${totalFails}건 — 02-WIRE-POLICIES.md 참고해서 수정하세요.`);
  process.exit(1);
}
console.log('✅ 모든 파일 규약 통과.');
process.exit(0);

/* ────────── 헬퍼 ────────── */

function autoDetectPolicyDirs() {
  const projectsRoot = 'projects';
  if (!fs.existsSync(projectsRoot)) return [];
  const dirs = [];
  for (const proj of fs.readdirSync(projectsRoot)) {
    const policiesDir = path.join(projectsRoot, proj, 'docs', 'policies');
    if (fs.existsSync(policiesDir) && fs.statSync(policiesDir).isDirectory()) {
      dirs.push(policiesDir);
    }
  }
  return dirs;
}

function checkFile(filename, content) {
  const fails = [];
  const warns = [];

  // 1. 파일명 <이름>_v<major>.<minor>.<patch>.md 패턴
  const nameMatch = filename.match(/^(.+)_v(\d+)\.(\d+)\.(\d+)\.md$/);
  if (!nameMatch) {
    fails.push(`파일명 규약 위반 — <이름>_v<X.Y.Z>.md 형식이어야 함 (예: 대시보드_v0.1.0.md)`);
  }
  const expectedVersion = nameMatch ? `${nameMatch[2]}.${nameMatch[3]}.${nameMatch[4]}` : null;

  // 2. h1 타이틀에 파일명과 동일 버전
  const h1Match = content.match(/^#\s+(.+?)$/m);
  if (!h1Match) {
    fails.push(`h1 타이틀 (# ...) 없음`);
  } else {
    const h1 = h1Match[1];
    const h1VerMatch = h1.match(/v(\d+\.\d+\.\d+)/);
    if (!h1VerMatch) {
      fails.push(`h1 타이틀에 v<X.Y.Z> 버전 표기 없음: "${h1}"`);
    } else if (expectedVersion && h1VerMatch[1] !== expectedVersion) {
      fails.push(`h1 버전(${h1VerMatch[1]}) 이 파일명 버전(${expectedVersion}) 과 불일치`);
    }
  }

  // 3. ##·### 헤더에 §번호 표기
  const headers = [...content.matchAll(/^(##+)\s+(.+?)$/gm)];
  const nonCitedHeaders = headers.filter((m) => !/§\s*\d/.test(m[2]));
  if (headers.length === 0) {
    fails.push(`## 헤더 없음 — 절 구분이 안 되어 봇이 인용 못함`);
  } else if (nonCitedHeaders.length > 0) {
    for (const h of nonCitedHeaders.slice(0, 3)) {
      fails.push(`§번호 없는 헤더: "${h[2]}" — §1, §2-1 형식 표기 필요`);
    }
    if (nonCitedHeaders.length > 3) {
      fails.push(`... 외 ${nonCitedHeaders.length - 3}개 헤더도 §번호 누락`);
    }
  }

  // 4. 각 절 본문 7줄 이내 (경고)
  const sections = splitSections(content);
  for (const [header, body] of sections) {
    const nonEmptyLines = body.split('\n').filter((l) => l.trim().length > 0);
    if (nonEmptyLines.length > 12) {
      warns.push(`${header} — 본문 ${nonEmptyLines.length}줄 (권장 ≤ 7-12줄, 봇 답변 품질 저하)`);
    }
  }

  // 5. 시각 명세 힌트 (경고)
  const visualHints = /주황|빨강|파랑|초록|배너|버튼|다이얼로그|모달|팝업|drop|색상|알림|toast/i;
  if (!visualHints.test(content)) {
    warns.push(`시각 명세 (색·문구·버튼) 힌트 감지 안 됨 — 사용자 답변 시 시각적 묘사 어려울 수 있음`);
  }

  return { fails, warns };
}

function splitSections(content) {
  // ## 또는 ### 헤더 기준으로 [header, body] 쌍 배열 반환
  const sections = [];
  const lines = content.split('\n');
  let curHeader = null;
  let curBody = [];
  for (const line of lines) {
    if (/^##+\s+/.test(line)) {
      if (curHeader) sections.push([curHeader, curBody.join('\n')]);
      curHeader = line.replace(/^##+\s+/, '').trim();
      curBody = [];
    } else if (curHeader) {
      curBody.push(line);
    }
  }
  if (curHeader) sections.push([curHeader, curBody.join('\n')]);
  return sections;
}
