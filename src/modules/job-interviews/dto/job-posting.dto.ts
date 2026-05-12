import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateJobPostingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  /** If omitted, a slug is generated from the title */
  publicSlug?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(100_000)
  requirementsText!: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'open', 'closed'])
  status?: 'draft' | 'open' | 'closed';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  skills?: string[];

  @IsOptional()
  interviewConfig?: {
    maxQuestions?: number;
    tokenTtlHours?: number;
    timerMode?: 'off' | 'per_question' | 'session';
    timerSecondsPerQuestion?: number;
    timerSecondsTotal?: number;
  };
}

export class UpdateJobPostingDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(100_000)
  requirementsText?: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'open', 'closed'])
  status?: 'draft' | 'open' | 'closed';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  skills?: string[];

  @IsOptional()
  interviewConfig?: {
    maxQuestions?: number;
    tokenTtlHours?: number;
    timerMode?: 'off' | 'per_question' | 'session';
    timerSecondsPerQuestion?: number;
    timerSecondsTotal?: number;
  };
}
