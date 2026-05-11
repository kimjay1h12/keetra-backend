import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class JoinMeetingDto {
  @ApiPropertyOptional({ minLength: 4, description: 'Meeting password if required' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;
}
