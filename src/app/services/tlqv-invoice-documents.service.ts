import { Inject, Injectable } from '@nestjs/common';
import type { GenerateTlqvInvoiceDocumentsInteractor } from '../../core/interactors/tlqv/GenerateTlqvInvoiceDocumentsInteractor';
import { TlqvInvoiceDocumentsPdfService } from './tlqv-invoice-documents-pdf.service';
import { GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR } from '../modules/tlqv-invoice/documents/tlqv-invoice-documents.providers';

export interface TlqvInvoiceDocumentsPdfResult {
  filename: string;
  buffer: Buffer;
}

@Injectable()
export class TlqvInvoiceDocumentsService {
  constructor(
    @Inject(GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR)
    private readonly interactor: GenerateTlqvInvoiceDocumentsInteractor,
    private readonly pdfService: TlqvInvoiceDocumentsPdfService,
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
}
