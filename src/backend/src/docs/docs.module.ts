import { Module } from '@nestjs/common';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';
import { TeamContextService } from './team-context.service';
import { GitHubModule } from '../github/github.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [GitHubModule],
  controllers: [DocsController],
  providers: [DocsService, TeamContextService, PrismaService],
  exports: [DocsService, TeamContextService],
})
export class DocsModule {}
