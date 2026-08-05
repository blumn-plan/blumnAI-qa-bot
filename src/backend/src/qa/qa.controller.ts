import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { QaService } from './qa.service';
import { QaRequestDto } from './dto/qa-request.dto';

@Controller()
export class QaController {
  constructor(private readonly qaService: QaService) {}

  /** POST /api/qa?team=heythere-planer
   *  body: { question, docPath?, history?, attachments? }
   *  응답: NDJSON stream (meta · text · usage · done · error) */
  @Post('qa')
  async qa(
    @Query('team') teamSlug: string | undefined,
    @Body() body: QaRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.question?.trim()) throw new BadRequestException({ error: 'question 필수' });

    // 클라이언트 disconnect 감지 → Anthropic 호출 abort (토큰 낭비 방지)
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const upstream = await this.qaService.ask(teamSlug, body, abortController.signal);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    // Web ReadableStream → Node.js Readable → Express pipe
    Readable.fromWeb(upstream as any).pipe(res);
  }
}
