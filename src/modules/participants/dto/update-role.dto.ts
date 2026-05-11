import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({ enum: ['cohost', 'participant'], example: 'cohost' })
  @IsIn(['cohost', 'participant'])
  role!: 'cohost' | 'participant';
}
