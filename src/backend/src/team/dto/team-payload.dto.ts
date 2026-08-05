import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// GitHub repo 형식 검증: "org/repo"
const REPO_REGEX = /^[\w.-]+\/[\w.-]+$/;

export class ProjectPayloadDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/, {
    message: 'project.slug 은 소문자/숫자/하이픈/언더스코어 3-64자',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  label!: string;

  @IsOptional() @IsString() @MaxLength(500)
  policies_dir?: string;

  @IsOptional() @IsString() @MaxLength(500)
  storyboards_dir?: string;

  @IsOptional() @IsString() @MaxLength(255)
  code_repo?: string;
}

/** PUT /api/team/:slug 요청 body. 대부분 필드 optional 로 두어 partial update 도 자연스러움.
 *  단, 신규 생성 시엔 최소 name + github_repo 는 있어야 함 (service 에서 별도 검증). */
export class UpsertTeamDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  team_name?: string;

  @IsOptional() @IsString() @Matches(REPO_REGEX, {
    message: 'github_repo 는 "org/repo" 형식',
  })
  github_repo?: string;

  // legacy: 프론트 wizard 가 github_token/anthropic_key 로 send · 매핑에 alias 처리
  @IsOptional() @IsString()
  master_pat?: string;

  @IsOptional() @IsString()
  github_token?: string;   // alias for master_pat (wizard 호환)

  @IsOptional() @IsString()
  anthropic_key?: string;

  @IsOptional() @IsString()
  planner_password?: string;

  @IsOptional() @IsString() @MaxLength(64)
  master_github_login?: string;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  rate_limit_per_day?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => ProjectPayloadDto)
  projects?: ProjectPayloadDto[];

  // 기존 스키마 호환 (단일 프로젝트 wizard) — service 가 projects[] 로 변환
  @IsOptional() @IsString()
  policies_dir?: string;

  @IsOptional() @IsString()
  storyboards_dir?: string;

  @IsOptional() @IsString()
  code_repo?: string;
}
