import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendTeamChatDto {
  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string;

  @ApiPropertyOptional({ type: [String], description: 'Team member user IDs to notify (@mentions)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  mentionUserIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs from POST .../chat/upload responses, uploaded by you',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsMongoId({ each: true })
  attachmentIds?: string[];
}
