import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // 기본 100KB 제한 우회 · 이미지 첨부(base64) 다중 업로드 대비 25MB.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ limit: '25mb', extended: true }));

  // 요청 진입/종료 로깅 — /api/gen-html 500 원인 추적용
  const httpLog = new Logger('HTTP');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const size = req.headers['content-length'] || '?';
    res.on('close', () => {
      const ms = Date.now() - start;
      const aborted = res.writableEnded ? '' : ' [ABORTED]';
      httpLog.log(`${req.method} ${req.url} · in ${size}B · ${res.statusCode} · ${ms}ms${aborted}`);
    });
    next();
  });

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const allowedOrigins = config.get<string>('ALLOWED_ORIGINS', '*').split(',').map((s) => s.trim());
  app.enableCors({
    origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' ? true : allowedOrigins,
    credentials: true,
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 blumnAI QA backend · http://0.0.0.0:${port}/api`);
}

bootstrap();
