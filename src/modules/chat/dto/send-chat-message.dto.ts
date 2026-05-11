import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty({ minLength: 1, example: 'Hello everyone' })
  @IsString()
  @MinLength(1)
  content!: string;
}
