import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MailService } from '../mail/mail.service';
import type { BillingDocPayload } from './billing-docs.types';
import {
  computeTotals,
  isBillingStyleKey,
  plainTextSummary,
  renderBillingHtml,
} from './billing-docs.renderer';
import type {
  BillingDocPayloadDto,
  BillingDocPreviewDto,
  CreateBillingDocTemplateDto,
  SendBillingDocDto,
  UpdateBillingDocTemplateDto,
} from './dto/billing-docs.dto';
import { BillingDocTemplate, BillingDocTemplateDocument } from './schemas/billing-doc-template.schema';

function dtoToPayload(dto: BillingDocPayloadDto): BillingDocPayload {
  return {
    documentType: dto.documentType,
    sellerName: dto.sellerName.trim(),
    sellerAddress: dto.sellerAddress?.trim(),
    sellerEmail: dto.sellerEmail?.trim(),
    taxId: dto.taxId?.trim(),
    clientName: dto.clientName.trim(),
    clientEmail: dto.clientEmail?.trim(),
    clientAddress: dto.clientAddress?.trim(),
    documentNumber: dto.documentNumber.trim(),
    issueDate: dto.issueDate.trim(),
    dueDate: dto.dueDate?.trim(),
    currency: (dto.currency || 'USD').trim().toUpperCase().slice(0, 8),
    lineItems: dto.lineItems.map((r) => ({
      description: r.description.trim(),
      quantity: r.quantity,
      unitPrice: r.unitPrice,
    })),
    taxRate: dto.taxRate,
    discount: dto.discount,
    notes: dto.notes?.trim(),
    paymentInstructions: dto.paymentInstructions?.trim(),
  };
}

@Injectable()
export class BillingDocsService {
  constructor(
    @InjectModel(BillingDocTemplate.name)
    private readonly templateModel: Model<BillingDocTemplateDocument>,
    private readonly mailService: MailService,
  ) {}

  listStyles() {
    return [
      {
        key: 'classic',
        name: 'Classic',
        description: 'Blue accent, clear hierarchy — common for B2B invoices.',
      },
      {
        key: 'minimal',
        name: 'Minimal',
        description: 'Neutral monochrome — receipt-friendly and print-clean.',
      },
      {
        key: 'modern',
        name: 'Modern',
        description: 'Teal accent with airy spacing — good for services and SaaS.',
      },
    ];
  }

  preview(dto: BillingDocPreviewDto) {
    if (!isBillingStyleKey(dto.styleKey)) throw new BadRequestException('Unknown style');
    const data = dtoToPayload(dto.data);
    if (!data.lineItems.length) throw new BadRequestException('Add at least one line item');
    const totals = computeTotals(data);
    const html = renderBillingHtml(data, dto.styleKey);
    return { html, totals };
  }

  async send(_userId: string, dto: SendBillingDocDto) {
    void _userId;
    if (!isBillingStyleKey(dto.styleKey)) throw new BadRequestException('Unknown style');
    const data = dtoToPayload(dto.data);
    if (!data.lineItems.length) throw new BadRequestException('Add at least one line item');
    const totals = computeTotals(data);
    const html = renderBillingHtml(data, dto.styleKey);
    const text = plainTextSummary(data, totals);
    await this.mailService.sendToEach([dto.to], {
      subject: dto.subject.trim(),
      html,
      text,
    });
    return {
      to: dto.to.trim().toLowerCase(),
      mailConfigured: this.mailService.isEnabled(),
    };
  }

  async listTemplates(userId: string) {
    const rows = await this.templateModel
      .find({ ownerUserId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();
    return rows.map((r) => ({
      _id: r._id.toString(),
      name: r.name,
      kind: r.kind,
      styleKey: r.styleKey,
      updatedAt: (r as { updatedAt?: Date }).updatedAt?.toISOString(),
    }));
  }

  async getTemplate(userId: string, id: string) {
    const row = await this.templateModel.findOne({
      _id: new Types.ObjectId(id),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!row) throw new NotFoundException('Template not found');
    let defaults: Record<string, unknown> = {};
    try {
      defaults = JSON.parse(row.defaultsJson || '{}') as Record<string, unknown>;
    } catch {
      defaults = {};
    }
    return {
      _id: row._id.toString(),
      name: row.name,
      kind: row.kind,
      styleKey: row.styleKey,
      defaults,
    };
  }

  async createTemplate(userId: string, dto: CreateBillingDocTemplateDto) {
    if (!isBillingStyleKey(dto.styleKey)) throw new BadRequestException('Unknown style');
    const defaultsJson = JSON.stringify(dto.defaults ?? {});
    const row = await this.templateModel.create({
      ownerUserId: new Types.ObjectId(userId),
      name: dto.name.trim(),
      kind: dto.kind,
      styleKey: dto.styleKey,
      defaultsJson,
    });
    return { _id: row._id.toString(), name: row.name, kind: row.kind, styleKey: row.styleKey };
  }

  async updateTemplate(userId: string, id: string, dto: UpdateBillingDocTemplateDto) {
    const row = await this.templateModel.findOne({
      _id: new Types.ObjectId(id),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!row) throw new NotFoundException('Template not found');
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.kind !== undefined) row.kind = dto.kind;
    if (dto.styleKey !== undefined) {
      if (!isBillingStyleKey(dto.styleKey)) throw new BadRequestException('Unknown style');
      row.styleKey = dto.styleKey;
    }
    if (dto.defaults !== undefined) row.defaultsJson = JSON.stringify(dto.defaults);
    await row.save();
    return { _id: row._id.toString(), name: row.name, kind: row.kind, styleKey: row.styleKey };
  }

  async deleteTemplate(userId: string, id: string) {
    const r = await this.templateModel.deleteOne({
      _id: new Types.ObjectId(id),
      ownerUserId: new Types.ObjectId(userId),
    });
    if (r.deletedCount === 0) throw new NotFoundException('Template not found');
    return { deleted: true };
  }
}
