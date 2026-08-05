import { Module } from '@nestjs/common';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { GitHubModule } from '../github/github.module';
import { DocsModule } from '../docs/docs.module';

@Module({
  imports: [AnthropicModule, GitHubModule, DocsModule],
  controllers: [QaController],
  providers: [QaService],
})
export class QaModule {}
