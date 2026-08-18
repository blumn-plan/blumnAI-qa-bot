import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { GitHubModule } from '../github/github.module';
import { DocsModule } from '../docs/docs.module';

@Module({
  imports: [GitHubModule, DocsModule],
  controllers: [ImagesController],
  providers: [ImagesService],
})
export class ImagesModule {}
