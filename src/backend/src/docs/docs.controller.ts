import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { DocsService } from './docs.service';
import { TeamContextService } from './team-context.service';

@Controller()
export class DocsController {
  constructor(
    private readonly docsService: DocsService,
    private readonly teamContext: TeamContextService,
  ) {}

  /** GET /api/list-projects?team=heythere-planer */
  @Get('list-projects')
  @Header('Cache-Control', 'no-store')
  async listProjects(@Query('team') team?: string) {
    const resolved = await this.teamContext.resolve(team);
    return this.docsService.listProjects(resolved);
  }

  /** GET /api/list-docs?team=heythere-planer&project=admin */
  @Get('list-docs')
  @Header('Cache-Control', 'no-store')
  async listDocs(@Query('team') team?: string, @Query('project') project?: string) {
    const resolved = await this.teamContext.resolve(team);
    return this.docsService.listDocs(resolved, project);
  }

  /** GET /api/doc?team=heythere-planer&path=projects/admin/docs/policies/foo.md */
  @Get('doc')
  @Header('Cache-Control', 'no-store')
  async getDoc(@Query('team') team?: string, @Query('path') path?: string) {
    if (!path) throw new BadRequestException({ error: 'path query 필수' });
    const resolved = await this.teamContext.resolve(team);
    return this.docsService.getDoc(resolved, path);
  }
}
