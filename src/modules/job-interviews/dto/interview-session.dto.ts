import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class InterviewMessageDto {
  @IsString()
  @MaxLength(20_000)
  content!: string;
}

export class ProctoringEventItemDto {
  @IsString()
  @IsIn(['no_face', 'multiple_faces', 'gaze_away', 'tab_hidden', 'camera_denied'])
  type!: 'no_face' | 'multiple_faces' | 'gaze_away' | 'tab_hidden' | 'camera_denied';

  @IsOptional()
  @IsString()
  ts?: string;

  @IsOptional()
  @IsNumber()
  severity?: number;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class ProctoringBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProctoringEventItemDto)
  events!: ProctoringEventItemDto[];
}
