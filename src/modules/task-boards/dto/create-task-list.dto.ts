import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskListDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;
}
