import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Put,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { UpsertTeamDto } from './dto/team-payload.dto';

/** /api/team/:slug — Cloudflare Worker /team/{slug} 의 NestJS 이식.
 *  Phase Y1a: 인증 없음 (URL 아는 사람 = 접근). Phase Y1b 에서 gate 추가.
 *  응답은 Cache-Control: no-store (팀 config 변경이 즉시 반영되어야 함). */
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  async findOne(@Param('slug') slug: string) {
    this.assertValidSlug(slug);
    return this.teamService.findBySlug(slug);
  }

  @Put(':slug')
  @Header('Cache-Control', 'no-store')
  async upsert(@Param('slug') slug: string, @Body() dto: UpsertTeamDto) {
    this.assertValidSlug(slug);
    return this.teamService.upsertBySlug(slug, dto);
  }

  @Delete(':slug')
  @Header('Cache-Control', 'no-store')
  async remove(@Param('slug') slug: string) {
    this.assertValidSlug(slug);
    return this.teamService.deleteBySlug(slug);
  }

  private assertValidSlug(slug: string) {
    if (!TeamService.isValidSlug(slug)) {
      throw new BadRequestException({
        error: 'Invalid team slug · 소문자/숫자/하이픈만 · 3-64자',
      });
    }
  }
}
