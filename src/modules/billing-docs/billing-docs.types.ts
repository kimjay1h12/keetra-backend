export type BillingDocKind = 'invoice' | 'receipt';

export type BillingLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type BillingDocPayload = {
  documentType: BillingDocKind;
  sellerName: string;
  sellerAddress?: string;
  sellerEmail?: string;
  taxId?: string;
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  documentNumber: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  lineItems: BillingLineItem[];
  taxRate?: number;
  discount?: number;
  notes?: string;
  paymentInstructions?: string;
};

export type BillingComputedTotals = {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
};
