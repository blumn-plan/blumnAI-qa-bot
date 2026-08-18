import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GitHubService } from '../github/github.service';
import { TeamContextService } from '../docs/team-context.service';

const STORYBOARD_IMG_PATH_RE = /^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images\/[^/]+\.(png|jpe?g|gif|webp)$/i;
const STORYBOARD_IMG_DIR_RE = /^projects\/[^/]+\/docs\/storyboards\/[^/]+\/images$/;
const DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i;
const DECISION_PATH_RE = /^qa\/decisions\/(\d{4}-\d{2}-\d{2}-[^./]+)\.md$/;

export interface SaveStoryboardImageRequestDto {
  targetPath: string;
  dataUrl: string;
}

export interface SaveDecisionImageRequestDto {
  decisionPath: string;
  dataUrl: string;
  filename?: string;
}

export interface DeleteStoryboardImageRequestDto {
  targetPath: string;
}

/** 🖼 이미지 CRUD · 레거시 Worker `/save-storyboard-image` · `/save-decision-image`
 *  `/list-storyboard-images` · `/delete-storyboard-image` 4종 이식.
 *  대상 저장소는 팀 GitHub repo. Storyboard 이미지는 문서에 참조, Decision 이미지는 메모 첨부용. */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    private readonly github: GitHubService,
    private readonly teamContext: TeamContextService,
  ) {}

  async saveStoryboardImage(
    teamSlug: string | undefined,
    body: SaveStoryboardImageRequestDto,
  ): Promise<{ saved: true; path: string; bytes: number }> {
    if (!body.targetPath) throw new BadRequestException({ error: 'targetPath required' });
    if (!body.dataUrl) throw new BadRequestException({ error: 'dataUrl required' });
    if (!STORYBOARD_IMG_PATH_RE.test(body.targetPath)) {
      throw new BadRequestException({
        error: 'targetPath 는 projects/<project>/docs/storyboards/<storyboard>/images/<filename>.(png|jpg|jpeg|gif|webp) 형식이어야 합니다',
      });
    }
    const match = DATA_URL_RE.exec(body.dataUrl);
    if (!match) {
      throw new BadRequestException({
        error: 'dataUrl 은 data:image/<png|jpg|jpeg|gif|webp>;base64,... 형식이어야 합니다',
      });
    }
    const base64Content = match[2].replace(/\s/g, '');
    const team = await this.teamContext.resolve(teamSlug);
    const ctx = this.teamContext.toGitHubContext(team);

    const filename = body.targetPath.split('/').pop() ?? 'image';
    await this.github.writeFileRawBase64(ctx, body.targetPath, base64Content, `storyboard-image: ${filename}`);
    return { saved: true, path: body.targetPath, bytes: Math.floor((base64Content.length * 3) / 4) };
  }

  async saveDecisionImage(
    teamSlug: string | undefined,
    body: SaveDecisionImageRequestDto,
  ): Promise<{ saved: true; path: string; markdownRef: string; bytes: number }> {
    if (!body.decisionPath) throw new BadRequestException({ error: 'decisionPath required' });
    if (!body.dataUrl) throw new BadRequestException({ error: 'dataUrl required' });
    const decisionMatch = DECISION_PATH_RE.exec(body.decisionPath);
    if (!decisionMatch) {
      throw new BadRequestException({
        error: 'decisionPath 는 qa/decisions/YYYY-MM-DD-slug.md 형식이어야 합니다',
      });
    }
    const decisionSlug = decisionMatch[1];
    const match = DATA_URL_RE.exec(body.dataUrl);
    if (!match) {
      throw new BadRequestException({
        error: 'dataUrl 은 data:image/<png|jpg|jpeg|gif|webp>;base64,... 형식이어야 합니다',
      });
    }
    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const base64Content = match[2].replace(/\s/g, '');

    const rawName = (body.filename || `image-${Date.now()}.${ext}`).replace(/[/\\]/g, '');
    const safeBase =
      rawName.replace(/\.[^.]+$/, '').replace(/[^\w.-]/g, '_').slice(0, 60) || `image-${Date.now()}`;

    const team = await this.teamContext.resolve(teamSlug);
    const ctx = this.teamContext.toGitHubContext(team);

    const dir = `qa/decisions/images/${decisionSlug}`;
    let filename = `${safeBase}.${ext}`;
    let targetPath = `${dir}/${filename}`;
    let suffix = 1;
    while ((await this.github.fileExists(ctx, targetPath)) && suffix < 100) {
      filename = `${safeBase}-${suffix}.${ext}`;
      targetPath = `${dir}/${filename}`;
      suffix++;
    }
    if (suffix >= 100) throw new BadRequestException({ error: '너무 많은 동명 이미지가 있습니다' });

    await this.github.writeFileRawBase64(ctx, targetPath, base64Content, `decision-image: ${filename}`);
    return {
      saved: true,
      path: targetPath,
      markdownRef: `![${safeBase}](/${targetPath})`,
      bytes: Math.floor((base64Content.length * 3) / 4),
    };
  }

  async listStoryboardImages(
    teamSlug: string | undefined,
    dir: string,
    prefix: string,
  ): Promise<{ images: Array<{ filename: string; path: string }> }> {
    if (!dir) throw new BadRequestException({ error: 'dir required' });
    if (!prefix) throw new BadRequestException({ error: 'prefix required' });
    if (!STORYBOARD_IMG_DIR_RE.test(dir)) {
      throw new BadRequestException({
        error: 'dir 은 projects/<project>/docs/storyboards/<storyboard>/images 형식이어야 합니다',
      });
    }
    if (/[/\\]|\.\./.test(prefix)) throw new BadRequestException({ error: 'invalid prefix' });

    const team = await this.teamContext.resolve(teamSlug);
    const ctx = this.teamContext.toGitHubContext(team);

    const entries = await this.github.listDir(ctx, dir).catch(() => []);
    const re = new RegExp(`^${escapeRegex(prefix)}.*\\.(png|jpe?g|gif|webp)$`, 'i');
    const images = entries
      .filter((e) => e.type === 'file' && re.test(e.name))
      .map((e) => ({ filename: e.name, path: `${dir}/${e.name}` }))
      .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    return { images };
  }

  async deleteStoryboardImage(
    teamSlug: string | undefined,
    body: DeleteStoryboardImageRequestDto,
  ): Promise<{ deleted: true; path: string }> {
    if (!body.targetPath) throw new BadRequestException({ error: 'targetPath required' });
    if (!STORYBOARD_IMG_PATH_RE.test(body.targetPath)) {
      throw new BadRequestException({ error: 'invalid targetPath' });
    }
    const team = await this.teamContext.resolve(teamSlug);
    const ctx = this.teamContext.toGitHubContext(team);

    const filename = body.targetPath.split('/').pop() ?? 'image';
    await this.github.deleteFile(ctx, body.targetPath, `storyboard-image delete: ${filename}`);
    return { deleted: true, path: body.targetPath };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
