import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { TeamModule } from './team/team.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TeamModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
