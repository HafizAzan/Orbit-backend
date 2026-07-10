import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProjectGitHubDto {
  @ValidateIf((dto: UpdateProjectGitHubDto) => dto.repoFullName !== null)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, {
    message: 'Repository must be in owner/repo format.',
  })
  repoFullName?: string | null;

  @IsOptional()
  unlink?: boolean;
}
