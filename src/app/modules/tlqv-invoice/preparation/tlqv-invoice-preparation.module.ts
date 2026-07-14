import { Module } from '@nestjs/common';
import { TlqvInvoicePreparationService } from '../../../services/tlqv-invoice-preparation.service';
import { StockBueTlqvCacheModule } from '../../stock-bue/cache/stock-bue-tlqv-cache.module';
import { prepareTlqvInvoiceInteractorProvider } from './tlqv-invoice-preparation.providers';

@Module({
  imports: [StockBueTlqvCacheModule],
  providers: [
    prepareTlqvInvoiceInteractorProvider,
    TlqvInvoicePreparationService,
  ],
  exports: [TlqvInvoicePreparationService],
})
export class TlqvInvoicePreparationModule {}
