import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTaskLabelDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  title!: string;

  @ApiPropertyOptional({ description: 'Hex color e.g. #61bd4f' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color!: string;
}
