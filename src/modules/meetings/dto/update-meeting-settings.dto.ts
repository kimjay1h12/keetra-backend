import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateMeetingSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  /** New meeting password (private meetings only); omit to leave unchanged. */
  @ApiPropertyOptional({ minLength: 4 })
  @ValidateIf((o: UpdateMeetingSettingsDto) => o.password !== undefined && o.password !== '')
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;
}
