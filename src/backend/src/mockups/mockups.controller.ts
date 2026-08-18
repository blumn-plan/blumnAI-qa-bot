import { Body, Controller, Header, Post, Query } from '@nestjs/common';
import { MockupsService, GenHtmlRequestDto } from './mockups.service';

@Controller()
export class MockupsController {
  constructor(private readonly mockups: MockupsService) {}

  @Post('gen-html')
  @Header('Cache-Control', 'no-store')
  async generate(@Query('team') team: string | undefined, @Body() body: GenHtmlRequestDto) {
    return this.mockups.generate(team, body);
  }
}
