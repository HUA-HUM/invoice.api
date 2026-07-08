import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '../controllers/app.controller';
import { TlqvInvoiceClientesController } from '../controllers/tlqv-invoice-clientes.controller';
import { TlqvInvoiceIssuesController } from '../controllers/tlqv-invoice-issues.controller';
import { TusFacturasController } from '../controllers/tus-facturas.controller';
import { XubioClientesController } from '../controllers/xubio-clientes.controller';
import { XubioComprobantesController } from '../controllers/xubio-comprobantes.controller';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { AppService } from '../services/app.service';
import { RedisConnectionOptionsFactory } from '../services/redis/redis-connection-options.factory';
import { StockBueTlqvCacheRefreshQueueService } from '../services/stock-bue-tlqv-cache-refresh-queue.service';
import { StockBueTlqvCacheRefreshService } from '../services/stock-bue-tlqv-cache-refresh.service';
import { StockBueTlqvAuditService } from '../services/stock-bue-tlqv-audit.service';
import { TlqvInvoiceClientesService } from '../services/tlqv-invoice-clientes.service';
import { TlqvInvoiceIssuesService } from '../services/tlqv-invoice-issues.service';
import { TlqvInvoicePreparationService } from '../services/tlqv-invoice-preparation.service';
import { TusFacturasAfipInfoService } from '../services/tus-facturas-afip-info.service';
import { XubioClientesService } from '../services/xubio-clientes.service';
import { XubioComprobantesBackfillQueueService } from '../services/xubio-comprobantes-backfill-queue.service';
import { XubioComprobantesBackfillService } from '../services/xubio-comprobantes-backfill.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [
    AppController,
    TlqvInvoiceClientesController,
    TlqvInvoiceIssuesController,
    TusFacturasController,
    XubioClientesController,
    XubioComprobantesController,
  ],
  providers: [
    AppService,
    InternalApiKeyGuard,
    RedisConnectionOptionsFactory,
    StockBueTlqvCacheRefreshService,
    StockBueTlqvCacheRefreshQueueService,
    StockBueTlqvAuditService,
    TlqvInvoiceClientesService,
    TlqvInvoiceIssuesService,
    TlqvInvoicePreparationService,
    TusFacturasAfipInfoService,
    XubioClientesService,
    XubioComprobantesBackfillService,
    XubioComprobantesBackfillQueueService,
  ],
})
export class AppModule {}
