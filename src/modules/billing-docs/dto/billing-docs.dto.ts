import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BillingLineItemDto {
  @IsString()
  @MaxLength(500)
  description!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class BillingDocPayloadDto {
  @IsIn(['invoice', 'receipt'])
  documentType!: 'invoice' | 'receipt';

  @IsString()
  @MaxLength(200)
  sellerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sellerAddress?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  sellerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsString()
  @MaxLength(200)
  clientName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  clientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clientAddress?: string;

  @IsString()
  @MaxLength(64)
  documentNumber!: string;

  @IsString()
  @MaxLength(40)
  issueDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dueDate?: string;

  @IsString()
  @MaxLength(8)
  currency!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BillingLineItemDto)
  lineItems!: BillingLineItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  paymentInstructions?: string;
}

export class BillingDocPreviewDto {
  @IsString()
  @MaxLength(32)
  styleKey!: string;

  @ValidateNested()
  @Type(() => BillingDocPayloadDto)
  data!: BillingDocPayloadDto;
}

export class SendBillingDocDto {
  @IsEmail()
  @MaxLength(320)
  to!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(32)
  styleKey!: string;

  @ValidateNested()
  @Type(() => BillingDocPayloadDto)
  data!: BillingDocPayloadDto;
}

export class CreateBillingDocTemplateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsIn(['invoice', 'receipt'])
  kind!: 'invoice' | 'receipt';

  @IsString()
  @MaxLength(32)
  styleKey!: string;

  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;
}

export class UpdateBillingDocTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['invoice', 'receipt'])
  kind?: 'invoice' | 'receipt';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  styleKey?: string;

  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;
}
