import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '../anthropic/anthropic.service';
import { GitHubService } from '../github/github.service';
import { TeamContextService } from '../docs/team-context.service';

export interface GenHtmlRequestDto {
  prompt: string;
  focusedDocPath?: string;
  project?: string;
  attachments?: Array<{ mediaType: string; data: string }>;
  title?: string;
}

export interface GenHtmlResponseDto {
  savedPath: string;
  bytes: number;
  modelUsed: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  /** GitHub 저장 실패 시 원 HTML 반환 · 프론트에서 미리보기·수동 저장 가능 */
  html?: string;
  saveError?: string;
}

/** 📄 HTML 목업 생성 · 레거시 Worker `/gen-html` MVP 이식.
 *  정책 md · (선택) 참고 이미지를 근거로 완결된 static HTML 생성 → GitHub `qa/mockups/` 저장. */
@Injectable()
export class MockupsService {
  private readonly logger = new Logger(MockupsService.name);

  constructor(
    private readonly anthropic: AnthropicService,
    private readonly github: GitHubService,
    private readonly teamContext: TeamContextService,
  ) {}

  async generate(teamSlug: string | undefined, body: GenHtmlRequestDto, signal?: AbortSignal): Promise<GenHtmlResponseDto> {
    if (!body.prompt?.trim()) throw new BadRequestException({ error: 'prompt required' });
    const team = await this.teamContext.resolve(teamSlug);
    if (!team.anthropicKey) {
      throw new BadRequestException({ error: 'Team anthropic_key 미설정 · /gen-html 사용 불가' });
    }
    const ctx = this.teamContext.toGitHubContext(team);

    // 정책 문서 fetch (있으면)
    let focusedDoc = '';
    if (body.focusedDocPath) {
      try {
        focusedDoc = await this.github.getFile(ctx, body.focusedDocPath);
      } catch (err) {
        this.logger.warn(`focusedDoc fetch failed: ${body.focusedDocPath} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 시스템 프롬프트 — HTML 만 반환, TailwindCDN, 완결 문서
    const systemLines: string[] = [
      '당신은 서비스 화면 HTML 목업을 생성하는 UI 엔지니어입니다.',
      '',
      '[출력 규칙 — 반드시 준수]',
      '- 응답은 오직 `<!DOCTYPE html>` 로 시작하는 완결된 단일 HTML 문서.',
      '- 마크다운 fence (```html … ```) · 설명 문장 · 코드 앞뒤 텍스트 절대 금지.',
      '- 응답 첫 글자는 `<`, 마지막 글자는 `>` 여야 함.',
      '- 외부 CSS 는 반드시 Tailwind CDN (`https://cdn.tailwindcss.com`) 만 사용. 다른 CSS/JS 라이브러리 링크 금지.',
      '- 폰트는 -apple-system, "Noto Sans KR", sans-serif 스택 기본.',
      '- 한글 콘텐츠는 정책 md · 참고 이미지 그대로 반영 (임의 번역·의역 X).',
      '- 스크립트는 최소한만 (인라인 <script>), 외부 API 호출 X.',
      '- <head> 에 <meta charset="utf-8"> · <meta name="viewport" content="width=device-width,initial-scale=1"> 필수.',
      '',
      '[근거 활용]',
      '- 아래 [정책 문서] 의 시각 명세 (색·문구·레이아웃) 를 최우선 근거로.',
      '- [참고 이미지] 가 있으면 배치·색감 mimic.',
      '- 근거 부족한 부분은 자연스러운 관행적 UI 로 채움 (임의 문구는 회색으로 표시).',
    ];
    const systemParts: string[] = [...systemLines, ''];
    if (focusedDoc) {
      systemParts.push('[정책 문서]', body.focusedDocPath ? `경로: ${body.focusedDocPath}` : '', '', focusedDoc, '');
    }
    const systemPrompt = systemParts.join('\n');

    type ContentBlock =
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
    const userContent: string | ContentBlock[] = body.attachments?.length
      ? [
          ...body.attachments.map<ContentBlock>((a) => ({
            type: 'image',
            source: { type: 'base64', media_type: a.mediaType, data: a.data },
          })),
          { type: 'text', text: body.prompt },
        ]
      : body.prompt;

    // Anthropic streaming (large output). AnthropicService 재사용 · 스트림 축적.
    const model = 'claude-sonnet-4-6';
    const upstream = await this.anthropic.streamMessages({
      apiKey: team.anthropicKey,
      model,
      maxTokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      signal,
    });

    const { text: rawHtml, usage } = await this.consumeStreamToText(upstream);
    if (!rawHtml.trim()) throw new BadRequestException({ error: 'Claude 응답에 HTML 없음' });

    // fence · 텍스트 앞뒤 stripping
    let html = rawHtml.trim();
    const fenceMatch = html.match(/```(?:html)?\s*\n([\s\S]*?)```/);
    if (fenceMatch) html = fenceMatch[1].trim();
    if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
      const idx = html.indexOf('<!DOCTYPE');
      const idx2 = html.indexOf('<html');
      const start = idx >= 0 ? idx : idx2;
      if (start > 0) html = html.slice(start);
    }
    if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
      throw new BadRequestException({
        error: 'Claude 가 완결된 HTML 문서를 반환하지 않음. 프롬프트를 더 구체적으로 (구체적 화면·요소 명시) 재시도.',
      });
    }

    // 슬러그 생성
    const dateStr = new Date().toISOString().slice(0, 10);
    const baseSlug =
      (body.title || body.prompt)
        .slice(0, 30)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'mockup';

    // 충돌 회피 · -1, -2 suffix
    let filename = `${dateStr}-${baseSlug}.html`;
    let targetPath = `qa/mockups/${filename}`;
    let suffix = 1;
    while ((await this.pathExists(ctx, targetPath)) && suffix < 100) {
      filename = `${dateStr}-${baseSlug}-${suffix}.html`;
      targetPath = `qa/mockups/${filename}`;
      suffix++;
    }
    if (suffix >= 100) throw new BadRequestException({ error: '너무 많은 동명 목업이 있습니다' });

    // GitHub 저장 시도 · 실패해도 html 자체는 응답에 실어 반환
    try {
      await this.github.writeFile(ctx, targetPath, html, `mockup: ${filename}`);
      return {
        savedPath: targetPath,
        bytes: html.length,
        modelUsed: model,
        usage,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`gen-html write failed: ${msg}`);
      return {
        savedPath: '',
        bytes: html.length,
        modelUsed: model,
        usage,
        html,
        saveError: msg,
      };
    }
  }

