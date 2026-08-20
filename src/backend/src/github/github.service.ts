import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';

export interface ContentEntry {
  type: 'file' | 'dir';
  name: string;
  path: string;
  sha?: string;
  size?: number;
  download_url?: string | null;
}

export interface GitHubContext {
  repo: string;   // "org/repo"
  token: string;  // PAT (ghp_...)
}

/** GitHub API 클라이언트. Cloudflare Worker 의 ghFetch/fetchDirListing/fetchTextFile 이식.
 *  사내 배포 (on-prem) 환경에서는 IP allowlist 이슈가 없으므로 재시도 정책은 완화. */
@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly baseUrl = 'https://api.github.com';
  private readonly userAgent = 'blumnai-qa-backend';

  /** GitHub API 호출 wrapper. 재시도: 429/5xx (transient) + 403 IP allow list (Cloudflare edge IP 라운드로빈).
   *  Content-Type · Authorization · User-Agent 자동 셋업. */
  async apiFetch(ctx: GitHubContext, path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${ctx.token}`);
    headers.set('User-Agent', this.userAgent);
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    if (['POST', 'PATCH', 'PUT'].includes((init.method ?? '').toUpperCase())) {
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }

    const maxAttempts = 4;
    let lastRes: Response | undefined;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { ...init, headers });
        // 재시도 대상: 429 (rate limit) · 5xx (server error) · 403 IP allow list (Cloudflare edge IP 회전)
        //  401/404/일반 403 (권한 부족) 등은 즉시 반환 (재시도해도 결과 안 바뀜)
        const isRetryable =
          res.status === 429 ||
          (res.status >= 500 && res.status < 600) ||
          (res.status === 403 && (await this.isIpAllowListError(res)));
        if (!isRetryable) return res;
        lastRes = res;
      } catch (err) {
        lastErr = err;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    if (lastRes) return lastRes;
    throw new InternalServerErrorException({
      error: `GitHub API 호출 실패: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    });
  }

  /** 403 응답이 GitHub org IP allow list 거절인지 판별 (Cloudflare edge IP 회전 시 재시도 대상). */
  private async isIpAllowListError(res: Response): Promise<boolean> {
    try {
      const body = await res.clone().text();
      return /IP allow list/i.test(body);
    } catch {
      return false;
    }
  }

  /** GitHub 응답 에러 시 원인 메시지 조합. 상태코드별 힌트 포함해서 사용자가 원인 파악 쉽게. */
  private async errorMessage(res: Response, prefix: string): Promise<string> {
    if (res.status === 401) {
      return `${prefix}: 401 · 팀 GitHub PAT 문제 (만료·revoke·SSO 미인증) — 우측 상단 ⚙️ 에서 새 PAT 재저장 필요`;
    }
    if (res.status === 403) {
      try {
        const body = await res.clone().text();
        if (/IP allow list/i.test(body)) {
          return `${prefix}: 403 IP allow list — 서버 IP 가 GitHub org 허용목록에 없음 (재시도 4회 모두 실패)`;
        }
        if (/rate limit/i.test(body)) {
          return `${prefix}: 403 rate limit — GitHub API 시간당 호출 한도 초과 · 잠시 후 재시도`;
        }
        if (/scope|permission/i.test(body)) {
          return `${prefix}: 403 권한 부족 — PAT 의 repo scope 확인 (private 레포는 repo 체크 필수)`;
        }
      } catch { /* body read 실패 무시 */ }
      return `${prefix}: 403 · repo 접근 거부 — PAT scope 또는 org 권한 확인`;
    }
    if (res.status === 404) {
      return `${prefix}: 404 · 파일/폴더 없음 또는 PAT 이 이 repo 접근 권한 없음`;
    }
    return `${prefix}: ${res.status}`;
  }

  private encodePath(p: string): string {
    return p.split('/').map(encodeURIComponent).join('/');
  }

  /** GitHub 디렉토리 listing. 404 는 빈 배열 (폴더 없음 = 정상). */
  async listDir(ctx: GitHubContext, path: string): Promise<ContentEntry[]> {
    const res = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}`);
    if (res.status === 404) return [];
    if (!res.ok) throw new InternalServerErrorException({ error: await this.errorMessage(res, `list dir ${path}`) });
    return (await res.json()) as ContentEntry[];
  }

  /** 텍스트 파일 본문. base64 decode. 없으면 NotFoundException. */
  async getFile(ctx: GitHubContext, path: string): Promise<string> {
    const res = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}`);
    if (res.status === 404) throw new NotFoundException({ error: 'File not found', path });
    if (!res.ok) throw new InternalServerErrorException({ error: await this.errorMessage(res, `get file ${path}`) });
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (data.encoding === 'base64' && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return data.content ?? '';
  }

  /** 파일 생성 or 갱신 (PUT /repos/.../contents/{path}).
   *  기존 파일 존재 시 sha 를 자동 조회해서 갱신, 없으면 신규 생성.
   *  message · content(base64 encoded) · sha(optional) */
  async writeFile(
    ctx: GitHubContext,
    path: string,
    content: string,
    message: string,
    branch?: string,
  ): Promise<{ sha: string; commitSha: string; htmlUrl: string }> {
    // 기존 파일 있는지 확인 (sha 필요)
    let existingSha: string | undefined;
    const head = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}${branch ? `?ref=${branch}` : ''}`);
    if (head.ok) {
      const info = (await head.json()) as { sha?: string };
      existingSha = info.sha;
    }
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
    };
    if (branch) body.branch = branch;
    if (existingSha) body.sha = existingSha;

    const res = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InternalServerErrorException({ error: await this.errorMessage(res, `write file ${path}`) });
    const result = (await res.json()) as {
      content: { sha: string; html_url: string };
      commit: { sha: string; html_url: string };
    };
    return {
      sha: result.content.sha,
      commitSha: result.commit.sha,
      htmlUrl: result.content.html_url,
    };
  }

  /** 바이너리 파일 저장. writeFile 은 utf-8 → base64 로 재인코딩하므로 이미지에는 부적합.
   *  이미 base64 로 인코딩된 payload 를 그대로 GitHub 에 PUT. 기존 파일 sha 자동 조회. */
  async writeFileRawBase64(
    ctx: GitHubContext,
    path: string,
    base64Content: string,
    message: string,
    branch?: string,
  ): Promise<{ sha: string; commitSha: string; htmlUrl: string }> {
    let existingSha: string | undefined;
    const head = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}${branch ? `?ref=${branch}` : ''}`);
    if (head.ok) {
      const info = (await head.json()) as { sha?: string };
      existingSha = info.sha;
    }
    const body: Record<string, unknown> = { message, content: base64Content };
    if (branch) body.branch = branch;
    if (existingSha) body.sha = existingSha;

    const res = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InternalServerErrorException({ error: await this.errorMessage(res, `write file ${path}`) });
    const result = (await res.json()) as {
      content: { sha: string; html_url: string };
      commit: { sha: string; html_url: string };
    };
    return {
      sha: result.content.sha,
      commitSha: result.commit.sha,
      htmlUrl: result.content.html_url,
    };
  }

  /** 파일 존재 여부. getFile 이 throw 하면 false. */
  async fileExists(ctx: GitHubContext, path: string): Promise<boolean> {
    const res = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}`);
    return res.ok;
  }

  /** 파일 삭제 (DELETE /repos/.../contents/{path}). sha 필수. */
  async deleteFile(ctx: GitHubContext, path: string, message: string, branch?: string): Promise<void> {
    const head = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}${branch ? `?ref=${branch}` : ''}`);
    if (head.status === 404) return;  // 이미 없음 · 성공으로 처리
    if (!head.ok) throw new InternalServerErrorException({ error: await this.errorMessage(head, `check file for delete ${path}`) });
    const info = (await head.json()) as { sha: string };
    const body: Record<string, unknown> = { message, sha: info.sha };
    if (branch) body.branch = branch;
    const res = await this.apiFetch(ctx, `/repos/${ctx.repo}/contents/${this.encodePath(path)}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InternalServerErrorException({ error: await this.errorMessage(res, `delete file ${path}`) });
  }
}
