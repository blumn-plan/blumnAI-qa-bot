import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnthropicService, AnthropicMessage } from '../anthropic/anthropic.service';
import { GitHubService, GitHubContext } from '../github/github.service';
import { TeamContextService, ResolvedTeam } from '../docs/team-context.service';
import { QaRequestDto } from './dto/qa-request.dto';

/** 종합모드로 로드할 문서 최대 크기 (bytes · 대략적인 토큰 상한 방지) */
const ALL_DOCS_MAX_BYTES = 200_000;

/** /api/qa 처리. 문서 fetch + 시스템 프롬프트 구성 + Anthropic 스트리밍. */
@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);

  constructor(
    private readonly anthropic: AnthropicService,
    private readonly github: GitHubService,
    private readonly teamContext: TeamContextService,
  ) {}

  /** 질문 처리 → NDJSON stream. */
  async ask(teamSlug: string | undefined, body: QaRequestDto, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const team = await this.teamContext.resolve(teamSlug);
    if (!team.anthropicKey) {
      throw new BadRequestException({ error: 'Team anthropic_key 미설정 · Anthropic 호출 불가' });
    }
    const ctx = this.teamContext.toGitHubContext(team);

    // 명시적 다중 선택 (docPaths) 우선 · 없으면 단일 focusedDoc.
    //  · docPaths ≥1 → 그 문서들만 병렬 로드해서 하나의 시스템 블록에 concat
    //  · docPath → 단일 문서 (기존 동작)
    //  · 둘 다 없음 → 프로젝트 전체 (loadAllProjectPolicies)
    const explicitDocPaths = (body.docPaths ?? []).filter(Boolean);
    let focusedDoc = '';
    let focusedDocFailed = false;
    let focusedDocFailedReason = '';
    let selectedDocsBundle = '';
    // 실패 케이스는 path + 원인(401 PAT 만료 · 403 IP allow list 등) 함께 캐리 → 프롬프트 주입 시 Claude 가 원인까지 안내
    let selectedDocsFailures: Array<{ path: string; error: string }> = [];

    if (explicitDocPaths.length > 0) {
      const fetched = await Promise.all(
        explicitDocPaths.map(async (p) => {
          try {
            const content = await this.github.getFile(ctx, p);
            return { path: p, content, ok: true as const };
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`selected doc fetch failed: ${p} — ${errMsg}`);
            return { path: p, content: '', ok: false as const, error: errMsg };
          }
        }),
      );
      selectedDocsFailures = fetched
        .filter((f) => !f.ok)
        .map((f) => ({ path: f.path, error: (f as { error?: string }).error ?? 'unknown' }));
      const okDocs = fetched.filter((f) => f.ok);
      if (okDocs.length > 0) {
        selectedDocsBundle = [
          `[✅ 사용자가 선택한 참고 문서 — 총 ${okDocs.length}개]`,
          `아래 문서들만 근거로 답변하세요. 인용 시 각 문서명 (§섹션) 형식 명시.`,
          ...okDocs.map((d) => `\n--- [${d.path}] ---\n${d.content}`),
        ].join('\n');
      }
    } else if (body.docPath) {
      try {
        focusedDoc = await this.github.getFile(ctx, body.docPath);
      } catch (err) {
        focusedDocFailed = true;
        focusedDocFailedReason = err instanceof Error ? err.message : String(err);
        this.logger.warn(`focusedDoc fetch failed: ${body.docPath} — ${focusedDocFailedReason}`);
      }
    }

    // CLAUDE.md 규칙 파일 로드 (best-effort · 없으면 기본 규칙만) — 레거시 Worker 이식.
    //  → 사내 규칙 (요약 우선 · §섹션 링크 · 표 사용 · 변경 제안 블록 등) 을 봇에 강제
    let claudeRules = '';
    try {
      claudeRules = await this.github.getFile(ctx, 'CLAUDE.md');
    } catch (err) {
      this.logger.warn(`CLAUDE.md 로드 실패 (규칙 없이 진행): ${err instanceof Error ? err.message : String(err)}`);
    }

    // 시스템 프롬프트 구성 — 문서 본문을 시스템에 주입해서 답변 근거로 사용.
    const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
      {
        type: 'text',
        text: [
          `당신은 "${team.name}" 팀의 정책·화면설계서 기반 QA 봇입니다.`,
          `사내 GitHub 레포 ${team.githubRepo} 의 문서를 근거로 답변합니다.`,
          '답변은 GitHub Pages 챗 박스에 마크다운으로 그대로 표시됩니다.',
          '',
          '[답변 형식 — 매번 이 구조로]',
          '1) 🔎 **한 줄 결론** — 답변 첫 줄. 굵게. 이후 상세는 아래.',
          '2) 📍 **근거 위치** — 어느 문서 어느 §섹션에서 왔는지 마크다운 링크로: `[문서명 §X-Y](파일경로)`.',
          '   - 예: `[캠페인_만들기 §4-2-1](projects/admin_v1/docs/policies/캠페인_만들기_v0.1.31.md)`',
          '   - 링크는 반드시 위 [선택된 문서] 또는 [프로젝트 전체 문서] 안에 실존하는 경로만 사용.',
          '3) 📋 **상세** — 필요한 만큼. 케이스별 동작 차이·비교는 표 (`| col1 | col2 |`) 로.',
          '4) ⚠️ **정책 미정의** 인 경우 그 사실을 명시하고 우측 `[📤 기획전달]` 버튼 안내.',
          '   - 버튼명은 정확히 **기획전달** (X: "기획자에게 전달", "기획자에 전달" 등 풀어쓰기 금지).',
          '',
          '[반드시 지킬 것]',
          '- 서두는 반드시 한 줄 결론 (본문은 그 다음). 사용자가 결론을 먼저 봐야 합니다.',
          '- 근거 없는 추측 금지. 정책에 없으면 "정책 미정의" 명시.',
          '- 문서 이름은 확장자 (.md) 없이 표기.',
          '- 화면 캡처가 첨부되면 시각 분석해서 정책과 비교.',
          '- **이미지 마크다운 (`![...](...)`) 은 답변에 절대 포함 금지.** 정책 문서 안에 이미지가 있어도 답변에 옮겨 담지 말고, 필요하면 텍스트로 설명하세요.',
          '- 버튼명·라벨은 항상 앱의 실제 표기 그대로 (`기획전달` · `답변 규칙` · `새 문의` 등). 풀어쓰기·의역 금지.',
          '',
          '[📋 변경 제안 블록 — 정책 수정·신설이 필요하다고 판단되면 답변 끝에 반드시 첨부]',
          '```',
          '### 📋 변경 제안',
          '- 📌 요청 제목: <30자 이내 한 줄 요약>',
          '- 📄 대상 파일: <파일명>',
          '- 📍 위치: <§X-Y>',
          '- ✏️ 변경 전: <현재 정책 문구 또는 "정책 미정의">',
          '- ✅ 변경 후: <제안 문구, 시각 명세 포함>',
          '- 💡 근거: <한 줄 사유>',
          '```',
        ].join('\n'),
        cache_control: { type: 'ephemeral' },
      },
    ];

    // CLAUDE.md 규칙 (있으면) — 사내 특화 규칙 추가
    if (claudeRules) {
      systemBlocks.push({
        type: 'text',
        text: `[Rules — CLAUDE.md]\n${claudeRules}`,
        cache_control: { type: 'ephemeral' },
      });
    }

    if (selectedDocsBundle) {
      systemBlocks.push({
        type: 'text',
        text: selectedDocsBundle,
        cache_control: { type: 'ephemeral' },
      });
      if (selectedDocsFailures.length > 0) {
        systemBlocks.push({
          type: 'text',
          text: `[⚠️ 아래 사용자 선택 문서는 로드 실패 · 답변 서두에 사실과 원인을 명시하고 사용자가 조치할 수 있게 안내]\n${selectedDocsFailures.map((f) => `  - ${f.path}\n    원인: ${f.error}`).join('\n')}`,
        });
      }
    } else if (explicitDocPaths.length > 0 && selectedDocsFailures.length === explicitDocPaths.length) {
      systemBlocks.push({
        type: 'text',
        text: `[⚠️ 사용자가 선택한 참고 문서 ${explicitDocPaths.length}개 모두 로드 실패 — 원인 포함해서 서두에 명시하고 조치 안내]\n${selectedDocsFailures.map((f) => `  - ${f.path}\n    원인: ${f.error}`).join('\n')}`,
      });
    } else if (focusedDoc) {
      systemBlocks.push({
        type: 'text',
        text: `[선택된 문서 · ${body.docPath}]\n\n${focusedDoc}`,
        cache_control: { type: 'ephemeral' },  // 5분 캐시
      });
    } else if (focusedDocFailed) {
      systemBlocks.push({
        type: 'text',
        text: `[⚠️ 문서 로드 실패: ${body.docPath}\n원인: ${focusedDocFailedReason}\n답변 서두에 사실과 원인을 명시하고 사용자가 조치할 수 있게 안내]`,
      });
    } else {
      // 종합모드: docPath 없음 → 프로젝트의 모든 policy md 를 로드해서 주입
      try {
        const aggregated = await this.loadAllProjectPolicies(team, ctx, body.project);
        if (aggregated) {
          systemBlocks.push({
            type: 'text',
            text: aggregated,
            cache_control: { type: 'ephemeral' },  // 5분 캐시 · 종합모드 반복 질문 저비용
          });
        }
      } catch (err) {
        this.logger.warn(`all-docs load failed: ${err instanceof Error ? err.message : String(err)}`);
        systemBlocks.push({
          type: 'text',
          text: '[⚠️ 프로젝트 전체 정책 로드 실패 — 일반적 안내로 진행]',
        });
      }
    }

    // 사용자 messages 구성 — history + 새 질문 (attachment 포함)
    //  · 이미지 첨부 + 질문 텍스트 조합이면 [image..., text] 블록 배열
    //  · 이미지만 있고 텍스트 비어있으면 [image...] 만 · text 블록 빈 값이면 Anthropic 400
    //  · 텍스트만 있으면 string
    const questionText = body.question?.trim() ?? '';
    let userContent: AnthropicMessage['content'];
    if (body.attachments?.length) {
      const imageBlocks = body.attachments.map((a) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: a.mediaType, data: a.data },
      }));
      userContent = questionText
        ? [...imageBlocks, { type: 'text' as const, text: questionText }]
        : imageBlocks;
    } else {
      userContent = questionText;
    }

    // history 방어: content 가 빈 문자열이면 Anthropic 이 "content: Field required" 400.
    //  · 첨부만 있고 텍스트 없던 과거 유저 메시지가 이 케이스 (프론트는 attachments 를 history 로 안 넘김).
    //  · empty message 는 placeholder 로 대체 (순서 유지) · 실제 대화 흐름은 남김.
    const history = (body.history ?? [])
      .map((h) => {
        const raw = typeof h.content === 'string' ? h.content.trim() : '';
        return {
          role: h.role,
          content: raw || (h.role === 'user' ? '(이전 첨부 이미지)' : '(이전 답변)'),
        };
      });

    const messages: AnthropicMessage[] = [
      ...history,
      { role: 'user', content: userContent },
    ];

    // Anthropic 스트리밍 호출
    const upstream = await this.anthropic.streamMessages({
      apiKey: team.anthropicKey,
      messages,
      system: systemBlocks,
      signal,
    });

    // SSE → NDJSON 변환 스트림 파이핑
    const transform = this.anthropic.createSseToNdjsonTransform({
      appliedFeedbacks: [],
      via: 'anthropic-api',
      model: 'claude-sonnet-4-6',
    });

    return upstream.body!.pipeThrough(transform);
  }

  /** 🌐 종합모드용 · 프로젝트의 모든 policy md 를 병렬 로드해서 하나의 텍스트 블록으로 반환.
   *  policies_dir 은 줄바꿈·쉼표로 여러 폴더 지정 가능 (docs.service 와 동일 규칙).
   *  총 크기 ALL_DOCS_MAX_BYTES 초과 시 잘라내고 안내 문구 추가. */
  private async loadAllProjectPolicies(
    team: ResolvedTeam,
    ctx: GitHubContext,
    projectSlug?: string,
  ): Promise<string | null> {
    const project = this.teamContext.resolveProject(team, projectSlug);
    const policyDirs = splitDirs(project.policiesDir);
    if (policyDirs.length === 0) return null;

    // 각 폴더의 md 파일 리스트 병렬 조회
    const listings = await Promise.all(
      policyDirs.map((d) =>
        this.github.listDir(ctx, d).catch((err) => {
          this.logger.warn(`listDir failed for ${d}: ${err instanceof Error ? err.message : String(err)}`);
          return [] as Array<{ path: string; type: string; name: string }>;
        }),
      ),
    );
    const mdPaths = listings
      .flat()
      .filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md'))
      .map((e) => e.path);
    // 같은 경로 dedupe (여러 폴더 지정 시 겹침 방지)
    const uniquePaths = Array.from(new Set(mdPaths));
    if (uniquePaths.length === 0) return null;

    // 각 md 파일 병렬 fetch · 실패는 개별 skip
    const fetched = await Promise.all(
      uniquePaths.map(async (p) => {
        try {
          const content = await this.github.getFile(ctx, p);
          return { path: p, content };
        } catch (err) {
          this.logger.warn(`getFile failed for ${p}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      }),
    );

    // 크기 상한 내에서 순차 concat · 초과분은 파일명만 표시
    const parts: string[] = [
      `[🌐 프로젝트 "${project.label}" 전체 정책 문서 — 총 ${uniquePaths.length}개]\n`,
      `아래 문서들을 종합해서 답변하세요. 인용 시 파일명(§섹션) 형식으로 명시.\n`,
    ];
    let bytes = parts.join('\n').length;
    let includedCount = 0;
    const skipped: string[] = [];

    for (const item of fetched) {
      if (!item) continue;
      const header = `\n\n--- [${item.path}] ---\n`;
      const chunk = header + item.content;
      if (bytes + chunk.length > ALL_DOCS_MAX_BYTES) {
        skipped.push(item.path);
        continue;
      }
      parts.push(chunk);
      bytes += chunk.length;
      includedCount += 1;
    }

    if (skipped.length > 0) {
      parts.push(
        `\n\n[⚠️ 상한(${ALL_DOCS_MAX_BYTES.toLocaleString()} bytes) 초과로 ${skipped.length}개 파일 생략:`,
        skipped.map((p) => `  - ${p}`).join('\n'),
        '해당 파일이 필요한 질문이면 사이드바에서 개별 문서를 선택해 다시 질문해주세요.]',
      );
    }

    this.logger.log(
      `all-docs mode · project=${project.slug} included=${includedCount}/${uniquePaths.length} bytes=${bytes}`,
    );
    return parts.join('\n');
  }
}

/** 줄바꿈·쉼표로 폴더 여러개 분리 · 빈 값 제거 (docs.service.splitDirs 와 동일). */
function splitDirs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
