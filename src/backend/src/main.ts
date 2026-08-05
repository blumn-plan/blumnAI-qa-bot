import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
