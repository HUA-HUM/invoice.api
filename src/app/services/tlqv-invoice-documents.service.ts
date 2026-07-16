import { Inject, Injectable } from '@nestjs/common';
import type { IInvoiceDocumentStorageRepository } from '../../core/adapters/repositories/invoice/documents/IInvoiceDocumentStorageRepository';
import type { GenerateTlqvInvoiceDocumentsInteractor } from '../../core/interactors/tlqv/GenerateTlqvInvoiceDocumentsInteractor';
import { TlqvInvoiceDocumentsPdfService } from './tlqv-invoice-documents-pdf.service';
import {
  GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR,
  INVOICE_DOCUMENT_STORAGE_REPOSITORY,
} from '../modules/tlqv-invoice/documents/tlqv-invoice-documents.providers';

export interface TlqvInvoiceDocumentsPdfResult {
  filename: string;
  buffer: Buffer;
}

export type TlqvInvoiceDocumentsCdnStatus = 'already_exists' | 'created';

export interface TlqvInvoiceDocumentsCdnResult {
  status: TlqvInvoiceDocumentsCdnStatus;
  tlqvCode: string;
  filename: string;
  cdnKey: string;
  cdnUrl: string;
  contentLength?: number | null;
  eTag?: string | null;
  lastModified?: Date | null;
}

@Injectable()
export class TlqvInvoiceDocumentsService {
  constructor(
    @Inject(GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR)
    private readonly interactor: GenerateTlqvInvoiceDocumentsInteractor,
    private readonly pdfService: TlqvInvoiceDocumentsPdfService,
    @Inject(INVOICE_DOCUMENT_STORAGE_REPOSITORY)
    private readonly storageRepository: IInvoiceDocumentStorageRepository,
  ) {}

  async generateCombinedPdf(
    tlqvCode: string,
  ): Promise<TlqvInvoiceDocumentsPdfResult> {
    const data = await this.interactor.execute({ tlqvCode });
    const buffer = await this.pdfService.generateCombinedPdf(data);
    const documentName =
      data.orderDetails != null && data.catalogProductDetails != null
        ? 'factura-remito'
        : 'factura';

    return {
      filename: `${data.tlqvCode}-${documentName}.pdf`,
      buffer,
    };
  }

  async getExistingCdnPdf(
    tlqvCode: string,
  ): Promise<TlqvInvoiceDocumentsCdnResult | null> {
    const normalizedTlqvCode = normalizeTlqvCode(tlqvCode);
    const existing =
      await this.storageRepository.findExistingByTlqvCode(normalizedTlqvCode);

    if (existing === null) {
      return null;
    }

    return {
      status: 'already_exists',
      tlqvCode: normalizedTlqvCode,
      filename: buildDownloadFilename(normalizedTlqvCode, existing.key),
      cdnKey: existing.key,
      cdnUrl: existing.url,
      contentLength: existing.contentLength,
      eTag: existing.eTag,
      lastModified: existing.lastModified,
    };
  }

  async getOrCreateCdnPdf(
    tlqvCode: string,
  ): Promise<TlqvInvoiceDocumentsCdnResult> {
    const normalizedTlqvCode = normalizeTlqvCode(tlqvCode);
    const existing = await this.getExistingCdnPdf(normalizedTlqvCode);
    if (existing !== null) {
      return existing;
    }

    const pdf = await this.generateCombinedPdf(normalizedTlqvCode);
    const cdnKey = this.storageRepository.buildTlqvDocumentKey(
      normalizedTlqvCode,
      pdf.filename.replace(`${normalizedTlqvCode}-`, ''),
    );
    const uploaded = await this.storageRepository.upload({
      key: cdnKey,
      filename: pdf.filename,
      contentType: 'application/pdf',
      body: pdf.buffer,
    });

    return {
      status: 'created',
      tlqvCode: normalizedTlqvCode,
      filename: pdf.filename,
      cdnKey: uploaded.key,
      cdnUrl: uploaded.url,
      contentLength: uploaded.contentLength,
      eTag: uploaded.eTag,
      lastModified: uploaded.lastModified,
    };
  }
}

function normalizeTlqvCode(value: string): string {
  const trimmedValue = value.trim().toUpperCase();
  const match = /^TLQV\s*-?\s*(\d+)$/.exec(trimmedValue);
  if (match === null) {
    throw new RangeError('tlqvCode must use TLQV-123 format');
  }

  return `TLQV-${Number(match[1])}`;
}

function getFilenameFromKey(key: string): string {
  return key.split('/').at(-1) ?? key;
}

function buildDownloadFilename(tlqvCode: string, key: string): string {
  const filename = getFilenameFromKey(key);
  return filename.startsWith(`${tlqvCode}-`)
    ? filename
    : `${tlqvCode}-${filename}`;
}
