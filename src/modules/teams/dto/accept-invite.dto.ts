import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Token from the invite link' })
  @IsString()
  @MinLength(10)
  token!: string;
}
