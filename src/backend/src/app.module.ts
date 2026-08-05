import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { TeamModule } from './team/team.module';
import { DocsModule } from './docs/docs.module';
import { GitHubModule } from './github/github.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    GitHubModule,
    TeamModule,
    DocsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
