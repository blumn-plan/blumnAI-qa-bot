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
}
