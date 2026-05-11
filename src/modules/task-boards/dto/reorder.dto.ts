import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsMongoId, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderTaskListsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  listIds!: string[];
}

export class CardColumnOrderDto {
  @IsMongoId()
  listId!: string;

  @IsArray()
  @IsMongoId({ each: true })
  cardIds!: string[];
}

export class ReorderTaskCardsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardColumnOrderDto)
  columns!: CardColumnOrderDto[];
}
