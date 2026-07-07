import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '../controllers/app.controller';
import { XubioComprobantesController } from '../controllers/xubio-comprobantes.controller';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { AppService } from '../services/app.service';
import { RedisConnectionOptionsFactory } from '../services/redis/redis-connection-options.factory';
import { StockBueTlqvCacheRefreshQueueService } from '../services/stock-bue-tlqv-cache-refresh-queue.service';
import { StockBueTlqvCacheRefreshService } from '../services/stock-bue-tlqv-cache-refresh.service';
import { StockBueTlqvAuditService } from '../services/stock-bue-tlqv-audit.service';
import { XubioComprobantesBackfillQueueService } from '../services/xubio-comprobantes-backfill-queue.service';
import { XubioComprobantesBackfillService } from '../services/xubio-comprobantes-backfill.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, XubioComprobantesController],
  providers: [
    AppService,
    InternalApiKeyGuard,
    RedisConnectionOptionsFactory,
    StockBueTlqvCacheRefreshService,
    StockBueTlqvCacheRefreshQueueService,
    StockBueTlqvAuditService,
    XubioComprobantesBackfillService,
    XubioComprobantesBackfillQueueService,
  ],
})
export class AppModule {}
