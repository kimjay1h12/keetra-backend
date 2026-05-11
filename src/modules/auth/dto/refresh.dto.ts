import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    minLength: 10,
    description: 'JWT refresh token from login or register response',
  })
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
