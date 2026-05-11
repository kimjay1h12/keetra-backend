import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskCardCommentDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
