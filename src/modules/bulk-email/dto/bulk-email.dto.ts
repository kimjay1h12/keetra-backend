import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateBulkEmailTemplateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(500_000)
  htmlBody!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  textBody?: string;
}

export class UpdateBulkEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  htmlBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  textBody?: string;
}

export class BulkEmailAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contentType?: string;

  /** Base64 payload (optional `data:*;base64,` prefix is stripped server-side). */
  @IsString()
  @MaxLength(9_000_000)
  contentBase64!: string;
}

export class SendBulkEmailDto {
  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  htmlBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  textBody?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => BulkEmailAttachmentDto)
  attachments?: BulkEmailAttachmentDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsMongoId()
  teamId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  presetKey?: string;

  @IsOptional()
  @IsMongoId()
  customTemplateId?: string;
}

export class CreateBulkEmailScheduleDto {
  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  htmlBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  textBody?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsEmail({}, { each: true })
  recipients!: string[];

  @IsIn(['weekly', 'monthly'])
  frequency!: 'weekly' | 'monthly';

  /** ISO datetime for first send; defaults to one period from now. If in the past, first run is ASAP. */
  @IsOptional()
  @IsDateString()
  startAt?: string;
}
