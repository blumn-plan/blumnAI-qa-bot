import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import {
  ImagesService,
  SaveStoryboardImageRequestDto,
  SaveDecisionImageRequestDto,
  DeleteStoryboardImageRequestDto,
} from './images.service';

@Controller()
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post('save-storyboard-image')
  @Header('Cache-Control', 'no-store')
  saveStoryboard(@Query('team') team: string | undefined, @Body() body: SaveStoryboardImageRequestDto) {
    return this.images.saveStoryboardImage(team, body);
  }

  @Post('save-decision-image')
  @Header('Cache-Control', 'no-store')
  saveDecision(@Query('team') team: string | undefined, @Body() body: SaveDecisionImageRequestDto) {
    return this.images.saveDecisionImage(team, body);
  }

  @Get('list-storyboard-images')
  @Header('Cache-Control', 'no-store')
  list(
    @Query('team') team: string | undefined,
    @Query('dir') dir: string | undefined,
    @Query('prefix') prefix: string | undefined,
  ) {
    return this.images.listStoryboardImages(team, dir ?? '', prefix ?? '');
  }

  @Post('delete-storyboard-image')
  @Header('Cache-Control', 'no-store')
  deleteStoryboard(@Query('team') team: string | undefined, @Body() body: DeleteStoryboardImageRequestDto) {
    return this.images.deleteStoryboardImage(team, body);
  }
}
