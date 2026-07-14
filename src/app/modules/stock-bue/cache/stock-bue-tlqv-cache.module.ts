import { Module } from '@nestjs/common';
import { StockBueTlqvCacheManagerRepository } from '../../../drivers/cache/stock-bue/stock-bue-tlqv-cache-manager.repository';

@Module({
  providers: [StockBueTlqvCacheManagerRepository],
  exports: [StockBueTlqvCacheManagerRepository],
})
export class StockBueTlqvCacheModule {}
