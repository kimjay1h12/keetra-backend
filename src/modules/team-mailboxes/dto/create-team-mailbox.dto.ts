import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTeamMailboxDto {
  @ApiProperty({ example: 'sales' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i, {
    message: 'localPart must be a valid mailbox local part',
  })
  localPart!: string;

  @ApiProperty({ description: 'Team mail domain document id' })
  @IsMongoId()
  domainId!: string;

  @ApiPropertyOptional({ example: 'Sales desk' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ default: 512 })
  @IsOptional()
  @IsInt()
  @Min(64)
  quotaMb?: number;
}
