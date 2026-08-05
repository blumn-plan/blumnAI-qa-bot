import { Module } from '@nestjs/common';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';
import { GitHubModule } from '../github/github.module';
import { DocsModule } from '../docs/docs.module';

@Module({
  imports: [GitHubModule, DocsModule],
  controllers: [DecisionsController],
  providers: [DecisionsService],
})
export class DecisionsModule {}
