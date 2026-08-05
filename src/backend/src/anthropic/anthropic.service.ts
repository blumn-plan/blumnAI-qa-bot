import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  >;
}

export interface AnthropicCallParams {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: AnthropicMessage[];
  signal?: AbortSignal;
}

/** Anthropic API 클라이언트. Worker 의 askClaude 스트리밍 호출 이식. */
@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private readonly url = 'https://api.anthropic.com/v1/messages';
  private readonly defaultModel = 'claude-sonnet-4-6';

  /** stream=true 로 Anthropic API 호출 · Response(body: SSE) 그대로 반환.
   *  호출자가 SSE → NDJSON 변환 담당. */
  async streamMessages(params: AnthropicCallParams): Promise<Response> {
    const model = params.model ?? this.defaultModel;
    const maxTokens = params.maxTokens ?? 2048;
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: params.system,
        messages: params.messages,
        stream: true,
      }),
      signal: params.signal,
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new InternalServerErrorException({
        error: `Anthropic API ${res.status}: ${errText.slice(0, 500)}`,
      });
    }
    return res;
  }

  /** SSE (Anthropic upstream) → NDJSON (프론트 소비) 변환 스트림.
   *  이벤트: meta (start · model) · text (delta 텍스트) · usage · done · error */
  createSseToNdjsonTransform(meta: Record<string, unknown> = {}): TransformStream<Uint8Array, Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let capturedUsage: Record<string, number> | null = null;

    return new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'meta', ...meta }) + '\n'));
      },
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let nlIdx;
        while ((nlIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]' || !jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: evt.delta.text }) + '\n'));
            } else if (evt.type === 'message_start' && evt.message?.usage) {
              capturedUsage = { ...evt.message.usage };
            } else if (evt.type === 'message_delta' && evt.usage) {
              capturedUsage = { ...(capturedUsage ?? {}), ...evt.usage };
            } else if (evt.type === 'message_stop') {
              if (capturedUsage) {
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'usage', usage: capturedUsage }) + '\n'));
              }
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
            } else if (evt.type === 'error') {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: evt.error?.message ?? 'unknown' }) + '\n'));
            }
          } catch { /* JSON parse 실패는 무시 · SSE 는 종종 keep-alive 라인 있음 */ }
        }
      },
    });
  }
}
