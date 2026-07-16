import { Module } from '@nestjs/common';
import { TlqvInvoiceDocumentsController } from '../../../controllers/tlqv-invoice-documents.controller';
import { TlqvInvoiceDocumentsCdnQueueService } from '../../../services/tlqv-invoice-documents-cdn-queue.service';
import { TlqvInvoiceDocumentsPdfService } from '../../../services/tlqv-invoice-documents-pdf.service';
import { TlqvInvoiceDocumentsService } from '../../../services/tlqv-invoice-documents.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import { RedisInfrastructureModule } from '../../shared/redis/redis-infrastructure.module';
import { tlqvInvoiceDocumentsProviders } from './tlqv-invoice-documents.providers';

@Module({
  imports: [InternalAuthModule, RedisInfrastructureModule],
  controllers: [TlqvInvoiceDocumentsController],
  providers: [
    ...tlqvInvoiceDocumentsProviders,
    TlqvInvoiceDocumentsCdnQueueService,
    TlqvInvoiceDocumentsPdfService,
    TlqvInvoiceDocumentsService,
  ],
  exports: [TlqvInvoiceDocumentsService, TlqvInvoiceDocumentsCdnQueueService],
})
export class TlqvInvoiceDocumentsModule {}
