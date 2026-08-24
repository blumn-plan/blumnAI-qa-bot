import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { MockupsService, GenHtmlRequestDto } from './mockups.service';

@Controller()
export class MockupsController {
  constructor(private readonly mockups: MockupsService) {}

  @Post('gen-html')
  @Header('Cache-Control', 'no-store')
  async generate(@Query('team') team: string | undefined, @Body() body: GenHtmlRequestDto) {
    return this.mockups.generate(team, body);
  }

  @Get('mockups')
  async list(@Query('team') team: string | undefined) {
    return { items: await this.mockups.list(team) };
  }

  @Get('mockup-html')
  async fetchHtml(@Query('team') team: string | undefined, @Query('path') path: string) {
    return { html: await this.mockups.fetchHtml(team, path) };
  }
}
