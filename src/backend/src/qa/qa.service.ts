import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnthropicService, AnthropicMessage } from '../anthropic/anthropic.service';
import { GitHubService } from '../github/github.service';
import { TeamContextService } from '../docs/team-context.service';
import { QaRequestDto } from './dto/qa-request.dto';

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

    // 선택된 문서 본문 로드 (있으면). 실패해도 조용히 진행 (Claude 가 "문서 없음" 오해 방지).
    let focusedDoc = '';
    let focusedDocFailed = false;
    if (body.docPath) {
      try {
        focusedDoc = await this.github.getFile(ctx, body.docPath);
      } catch (err) {
        focusedDocFailed = true;
        this.logger.warn(`focusedDoc fetch failed: ${body.docPath} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 시스템 프롬프트 구성 — 문서 본문을 시스템에 주입해서 답변 근거로 사용.
    const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
      {
        type: 'text',
        text: [
          `당신은 "${team.name}" 팀의 정책·화면설계서 기반 QA 봇입니다.`,
          `사내 GitHub 레포 ${team.githubRepo} 의 문서를 근거로 답변합니다.`,
          '',
          '규칙:',
          '- 답변은 반드시 제공된 정책 문서 근거를 인용해서 작성',
          '- 정책에 없는 내용이면 "정책 미정의" 라고 명시',
          '- 근거 인용 시 §섹션번호 를 표기 (예: §2-1)',
          '- 화면 캡처가 있으면 그것도 답변에 활용',
        ].join('\n'),
      },
    ];

    if (focusedDoc) {
      systemBlocks.push({
        type: 'text',
        text: `[선택된 문서 · ${body.docPath}]\n\n${focusedDoc}`,
        cache_control: { type: 'ephemeral' },  // 5분 캐시
      });
    } else if (focusedDocFailed) {
      systemBlocks.push({
        type: 'text',
        text: `[⚠️ 문서 로드 실패: ${body.docPath} — 이 사실을 답변 서두에 명시하고 일반적인 안내로 진행]`,
      });
    }

    // 사용자 messages 구성 — history + 새 질문 (attachment 포함)
    const userContent = body.attachments?.length
      ? [
          ...body.attachments.map((a) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: a.mediaType, data: a.data },
          })),
          { type: 'text' as const, text: body.question },
        ]
      : body.question;

    const messages: AnthropicMessage[] = [
      ...(body.history ?? []).map((h) => ({
        role: h.role,
        content: h.content as string,
      })),
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
}
