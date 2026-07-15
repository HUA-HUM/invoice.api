import { Module } from '@nestjs/common';
import { TlqvInvoiceDocumentsController } from '../../../controllers/tlqv-invoice-documents.controller';
import { TlqvInvoiceDocumentsPdfService } from '../../../services/tlqv-invoice-documents-pdf.service';
import { TlqvInvoiceDocumentsService } from '../../../services/tlqv-invoice-documents.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import { tlqvInvoiceDocumentsProviders } from './tlqv-invoice-documents.providers';

@Module({
  imports: [InternalAuthModule],
  controllers: [TlqvInvoiceDocumentsController],
  providers: [
    ...tlqvInvoiceDocumentsProviders,
    TlqvInvoiceDocumentsPdfService,
    TlqvInvoiceDocumentsService,
  ],
  exports: [TlqvInvoiceDocumentsService],
})
export class TlqvInvoiceDocumentsModule {}