  /** Anthropic stream → 전체 텍스트 축적. SSE 파싱은 anthropic.createSseToNdjsonTransform 과 유사 로직. */
  private async consumeStreamToText(res: Response): Promise<{
    text: string;
    usage?: GenHtmlResponseDto['usage'];
  }> {
    if (!res.body) throw new Error('empty response body');
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buffer = '';
    let text = '';
    let usage: GenHtmlResponseDto['usage'] | undefined;
    let streamError: string | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIdx: number;
      while ((nlIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nlIdx).trimEnd();
        buffer = buffer.slice(nlIdx + 1);
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const evt = JSON.parse(jsonStr) as {
            type: string;
            message?: { usage?: Record<string, number> };
            usage?: Record<string, number>;
            delta?: { type: string; text?: string };
            error?: { message?: string };
          };
          if (evt.type === 'message_start' && evt.message?.usage) {
            usage = { ...evt.message.usage };
          } else if (evt.type === 'message_delta' && evt.usage) {
            usage = { ...(usage ?? {}), ...evt.usage };
          } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
            text += evt.delta.text;
          } else if (evt.type === 'error') {
            streamError = evt.error?.message || 'Anthropic stream error';
          }
        } catch {
          /* skip parse error */
        }
      }
    }
    if (streamError) throw new Error(`Claude API stream error: ${streamError}`);
    return { text, usage };
  }

  /** GitHub 경로 존재 여부 확인 · getFile 이 throw 하면 false */
  private async pathExists(ctx: { repo: string; token: string }, path: string): Promise<boolean> {
    try {
      await this.github.getFile(ctx, path);
      return true;
    } catch {
      return false;
    }
  }
}
