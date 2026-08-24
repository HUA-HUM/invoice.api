import { Module } from '@nestjs/common';
import { TlqvInvoicePreparationService } from '../../../services/tlqv-invoice-preparation.service';
import { prepareTlqvInvoiceInteractorProvider } from './tlqv-invoice-preparation.providers';

@Module({
  providers: [
    prepareTlqvInvoiceInteractorProvider,
    TlqvInvoicePreparationService,
  ],
  exports: [TlqvInvoicePreparationService],
})
export class TlqvInvoicePreparationModule {}
