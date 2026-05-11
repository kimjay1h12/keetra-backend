import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTeamMailDomainDto {
  @ApiProperty({ example: 'mail.example.com' })
  @IsString()
  @MinLength(4)
  @MaxLength(253)
  @Matches(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i, {
    message: 'domain must be a valid hostname',
  })
  domain!: string;

  @ApiPropertyOptional({ description: 'Use as default domain for new mailboxes in UI' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
