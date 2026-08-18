import { Module } from '@nestjs/common';
import { MockupsController } from './mockups.controller';
import { MockupsService } from './mockups.service';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { GitHubModule } from '../github/github.module';
import { DocsModule } from '../docs/docs.module';

@Module({
  imports: [AnthropicModule, GitHubModule, DocsModule],
  controllers: [MockupsController],
  providers: [MockupsService],
})
export class MockupsModule {}
