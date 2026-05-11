import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ enum: ['individual', 'company'], example: 'individual' })
  @IsString()
  @IsIn(['individual', 'company'])
  accountType!: 'individual' | 'company';

  @ApiProperty({ minLength: 2, example: 'Alex Morgan' })
  @IsString()
  @MinLength(2)
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Optional phone for dial-out (`tel:`) on clients',
    example: '+1 555 010 2030',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ description: 'Profile image URL (https)', example: 'https://example.com/me.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Product Designer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 'Short bio shown in meetings and profile.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ minLength: 2, example: 'Acme Inc.' })
  @ValidateIf((o: UpdateProfileDto) => o.accountType === 'company')
  @IsString()
  @MinLength(2)
  companyName?: string;

  @ApiPropertyOptional({
    enum: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
    example: '11-50',
  })
  @ValidateIf((o: UpdateProfileDto) => o.accountType === 'company')
  @IsIn(['1-10', '11-50', '51-200', '201-1000', '1000+'])
  companySize?: string;
}
