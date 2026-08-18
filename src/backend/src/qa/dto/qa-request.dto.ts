import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttachmentDto {
  @IsString() mediaType!: string;
  @IsString() data!: string;
}

export class HistoryMessageDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  // content 는 string or array — 유연하게 any 허용 (프론트가 shape 맞춰서 전송)
  content!: unknown;
}

export class QaRequestDto {
  @IsString() question!: string;

  @IsOptional() @IsString()
  docPath?: string;

  /** 명시적 다중 선택 · 비어있지 않으면 docPath 무시하고 이 리스트 전체 로드해서 답변 근거로 사용 */
  @IsOptional() @IsArray() @IsString({ each: true })
  docPaths?: string[];

  @IsOptional() @IsString()
  project?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => HistoryMessageDto)
  history?: HistoryMessageDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional() @IsString()
  codeRepo?: string;
}
