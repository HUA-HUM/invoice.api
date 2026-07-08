export type InvoiceClientIssueReason =
  | 'INVALID_FISCAL_DOCUMENT'
  | 'XUBIO_CLIENT_ALREADY_EXISTS'
  | 'MISSING_BUYER_CUIT'
  | 'MISSING_FISCAL_RAZON_SOCIAL'
  | 'MISSING_FISCAL_CONDICION_IMPOSITIVA';

export type InvoiceClientIssueSource =
  'flokzu' | 'tus_facturas' | 'xubio' | 'invoice_api' | 'manual';

export type InvoiceClientIssueStatus = 'open' | 'resolved' | 'ignored';

export interface InvoiceClientIssue {
  id?: number;
  key?: string;
  tlqvCode: string;
  reason: InvoiceClientIssueReason;
  source: InvoiceClientIssueSource;
  status?: InvoiceClientIssueStatus;
  severity?: string | null;
  saleNumber?: string | null;
  buyerName?: string | null;
  email?: string | null;
  cuit?: string | null;
  documentoTipo?: string | null;
  documentoNro?: string | null;
  documentoNroDigits?: string | null;
  message: string;
  messages: string[];
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  rawPayload?: unknown;
  metadata?: unknown;
}

export interface UpsertInvoiceClientIssueCommand {
  tlqvCode: string;
  reason: InvoiceClientIssueReason;
  source: InvoiceClientIssueSource;
  saleNumber?: string | null;
  buyerName?: string | null;
  email?: string | null;
  cuit?: string | null;
  documentoTipo?: string | null;
  message: string;
  messages?: string[];
  rawPayload?: unknown;
  metadata?: unknown;
  now: Date;
}

export interface InvoiceClientIssueSnapshot {
  items: InvoiceClientIssue[];
}

export interface GetInvoiceClientIssueSnapshotCommand {
  reason?: InvoiceClientIssueReason;
  status?: InvoiceClientIssueStatus;
  limit?: number;
}

export interface GetInvoiceClientIssueByTlqvCodeCommand {
  tlqvCode: string;
}

export interface GetInvoiceClientIssueByTlqvCodeResponse {
  items: InvoiceClientIssue[];
}
