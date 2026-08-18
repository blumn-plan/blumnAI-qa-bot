import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
} from '@nestjs/common';
import { DecisionsService } from './decisions.service';
import { TeamContextService } from '../docs/team-context.service';

interface ForwardBody {
  title: string;
  body: string;
  docPath?: string;
  questioner?: string;
}

interface DeleteBody {
  path: string;
}

interface UpdateStatusBody {
  path: string;
  status: 'pending' | 'applied' | 'hold';
  /** 기획자 메모 (선택). applied/hold 에서만 md 상단에 blockquote 로 삽입됨. */
  note?: string;
  /** 기획자 이름 (선택 · 표시용) */
  plannerName?: string;
}

@Controller()
export class DecisionsController {
  constructor(
    private readonly decisionsService: DecisionsService,
    private readonly teamContext: TeamContextService,
  ) {}

  @Post('forward')
  @Header('Cache-Control', 'no-store')
  async forward(@Query('team') team: string | undefined, @Body() body: ForwardBody) {
    const resolved = await this.teamContext.resolve(team);
    return this.decisionsService.forward(resolved, body);
  }

  @Post('feedback')
  @Header('Cache-Control', 'no-store')
  async feedback(@Query('team') team: string | undefined, @Body() body: ForwardBody) {
    const resolved = await this.teamContext.resolve(team);
    return this.decisionsService.feedback(resolved, body);
  }

  @Get('list-decisions')
  @Header('Cache-Control', 'no-store')
  async listDecisions(@Query('team') team: string | undefined, @Query('limit') limit?: string) {
    const resolved = await this.teamContext.resolve(team);
    const n = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    return this.decisionsService.listDecisions(resolved, n);
  }

  @Get('list-feedbacks')
  @Header('Cache-Control', 'no-store')
  async listFeedbacks(@Query('team') team: string | undefined, @Query('limit') limit?: string) {
    const resolved = await this.teamContext.resolve(team);
    const n = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    return this.decisionsService.listFeedbacks(resolved, n);
  }

  @Post('delete-decision')
  @Header('Cache-Control', 'no-store')
  async deleteDecision(@Query('team') team: string | undefined, @Body() body: DeleteBody) {
    if (!body?.path) throw new BadRequestException({ error: 'path 필수' });
    const resolved = await this.teamContext.resolve(team);
    return this.decisionsService.deleteDecision(resolved, body.path);
  }

  @Post('delete-feedback')
  @Header('Cache-Control', 'no-store')
  async deleteFeedback(@Query('team') team: string | undefined, @Body() body: DeleteBody) {
    if (!body?.path) throw new BadRequestException({ error: 'path 필수' });
    const resolved = await this.teamContext.resolve(team);
    return this.decisionsService.deleteFeedback(resolved, body.path);
  }

  @Post('update-decision-status')
  @Header('Cache-Control', 'no-store')
  async updateStatus(@Query('team') team: string | undefined, @Body() body: UpdateStatusBody) {
    if (!body?.path) throw new BadRequestException({ error: 'path 필수' });
    if (!body?.status) throw new BadRequestException({ error: 'status 필수' });
    const resolved = await this.teamContext.resolve(team);
    return this.decisionsService.updateDecisionStatus(
      resolved,
      body.path,
      body.status,
      body.note,
      body.plannerName,
    );
  }
}
