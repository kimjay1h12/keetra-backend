import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateMeetingDto {
  @ApiProperty({ minLength: 3, example: 'Team standup' })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty({ enum: ['public', 'private'], example: 'public' })
  @IsIn(['public', 'private'])
  visibility!: 'public' | 'private';

  @ApiPropertyOptional({ minLength: 4, description: 'Required when visibility is private' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @ApiPropertyOptional({ description: 'ISO 8601 — if in the future, meeting is scheduled and team can be notified.' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Team whose members see this meeting and receive schedule emails.' })
  @IsOptional()
  @IsMongoId()
  teamId?: string;

  @ApiPropertyOptional({
    enum: ['none', 'daily', 'weekly', 'monthly'],
    description: 'Requires a future scheduledAt. Next occurrence is created when the host ends the room.',
  })
  @IsOptional()
  @IsIn(['none', 'daily', 'weekly', 'monthly'])
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({
    description: 'Last day occurrences may run (YYYY-MM-DD, UTC end of day). Omit for no end.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  recurrenceUntil?: string;
}
