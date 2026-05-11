import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'old-password-here' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8, example: 'new-password-here' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
