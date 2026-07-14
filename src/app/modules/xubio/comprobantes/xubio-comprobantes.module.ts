import { Module } from '@nestjs/common';
import { XubioComprobantesBackfillQueueService } from '../../../services/xubio-comprobantes-backfill-queue.service';
import { XubioComprobantesBackfillService } from '../../../services/xubio-comprobantes-backfill.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import { RedisInfrastructureModule } from '../../shared/redis/redis-infrastructure.module';
import { StockBueModule } from '../../stock-bue/stock-bue.module';
import { TlqvInvoicePreparationModule } from '../../tlqv-invoice/preparation/tlqv-invoice-preparation.module';
import { StockBueTlqvController } from './controllers/stock-bue-tlqv.controller';
import { TlqvInvoicePreparationController } from './controllers/tlqv-invoice-preparation.controller';
import { XubioComprobantesBackfillController } from './controllers/xubio-comprobantes-backfill.controller';
import { xubioComprobantesProviders } from './xubio-comprobantes.providers';

@Module({
  imports: [
    InternalAuthModule,
    RedisInfrastructureModule,
    StockBueModule,
    TlqvInvoicePreparationModule,
  ],
  controllers: [
    StockBueTlqvController,
    TlqvInvoicePreparationController,
    XubioComprobantesBackfillController,
  ],
  providers: [
    ...xubioComprobantesProviders,
    XubioComprobantesBackfillService,
    XubioComprobantesBackfillQueueService,
  ],
  exports: [
    XubioComprobantesBackfillService,
    XubioComprobantesBackfillQueueService,
  ],
})
export class XubioComprobantesModule {}
