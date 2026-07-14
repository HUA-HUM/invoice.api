import { Module } from '@nestjs/common';
import { StockBueTlqvAuditService } from '../../services/stock-bue-tlqv-audit.service';
import { StockBueTlqvCacheRefreshQueueService } from '../../services/stock-bue-tlqv-cache-refresh-queue.service';
import { StockBueTlqvCacheRefreshService } from '../../services/stock-bue-tlqv-cache-refresh.service';
import { RedisInfrastructureModule } from '../shared/redis/redis-infrastructure.module';
import { StockBueTlqvCacheModule } from './cache/stock-bue-tlqv-cache.module';
import { stockBueInteractorProviders } from './stock-bue.providers';

@Module({
  imports: [RedisInfrastructureModule, StockBueTlqvCacheModule],
  providers: [
    ...stockBueInteractorProviders,
    StockBueTlqvAuditService,
    StockBueTlqvCacheRefreshService,
    StockBueTlqvCacheRefreshQueueService,
  ],
  exports: [
    StockBueTlqvAuditService,
    StockBueTlqvCacheRefreshService,
    StockBueTlqvCacheRefreshQueueService,
  ],
})
export class StockBueModule {}
