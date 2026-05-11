import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class JoinMeetingGuestDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  @ApiPropertyOptional({ minLength: 4, description: 'Meeting password if the room is private' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;
}
