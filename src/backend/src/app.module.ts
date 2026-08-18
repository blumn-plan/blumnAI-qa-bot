import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { TeamModule } from './team/team.module';
import { DocsModule } from './docs/docs.module';
import { GitHubModule } from './github/github.module';
import { AnthropicModule } from './anthropic/anthropic.module';
import { QaModule } from './qa/qa.module';
import { DecisionsModule } from './decisions/decisions.module';
import { MockupsModule } from './mockups/mockups.module';
import { ImagesModule } from './images/images.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    GitHubModule,
    AnthropicModule,
    TeamModule,
    DocsModule,
    QaModule,
    DecisionsModule,
    MockupsModule,
    ImagesModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
